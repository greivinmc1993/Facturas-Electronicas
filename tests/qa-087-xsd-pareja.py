#!/usr/bin/env python3
"""FacturaCR v0.6.89: QA estricto de XSD v4.4 locales (no transmite ni firma).

Validación de XML aportados por el operador contra sus XSD locales.
NO garantiza que los XSD procedan de Hacienda, que estén vigentes ni
que un comprobante sea fiscalmente válido. No altera XML ni SQLite.

Ejemplos:
  python tests/qa-087-xsd-pareja.py --self-test
  python tests/qa-087-xsd-pareja.py --schema-dir XSD --fe-xml FE.xml --te-xml TE.xml
  python tests/qa-087-xsd-pareja.py --schema-dir XSD/2026/v4.4 --schema-root XSD --fe-xml FE.xml
"""
import argparse
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

try:
    from lxml import etree
except ImportError:
    print('Falta lxml. En MSYS2 UCRT64 instala mingw-w64-ucrt-x86_64-python-lxml con pacman; '
          'en Python convencional usa python -m pip install lxml.', file=sys.stderr)
    sys.exit(2)

NAMESPACE = 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/'
TYPES = {
    'FE': ('FacturaElectronica', 'facturaElectronica', 'FacturaElectronica_V4.4.xsd'),
    'TE': ('TiqueteElectronico', 'tiqueteElectronico', 'TiqueteElectronico_V4.4.xsd'),
    'NC': ('NotaCreditoElectronica', 'notaCreditoElectronica', 'NotaCreditoElectronica_V4.4.xsd'),
    'ND': ('NotaDebitoElectronica', 'notaDebitoElectronica', 'NotaDebitoElectronica_V4.4.xsd'),
}
MAX_FILE = 8 * 1024 * 1024
MAX_DEPENDENCIES = 32
XSD_NAMESPACE = '{http://www.w3.org/2001/XMLSchema}'
XMLDSIG_NAMESPACE = 'http://www.w3.org/2000/09/xmldsig#'
XMLDSIG_IMPORT = '../../xmldsig-core-schema.xsd'
XMLDSIG_FILE = 'xmldsig-core-schema.xsd'


class ValidationInputError(ValueError):
    """Error de archivos, formato o cadena XSD: no se valida como aprobado."""


def inside(path, root):
    resolved = Path(path).resolve(strict=False)
    return resolved == root or root in resolved.parents


def require_file(path, *, kind):
    path = Path(path)
    if not path.is_file() or not 0 < path.stat().st_size <= MAX_FILE:
        raise ValidationInputError(f'No existe {kind} o supera 8 MB: {path.name}')
    return path


def parse_safe(path):
    """Parseo sin red ni entidades externas. Se admite SOLO el DOCTYPE W3C del XSD XMLDSIG."""
    require_file(path, kind='XML/XSD')
    parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False,
                             huge_tree=False, remove_comments=False)
    try:
        document = etree.parse(str(path), parser)
    except etree.XMLSyntaxError as error:
        raise ValidationInputError(f'XML/XSD mal formado ({Path(path).name}): {error}') from error
    doctype = document.docinfo.doctype
    if doctype:
        sig_doctype = ('<!DOCTYPE schema PUBLIC "-//W3C//DTD XMLSchema 200102//EN" '
                       '"http://www.w3.org/2001/XMLSchema.dtd">')
        is_w3c_dsig = (Path(path).name == XMLDSIG_FILE and doctype == sig_doctype and
                        document.getroot().get('targetNamespace') == XMLDSIG_NAMESPACE)
        if not is_w3c_dsig:
            raise ValidationInputError(f'DOCTYPE/DTD no permitido en {Path(path).name}.')
    return document


