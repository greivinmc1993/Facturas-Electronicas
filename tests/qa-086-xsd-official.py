#!/usr/bin/env python3
"""Verifica XML contra un XSD LOCAL aportado por el operador; no descarga ni inventa esquemas.
No usa el certificado real ni permite enviar documentos. Python + lxml para QA independiente.
Uso: python tests/qa-086-xsd-official.py --schema ruta/FacturaElectronica_V4.4.xsd --xml ruta/borrador.xml
Con --self-test se comprueba el mecanismo con un esquema mínimo NO OFICIAL.
"""
import argparse
import json
import sys
import tempfile
from pathlib import Path

try:
    from lxml import etree
except ImportError:
    print('Instala Python lxml para esta prueba independiente: python -m pip install lxml', file=sys.stderr)
    sys.exit(2)

MAX_XML = 8 * 1024 * 1024
MAX_XSD = 8 * 1024 * 1024


def validate(schema_path, xml_path):
    schema_path, xml_path = Path(schema_path), Path(xml_path)
    if not schema_path.is_file() or not xml_path.is_file():
        raise ValueError('Falta un archivo XSD/XML. Debes obtener el esquema oficial por un canal confiable.')
    if schema_path.stat().st_size > MAX_XSD or xml_path.stat().st_size > MAX_XML:
        raise ValueError('Esquema o XML demasiado grande para este ensayo local.')
    parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False,
                             remove_comments=False, huge_tree=False)
    # Rechazo explícito: XML con DTD/entidades no pertenece a nuestro borrador.
    xml_document = etree.parse(str(xml_path), parser)
    if xml_document.docinfo.doctype:
        raise ValueError('XML con DOCTYPE/DTD rechazado.')
    schema_document = etree.parse(str(schema_path), parser)
    if schema_document.docinfo.doctype:
        raise ValueError('XSD con DOCTYPE/DTD rechazado.')
    schema = etree.XMLSchema(schema_document)
    valid = schema.validate(xml_document)
    errors = [{'line': e.line, 'column': e.column, 'message': e.message,
               'domain': e.domain_name, 'type': e.type_name}
              for e in list(schema.error_log)[:30]]
    return {'valid': bool(valid), 'source': str(xml_path.name), 'schema': str(schema_path.name),
            'schemaStatus': 'VALIDATED_USING_SUPPLIED_LOCAL_SCHEMA', 'errors': errors}


def self_test():
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        schema = d / 'TEST_NO_OFICIAL.xsd'
        schema.write_text('''<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="Demo" type="xs:integer" /></xs:schema>''', encoding='utf-8')
        xml = d / 'demo.xml'
        xml.write_text('<Demo>15</Demo>', encoding='utf-8')
        assert validate(schema, xml)['valid']
        xml.write_text('<Demo>no es numero</Demo>', encoding='utf-8')
        assert not validate(schema, xml)['valid']
        xml.write_text('<!DOCTYPE Demo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><Demo>&xxe;</Demo>', encoding='utf-8')
        try:
            validate(schema, xml)
            raise AssertionError('XML con DTD no fue rechazado')
        except (ValueError, etree.XMLSyntaxError):
            pass
    print('QA XMLSchema independiente: 3/3 ensayos aprobados con esquema interno NO OFICIAL.')


def main():
    args = argparse.ArgumentParser(description='Validar un XML local con un XSD entregado explícitamente.')
    args.add_argument('--schema')
    args.add_argument('--xml')
    args.add_argument('--self-test', action='store_true')
    args = args.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.schema or not args.xml:
        print('No se suministró XSD oficial. Estado: SIN VALIDACIÓN XSD.', file=sys.stderr)
        return 2
    try:
        result = validate(args.schema, args.xml)
    except (ValueError, etree.XMLSyntaxError, etree.XMLSchemaParseError, OSError) as e:
        print(json.dumps({'valid': False, 'schemaStatus': 'CANNOT_VALIDATE', 'error': str(e)}, ensure_ascii=False, indent=2))
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['valid'] else 1


if __name__ == '__main__':
    sys.exit(main())
