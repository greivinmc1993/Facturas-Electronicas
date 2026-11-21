#!/usr/bin/env python3
"""Regresión sintética del diagnóstico previo a la firma (NO fiscal)."""
import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path

MOD = Path(__file__).with_name('qa-087-xsd-pareja.py')
spec = importlib.util.spec_from_file_location('facturacr_xsd_qa', MOD)
xsd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(xsd)
checks = 0

def check(condition, message):
    global checks
    assert condition, message
    checks += 1
    print('OK XSD pre-firma:', message)

with tempfile.TemporaryDirectory(prefix='facturacr-qa-091-') as dir_name:
    folder = Path(dir_name)
    xsdfile = folder / xsd.XMLDSIG_FILE
    xsdfile.write_text(f'<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" '
                       f'targetNamespace="{xsd.XMLDSIG_NAMESPACE}" elementFormDefault="qualified">'
                       '<xs:element name="Signature" type="xs:string"/></xs:schema>', encoding='utf-8')
    for doc_type in ('FE', 'TE'):
        root, ns, schema_name = xsd.TYPES[doc_type]
        namespace = xsd.NAMESPACE+ns
        schema = folder / schema_name
        def set_schema(require_sig=True):
            schema.write_text(f'<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" '
                              f'xmlns:ds="{xsd.XMLDSIG_NAMESPACE}" targetNamespace="{namespace}" '
                              'elementFormDefault="qualified">'
                              '<xs:import namespace="http://www.w3.org/2000/09/xmldsig#" '
                              'schemaLocation="../../xmldsig-core-schema.xsd"/>'
                              f'<xs:element name="{root}"><xs:complexType><xs:sequence>'
                              '<xs:element name="Clave" type="xs:integer"/>'
                              + ('<xs:element ref="ds:Signature"/>' if require_sig else '')
                              + '</xs:sequence></xs:complexType></xs:element></xs:schema>', encoding='utf-8')
        xmlfile=folder / f'{doc_type}.xml'
        def doc(clave='123', trailing=''):
            return f'<{root} xmlns="{namespace}" xmlns:ds="{xsd.XMLDSIG_NAMESPACE}"><Clave>{clave}</Clave>{trailing}</{root}>'
        def inspect(xml):
            xmlfile.write_text(xml,encoding='utf-8')
            return xsd.check_pair(doc_type,schema,xmlfile,schema_root=folder)
        set_schema()
        unsigned=doc()
        result=inspect(unsigned)
        check(not result['validWithSuppliedSchema'] and result['preSignature']['status']=='ONLY_SIGNATURE_PENDING' and result['preSignature']['onlySignatureMissing'],f'{doc_type}: único error esperado ds:Signature (sin falso aprobado)')
        check(len(result['errors'])==1 and 'Signature' in result['errors'][0]['message'],f'{doc_type}: conserva el error XSD original por línea')
        check(xmlfile.read_text(encoding='utf-8')==unsigned,f'{doc_type}: no modifica el XML sin firma')
        bad=inspect(doc('inválido'))
        check(not bad['validWithSuppliedSchema'] and bad['preSignature']['status']=='OTHER_XSD_ERRORS',f'{doc_type}: errores de datos no se ocultan con firma faltante')
        missing=inspect(f'<{root} xmlns="{namespace}"></{root}>')
        check(missing['preSignature']['status']=='OTHER_XSD_ERRORS',f'{doc_type}: campos obligatorios no se confunden con firma')
        signed=inspect(doc(trailing='<ds:Signature>SOLO DEMOSTRACION</ds:Signature>'))
        check(signed['validWithSuppliedSchema'] and signed['preSignature']['status']=='SIGNATURE_PRESENT',f'{doc_type}: presencia no certifica firma criptográfica')
        set_schema(False)
        no_sig_required=inspect(unsigned)
        check(no_sig_required['validWithSuppliedSchema'] and no_sig_required['preSignature']['status']=='NO_OTHER_XSD_ERRORS_DETECTED',f'{doc_type}: XSD acepta borrador sin firma, mensaje lo distingue')
        set_schema()
        malformed_sig=inspect(doc(trailing='<Signature>SOLO DEMOSTRACION</Signature>'))
        check(not malformed_sig['validWithSuppliedSchema'] and malformed_sig['preSignature']['status']=='OTHER_XSD_ERRORS',f'{doc_type}: etiqueta de firma en espacio de nombres incorrecto se rechaza')
        # El CLI mantiene exit 1 si solo falta la firma: no se relaja la validez XSD.
        xmlfile.write_text(unsigned,encoding='utf-8')
        result_cli=subprocess.run([sys.executable,str(MOD),'--schema-dir',str(folder),
                                   '--fe-xml' if doc_type=='FE' else '--te-xml',str(xmlfile)],
                                  text=True,capture_output=True)
        parsed=json.loads(result_cli.stdout)
        check(result_cli.returncode==1 and parsed['reports'][0]['preSignature']['status']=='ONLY_SIGNATURE_PENDING',f'{doc_type}: CLI estricto mantiene salida 1 por XSD incompleto')
print(f'QA v0.6.91 pre-firma: {checks}/{checks} ensayos SINTÉTICOS; no verifica firma fiscal ni XSD oficial.')