def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def resolve_local_import(current, element, root):
    """Resolución local estricta; solo XMLDSIG puede mapearse a un archivo hermano."""
    location = element.get('schemaLocation')
    tag = etree.QName(element).localname
    if not location:
        raise ValidationInputError(f'La dependencia {tag} carece de schemaLocation.')
    uri = urlsplit(location)
    if (uri.scheme or uri.netloc or uri.query or uri.fragment or
            location.startswith(('/', '\\')) or ':' in location or '\\' in location):
        raise ValidationInputError(f'Dependencia XSD externa o no local: {location}')
    requested = (current.parent / location).resolve()
    if inside(requested, root):
        return requested, requested
    if (location == XMLDSIG_IMPORT and tag == 'import' and
            element.get('namespace') == XMLDSIG_NAMESPACE):
        local = (current.parent / XMLDSIG_FILE).resolve()
        if not inside(local, root):
            raise ValidationInputError('Archivo XMLDSIG fuera de la carpeta autorizada.')
        if not local.is_file():
            raise ValidationInputError(
                f'Falta {XMLDSIG_FILE}. Descárgalo de una fuente confiable y '
                'colócalo junto a los XSD 4.4, en la carpeta que seleccionaste. '
                'No se permite leer ../../ fuera de esa carpeta.')
        return requested, local
    raise ValidationInputError(f'Dependencia XSD fuera de --schema-root: {location}')


def check_dependencies(schema_path, schema_root):
    """Verifica todos los XSD accesibles antes de compilar, sin ampliar la raíz de confianza."""
    root = Path(schema_root).resolve()
    queue = [Path(schema_path).resolve()]
    seen = set()
    redirects = {}
    while queue:
        current = queue.pop()
        if not inside(current, root):
            raise ValidationInputError('XSD fuera del directorio de confianza (--schema-root).')
        if current in seen:
            continue
        if len(seen) >= MAX_DEPENDENCIES:
            raise ValidationInputError('Demasiadas dependencias XSD (límite: 32).')
        doc = parse_safe(current)
        if doc.getroot().tag != XSD_NAMESPACE + 'schema':
            raise ValidationInputError(f'La dependencia no es un esquema XSD: {current.name}')
        seen.add(current)
        for tag in ('include', 'import', 'redefine', 'override'):
            for element in doc.getroot().iter(XSD_NAMESPACE + tag):
                requested, dependent = resolve_local_import(current, element, root)
                require_file(dependent, kind='dependencia XSD')
                if requested != dependent:
                    if requested in redirects and redirects[requested] != dependent:
                        raise ValidationInputError('Conflicto de dependencia XMLDSIG local.')
                    redirects[requested] = dependent
                queue.append(dependent)
    return sorted(seen), redirects


class SchemaRootResolver(etree.Resolver):
    """Nunca consulta disco fuera del conjunto de archivos previamente autorizados."""

    def __init__(self, allowed, redirects):
        super().__init__()
        self.allowed = set(allowed)
        self.redirects = redirects

    def resolve(self, url, pubid, context):
        # Lxml normaliza el import relativo ../../ a una ruta absoluta.
        # Se acepta únicamente si la inspección previa autorizó ese destino.
        uri = urlsplit(url)
        windows_drive = (os.name == 'nt' and len(url) >= 3 and
                         url[1] == ':' and url[2] in ('/', '\\'))
        if (uri.scheme not in ('', 'file') and not windows_drive) or uri.netloc or uri.query or uri.fragment:
            raise ValidationInputError('Intento de abrir una dependencia XSD externa.')
        if uri.scheme == 'file':
            from urllib.parse import unquote
            local_path = unquote(uri.path)
            if os.name == 'nt' and local_path.startswith('/') and len(local_path) > 2 and local_path[2] == ':':
                local_path = local_path[1:]
            candidate = Path(local_path).resolve()
        else:
            candidate = Path(url).resolve()
        chosen = self.redirects.get(candidate, candidate)
        if chosen not in self.allowed:
            raise ValidationInputError('Dependencia XSD no autorizada durante la compilación.')
        return self.resolve_filename(str(chosen), context)


