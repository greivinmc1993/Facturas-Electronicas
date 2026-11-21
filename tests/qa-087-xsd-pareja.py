#!/usr/bin/env python3
"""Valida XML FE/TE 4.4 con XSD locales suministrados por el operador.

No obtiene documentos de la red. No presupone que un esquema llamado 'oficial'
provenga de Hacienda ni que esté actualizado. No realiza firma ni envío.

Ejemplo:
  python tests/qa-087-xsd-pareja.py --schema-dir /ruta/xsd --fe-xml factura.xml --te-xml tiquete.xml
  python tests/qa-087-xsd-pareja.py --self-test
"""
import argparse
import hashlib
import json
import sys
import tempfile
from pathlib import Path
from lxml import etree

NAMESPACE = 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/'
TYPES = {
    'FE': ('FacturaElectronica', 'facturaElectronica', 'FacturaElectronica_V4.4.xsd'),
    'TE': ('TiqueteElectronico', 'tiqueteElectronico', 'TiqueteElectronico_V4.4.xsd'),
}
MAX_FILE = 8 * 1024 * 1024


def parse_safe(path):
    path = Path(path)
    if not path.is_file() or not 0 < path.stat().st_size <= MAX_FILE:
        raise ValueError('Falta un archivo XSD/XML o supera el tamaño permitido (8 MB).')
    parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False,
                             huge_tree=False, remove_comments=False)
    doc = etree.parse(str(path), parser)
    if doc.docinfo.doctype:
        raise ValueError('DOCTYPE y DTD no se admiten en esta prueba.')
    return doc


def check_pair(kind, schema_path, xml_path):
    root_name, namespace_name, _ = TYPES[kind]
    expected = NAMESPACE + namespace_name
    schema_path, xml_path = Path(schema_path), Path(xml_path)
    schema_doc = parse_safe(schema_path)
    xml_doc = parse_safe(xml_path)
    if schema_doc.getroot().get('targetNamespace') != expected:
        raise ValueError(f'El XSD {kind} no declara el namespace FE44 esperado: {expected}')
    if xml_doc.getroot().tag != f'{{{expected}}}{root_name}':
        raise ValueError(f'El XML no tiene la raíz {root_name} y namespace esperados para {kind}.')
    schema = etree.XMLSchema(schema_doc)
    valid = schema.validate(xml_doc)
    return {
        'documentType': kind,
        'validWithSuppliedSchema': valid,
        'schemaStatus': 'LOCAL_SCHEMA_NOT_PROVEN_TO_BE_LATEST_OFFICIAL',
        'schemaFile': schema_path.name,
        'schemaSHA256': hashlib.sha256(schema_path.read_bytes()).hexdigest(),
        'xmlFile': xml_path.name,
        'errors': [{'line': item.line, 'column': item.column, 'field': item.path,
                    'message': item.message} for item in list(schema.error_log)[:40]],
    }


def self_test():
    with tempfile.TemporaryDirectory() as temp:
        temp = Path(temp)
        checks = 0
        for kind, (root, namespace, filename) in TYPES.items():
            ns = NAMESPACE + namespace
            xsd = temp / filename
            xsd.write_text(f'<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="{ns}" elementFormDefault="qualified"><xs:element name="{root}" type="xs:integer"/></xs:schema>', encoding='utf-8')
            xml = temp / (kind + '.xml')
            xml.write_text(f'<{root} xmlns="{ns}">100</{root}>', encoding='utf-8')
            assert check_pair(kind, xsd, xml)['validWithSuppliedSchema']
            checks += 1
            xml.write_text(f'<{root} xmlns="{ns}">abc</{root}>', encoding='utf-8')
            assert not check_pair(kind, xsd, xml)['validWithSuppliedSchema']
            checks += 1
            xml.write_text(f'<{root} xmlns="{NAMESPACE}otro">100</{root}>', encoding='utf-8')
            try:
                check_pair(kind, xsd, xml)
                raise AssertionError('No se rechazó un namespace incorrecto')
            except ValueError:
                pass
            checks += 1
        print(f'QA XSD FE/TE: {checks}/{checks} con esquemas sintéticos. NO son XSD oficiales.')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--schema-dir')
    parser.add_argument('--fe-xml')
    parser.add_argument('--te-xml')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.schema_dir or not args.fe_xml or not args.te_xml:
        print('SIN VALIDACIÓN XSD OFICIAL: aporta --schema-dir, --fe-xml y --te-xml. Los XSD deben provenir del portal de Hacienda.', file=sys.stderr)
        return 2
    schema_dir = Path(args.schema_dir)
    try:
        results = [check_pair(kind, schema_dir / TYPES[kind][2], xml)
                   for kind, xml in [('FE', args.fe_xml), ('TE', args.te_xml)]]
        print(json.dumps({'reports': results, 'caution': 'La comprobación de origen y vigencia oficial requiere verificación separada.'}, ensure_ascii=False, indent=2))
        return 0 if all(r['validWithSuppliedSchema'] for r in results) else 1
    except (ValueError, OSError, etree.XMLSyntaxError, etree.XMLSchemaParseError) as err:
        print(json.dumps({'schemaStatus': 'CANNOT_VALIDATE', 'error': str(err)}, ensure_ascii=False))
        return 2


if __name__ == '__main__':
    sys.exit(main())
