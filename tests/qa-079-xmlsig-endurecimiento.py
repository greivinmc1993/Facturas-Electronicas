"""Pruebas negativas adicionales para XMLDSig sintético.
NO verifica firmas fiscales XAdES; usar únicamente fixtures de laboratorio.
"""
import pathlib
import runpy
import sys

verify=runpy.run_path(str(pathlib.Path(__file__).with_name('qa-078-xmlsig-independiente.py')))['verify_synthetic']

def main():
    if len(sys.argv)!=2:
        raise SystemExit('Uso: python tests/qa-079-xmlsig-endurecimiento.py ARCHIVO_FICTICIO.xml')
    raw=pathlib.Path(sys.argv[1]).read_bytes()
    verify(raw)
    checks={
      'etiqueta externa añadida':raw.replace(b'</FacturaCRLaboratorio>',b'<MontoExtra>999</MontoExtra></FacturaCRLaboratorio>',1),
      'firma duplicada':raw.replace(b'</FacturaCRLaboratorio>',b'<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"/></FacturaCRLaboratorio>',1),
      'elemento de negocio inesperado':raw.replace(b'</FacturaCRLaboratorio>',b'<FacturaElectronica>TRAMPA</FacturaElectronica></FacturaCRLaboratorio>',1),
      'doctype prohibido':b'<!DOCTYPE FacturaCRLaboratorio [<!ENTITY x "test">]>'+raw,
      'id de propiedades duplicado':raw.replace(b'</FacturaCRLaboratorio>',b'<Fake Id="'+_find_props_id(raw)+b'"/></FacturaCRLaboratorio>',1),
      'raiz cambiada':raw.replace(b'<FacturaCRLaboratorio>',b'<FacturaElectronica>',1),
      'URI de referencia externa':raw.replace(b'<ds:Reference URI="">',b'<ds:Reference URI="https://example.org/external.xml">',1),
      'Referencia adicional no firmada':raw.replace(b'</ds:SignedInfo>',b'<ds:Reference URI="#extra"/></ds:SignedInfo>',1),
      'monto cambiado':raw.replace(b'<Monto>100.00</Monto>',b'<Monto>900.00</Monto>',1),
      'propiedades de política cambiadas':raw.replace(b'DWxin1xWOeI8OuWQXazh4VjLWAaCLAA954em7DMh0h8=',b'BADin1xWOeI8OuWQXazh4VjLWAaCLAA954em7DMh0h8=',1),
      'firma RSA cambiada':raw.replace(b'<ds:SignatureValue>',b'<ds:SignatureValue>AA',1),
      'certificado incluido modificado':raw.replace(b'<ds:X509Certificate>',b'<ds:X509Certificate>AA',1),
      'inserción de comentario no firmado':raw.replace(b'<Monto>100.00</Monto>',b'<!-- contenido sorpresa --><Monto>100.00</Monto>',1),
    }
    for name,changed in checks.items():
        assert changed!=raw, 'Mutación sin efecto: '+name
        try:verify(changed)
        except Exception:print('RECHAZADO:',name)
        else:raise AssertionError('Ataque NO detectado: '+name)
    print(f'QA 0.6.79: {len(checks)}/{len(checks)} mutaciones XML rechazadas (fixture ficticio)')

def _find_props_id(raw):
    import re
    result=re.search(rb'<xades:SignedProperties Id="([^"]+)"',raw)
    if not result:raise ValueError('Falta Id de prueba')
    return result.group(1)

if __name__=='__main__':main()