def check_pair(kind, schema_path, xml_path, schema_root=None, expected_hashes=None):
    if kind not in TYPES:
        raise ValidationInputError('Tipo de documento no permitido.')
    expected_name, ns_name, _ = TYPES[kind]
    namespace = NAMESPACE + ns_name
    schema_path, xml_path = Path(schema_path), Path(xml_path)
    root = Path(schema_root or schema_path.parent).resolve()
    dependencies, redirects = check_dependencies(schema_path, root)
    # La compilación conserva el XSD original sin editarlo, con un resolver aislado.
    parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False,
                             huge_tree=False, remove_comments=False)
    parser.resolvers.add(SchemaRootResolver(dependencies, redirects))
    schema_doc = etree.parse(str(schema_path), parser)
    xml_doc = parse_safe(xml_path)
    if schema_doc.getroot().get('targetNamespace') != namespace:
        raise ValidationInputError(f'El XSD {kind} no declara el namespace 4.4 esperado: {namespace}')
    if xml_doc.getroot().tag != f'{{{namespace}}}{expected_name}':
        raise ValidationInputError(f'El XML no tiene la raíz {expected_name} y namespace 4.4 esperados para {kind}.')
    hashes = {str(p.relative_to(root)).replace(os.sep, '/'): sha256_file(p) for p in dependencies}
    if expected_hashes is not None:
        for relative, actual in hashes.items():
            expected = expected_hashes.get(relative)
            if not isinstance(expected, str) or expected.lower() != actual:
                raise ValidationInputError(f'XSD ausente del manifiesto o SHA-256 incorrecto: {relative}')
    try:
        schema = etree.XMLSchema(schema_doc)
    except etree.XMLSchemaParseError as error:
        raise ValidationInputError(f'No se pudo compilar el XSD {kind}: {error}') from error
    valid = schema.validate(xml_doc)
    return {
        'documentType': kind,
        'validWithSuppliedSchema': valid,
        'schemaStatus': ('LOCAL_CHECKSUM_MATCHED_ORIGIN_NOT_VERIFIED' if expected_hashes is not None
                         else 'LOCAL_SCHEMA_ORIGIN_AND_VIGENCY_NOT_VERIFIED'),
        'schemaFile': schema_path.name,
        'schemaSHA256': sha256_file(schema_path),
        'xmlFile': xml_path.name,
        'xmlSHA256': sha256_file(xml_path),
        'dependenciesSHA256': hashes,
        'localXmlDsigMapping': bool(redirects),
        'errors': [{'line': e.line, 'column': e.column, 'field': e.path or '',
                    'message': e.message} for e in list(schema.error_log)[:40]],
    }


def self_test():
    checks = 0
    with tempfile.TemporaryDirectory() as folder:
        folder = Path(folder)
        schema_dir = folder / 'xsd'
        schema_dir.mkdir()
        for kind, (name, ns_name, filename) in TYPES.items():
            ns = NAMESPACE + ns_name
            xsd = schema_dir / filename
            xsd.write_text(
                f'<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" '
                f'targetNamespace="{ns}" elementFormDefault="qualified">'
                f'<xs:element name="{name}" type="xs:integer"/></xs:schema>', encoding='utf-8')
            xml = folder / f'{kind}.xml'
            xml.write_text(f'<{name} xmlns="{ns}">100</{name}>', encoding='utf-8')
            assert check_pair(kind, xsd, xml)['validWithSuppliedSchema']
            checks += 1
            xml.write_text(f'<{name} xmlns="{ns}">abc</{name}>', encoding='utf-8')
            report = check_pair(kind, xsd, xml)
            assert not report['validWithSuppliedSchema'] and report['errors'][0]['line'] > 0
            checks += 1
            xml.write_text(f'<{name} xmlns="{NAMESPACE}otro">100</{name}>', encoding='utf-8')
            try:
                check_pair(kind, xsd, xml)
                raise AssertionError('Namespace incorrecto no rechazado.')
            except ValidationInputError:
                checks += 1
            xml.write_text(f'<{name} xmlns="{ns}">100</{name}>', encoding='utf-8')
            # Un hash equivocado debe bloquear incluso una prueba que sería válida.
            try:
                check_pair(kind, xsd, xml, schema_root=schema_dir, expected_hashes={xsd.name: '0'*64})
                raise AssertionError('Hash alterado no rechazado.')
            except ValidationInputError:
                checks += 1
        # Las importaciones locales bajo una raíz de confianza son válidas.
        ns = NAMESPACE + 'facturaElectronica'
        common = schema_dir / 'common.xsd'
        common.write_text('<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" '
                          'targetNamespace="urn:common"><xs:simpleType name="Code">'
                          '<xs:restriction base="xs:integer"/></xs:simpleType></xs:schema>', encoding='utf-8')
        fe_schema = schema_dir / TYPES['FE'][2]
        fe_schema.write_text(f'<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" '
                             f'xmlns:c="urn:common" targetNamespace="{ns}" elementFormDefault="qualified">'
                             '<xs:import namespace="urn:common" schemaLocation="common.xsd"/>'
                             '<xs:element name="FacturaElectronica" type="c:Code"/></xs:schema>', encoding='utf-8')
        fe_xml = folder / 'FE.xml'
        assert check_pair('FE', fe_schema, fe_xml, schema_root=schema_dir)['validWithSuppliedSchema']
        checks += 1
        # Las dependencias importadas también deben coincidir con el manifiesto.
        manifest = {p.name: sha256_file(p) for p in (fe_schema, common)}
        signed = check_pair('FE', fe_schema, fe_xml, schema_root=schema_dir,
                            expected_hashes=manifest)
        assert signed['validWithSuppliedSchema'] and len(signed['dependenciesSHA256']) == 2
        checks += 1
        # Import habitual de Hacienda: ../../xmldsig-core-schema.xsd.
        # Mapeo seguro exclusivamente hacia el archivo local junto a los XSD.
        signature = schema_dir / XMLDSIG_FILE
        signature_body = ('<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" '
                          f'targetNamespace="{XMLDSIG_NAMESPACE}">'
                          '<xs:simpleType name="FirmaDemo"><xs:restriction base="xs:integer"/>'
                          '</xs:simpleType></xs:schema>')
        signature.write_text(signature_body, encoding='utf-8')
        fe_schema.write_text(f'<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" '
                             f'xmlns:ds="{XMLDSIG_NAMESPACE}" targetNamespace="{ns}" '
                             'elementFormDefault="qualified">'
                             '<xs:import namespace="http://www.w3.org/2000/09/xmldsig#" '
                             'schemaLocation="../../xmldsig-core-schema.xsd"/>'
                             '<xs:element name="FacturaElectronica" type="ds:FirmaDemo"/>'
                             '</xs:schema>', encoding='utf-8')
        result = check_pair('FE', fe_schema, fe_xml, schema_root=schema_dir)
        assert result['validWithSuppliedSchema'] and result['localXmlDsigMapping']
        assert XMLDSIG_FILE in result['dependenciesSHA256']
        checks += 1
        # Si falta la dependencia, el mensaje guía al usuario y nunca sale del directorio.
        signature.unlink()
        try:
            check_pair('FE', fe_schema, fe_xml, schema_root=schema_dir)
            raise AssertionError('Dependencia XMLDSIG faltante no rechazada.')
        except ValidationInputError as error:
            assert 'Falta xmldsig-core-schema.xsd' in str(error)
            checks += 1
        # El DOCTYPE estándar del esquema W3C no puede usarse para cargar DTD externos.
        signature.write_text('<?xml version="1.0"?>'
                             '<!DOCTYPE schema PUBLIC "-//W3C//DTD XMLSchema 200102//EN" '
                             '"http://www.w3.org/2001/XMLSchema.dtd" '
                             '[<!ENTITY dsig "http://www.w3.org/2000/09/xmldsig#">]>'
                             + signature_body, encoding='utf-8')
        assert check_pair('FE', fe_schema, fe_xml, schema_root=schema_dir)['validWithSuppliedSchema']
        checks += 1
        # Cualquier otro DOCTYPE, incluso dentro del archivo de firma, es rechazado.
        signature.write_text('<!DOCTYPE schema [<!ENTITY test SYSTEM "file:///secret">]>'
                             + signature_body, encoding='utf-8')
        try:
            check_pair('FE', fe_schema, fe_xml, schema_root=schema_dir)
            raise AssertionError('DTD no reconocido en XMLDSIG no rechazado.')
        except ValidationInputError:
            checks += 1
        signature.unlink()
        # El enlace relativo hacia un archivo externo a la raíz se rechaza.
        outside = folder / 'external.xsd'
        outside.write_text(common.read_text(encoding='utf-8'), encoding='utf-8')
        fe_schema.write_text(fe_schema.read_text(encoding='utf-8').replace('common.xsd', '../external.xsd'),
                             encoding='utf-8')
        try:
            check_pair('FE', fe_schema, fe_xml, schema_root=schema_dir)
            raise AssertionError('Travesía fuera de la raíz no rechazada.')
        except ValidationInputError:
            checks += 1
        # No se admiten dependencias externas ni entidades.
        fe_schema.write_text(f'<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" '
                             f'targetNamespace="{ns}"><xs:import namespace="urn:other" '
                             'schemaLocation="https://example.invalid/schema.xsd"/></xs:schema>', encoding='utf-8')
        try:
            check_pair('FE', fe_schema, fe_xml)
            raise AssertionError('Importación externa no rechazada.')
        except ValidationInputError:
            checks += 1
        fe_xml.write_text(f'<!DOCTYPE x [<!ENTITY leak SYSTEM "file:///etc/passwd">]>'
                          f'<FacturaElectronica xmlns="{ns}">100</FacturaElectronica>', encoding='utf-8')
        fe_schema.write_text(f'<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" '
                             f'targetNamespace="{ns}"><xs:element name="FacturaElectronica" '
                             'type="xs:integer"/></xs:schema>', encoding='utf-8')
        try:
            check_pair('FE', fe_schema, fe_xml)
            raise AssertionError('DTD no rechazado.')
        except ValidationInputError:
            checks += 1
    print(f'QA matriz XSD v4.4: {checks}/{checks} con esquemas SINTÉTICOS. NO son XSD oficiales.')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--schema-dir', help='Carpeta que contiene los XSD de cada documento.')
    parser.add_argument('--schema-root', help='Raíz autorizada para dependencias XSD locales; por defecto --schema-dir.')
    parser.add_argument('--fe-xml')
    parser.add_argument('--te-xml')
    parser.add_argument('--nc-xml')
    parser.add_argument('--nd-xml')
    parser.add_argument('--sha256-manifest', help='Archivo JSON de ruta relativa => SHA-256. Verifica integridad, NO origen oficial.')
    parser.add_argument('--json-out', help='Guardar informe JSON local; no modifica los XML originales.')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    selected = {k: value for k, value in [('FE', args.fe_xml), ('TE', args.te_xml),
                                          ('NC', args.nc_xml), ('ND', args.nd_xml)] if value}
    if not args.schema_dir or not selected:
        parser.error('Indica --schema-dir y al menos un XML (--fe-xml, --te-xml, --nc-xml o --nd-xml).')
    try:
        hashes = None
        if args.sha256_manifest:
            hashes = json.loads(require_file(args.sha256_manifest, kind='manifiesto').read_text(encoding='utf-8'))
            if not isinstance(hashes, dict):
                raise ValidationInputError('El manifiesto debe ser un objeto JSON de rutas a hashes SHA-256.')
        root = Path(args.schema_root or args.schema_dir).resolve()
        schema_dir = Path(args.schema_dir).resolve()
        if not inside(schema_dir, root):
            raise ValidationInputError('--schema-dir debe estar dentro de --schema-root.')
        reports = [check_pair(kind, schema_dir / TYPES[kind][2], source,
                              schema_root=root, expected_hashes=hashes)
                   for kind, source in selected.items()]
        result = {'reports': reports, 'caution':
                  'QA de estructura únicamente. XSD/manifest locales no prueban origen ni vigencia oficial. '
                  'No valida firma, claves, actividades, CABYS, autorización ni recepción en Hacienda.'}
        output = json.dumps(result, ensure_ascii=False, indent=2)
        if args.json_out:
            Path(args.json_out).write_text(output + '\n', encoding='utf-8')
        print(output)
        return 0 if all(item['validWithSuppliedSchema'] for item in reports) else 1
    except (ValidationInputError, OSError, UnicodeError, json.JSONDecodeError) as error:
        print(json.dumps({'schemaStatus': 'CANNOT_VALIDATE', 'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
