"""QA XMLDSig con lxml/cryptography, sin utilizar la canonicalización del firmador.
Comprueba exclusivamente una firma sintética de FacturaCR. NO valida XAdES fiscal,
XSD, confianza del certificado ni aceptación de Hacienda.
Uso: python tests/qa-078-xmlsig-independiente.py archivo-demo.xml
"""
import base64
import copy
import hashlib
import sys
from lxml import etree
from cryptography import x509
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes

DS='http://www.w3.org/2000/09/xmldsig#'
XADES='http://uri.etsi.org/01903/v1.3.2#'
NS={'ds':DS,'xades':XADES}
POLICY_B64='DWxin1xWOeI8OuWQXazh4VjLWAaCLAA954em7DMh0h8='

def verify_synthetic(raw):
    if len(raw)>100_000: raise ValueError('XML de prueba demasiado grande')
    # Estrictamente para plantilla sintética: DTD, entidades y declaraciones
    # externas no tienen cabida, aunque el parser desactive su resolución.
    if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper(): raise ValueError('DTD prohibido')
    parser=etree.XMLParser(resolve_entities=False,no_network=True,load_dtd=False,huge_tree=False)
    root=etree.fromstring(raw,parser)
    assert root.tag=='FacturaCRLaboratorio'
    assert [item.tag for item in root]==['Tipo','Monto','EnsayoId',f'{{{DS}}}Signature']
    assert root.find('Monto').text=='100.00'
    assert root.find('Tipo').text=='SIMULACION_NO_FISCAL'
    assert len(root.xpath('//ds:Signature',namespaces=NS))==1
    assert len(root.xpath('//xades:SignedProperties',namespaces=NS))==1
    assert not root.xpath('//comment()')
    ids=[item.get('Id') for item in root.iter() if item.get('Id') is not None]
    assert len(ids)==2 and len(ids)==len(set(ids))
    assert root.find('Tipo').text=='SIMULACION_NO_FISCAL'
    sig=root.find('ds:Signature',NS)
    assert sig is not None and sig.get('Id')
    info=sig.find('ds:SignedInfo',NS)
    props=sig.find('.//xades:SignedProperties',NS)
    qual=sig.find('.//xades:QualifyingProperties',NS)
    assert info is not None and props is not None and qual.get('Target')=='#'+sig.get('Id')
    assert info.find('ds:CanonicalizationMethod',NS).get('Algorithm')=='http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
    assert info.find('ds:SignatureMethod',NS).get('Algorithm')=='http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
    refs=info.findall('ds:Reference',NS)
    assert len(refs)==2
    assert [ref.get('URI') for ref in refs]==['','#'+props.get('Id')]
    assert [ref.get('Type') for ref in refs]==[None,'http://uri.etsi.org/01903#SignedProperties']
    for ref in refs:
        uri=ref.get('URI')
        digest=ref.find('ds:DigestValue',NS).text
        assert ref.find('ds:DigestMethod',NS).get('Algorithm')=='http://www.w3.org/2001/04/xmlenc#sha256'
        if uri=='':
            clone=copy.deepcopy(root)
            clone.remove(clone.find('ds:Signature',NS))
            source=clone
            transforms=[t.get('Algorithm') for t in ref.findall('.//ds:Transform',NS)]
            assert transforms==[DS+'enveloped-signature','http://www.w3.org/TR/2001/REC-xml-c14n-20010315']
        else:
            assert [t.get('Algorithm') for t in ref.findall('.//ds:Transform',NS)]==['http://www.w3.org/TR/2001/REC-xml-c14n-20010315']
            assert uri=='#'+props.get('Id')
            assert ref.get('Type')=='http://uri.etsi.org/01903#SignedProperties'
            source=props
        independent_c14n=etree.tostring(source,method='c14n',exclusive=False,with_comments=False)
        actual=base64.b64encode(hashlib.sha256(independent_c14n).digest()).decode()
        assert digest==actual, f'Referencia no coincide: {uri}'
    cert_der=base64.b64decode(sig.find('.//ds:X509Certificate',NS).text)
    cert=x509.load_der_x509_certificate(cert_der)
    assert cert.issuer==cert.subject # cert ficticio autofirmado; no se confía en él
    assert 'FacturaCR DEMO NO FISCAL' in cert.subject.rfc4514_string()
    cert_hash=props.find('.//xades:CertDigest/ds:DigestValue',NS)
    assert cert_hash is not None and cert_hash.text==base64.b64encode(hashlib.sha256(cert_der).digest()).decode()
    issuer_serial=props.find('.//xades:IssuerSerial/ds:X509SerialNumber',NS)
    assert issuer_serial is not None and issuer_serial.text==str(cert.serial_number)
    policy_hash=props.find('.//xades:SigPolicyHash/ds:DigestValue',NS)
    assert policy_hash is not None and policy_hash.text==POLICY_B64
    assert len(sig.findall('ds:SignedInfo',NS))==1
    assert len(sig.findall('ds:KeyInfo',NS))==1
    assert len(sig.findall('ds:SignatureValue',NS))==1
    signedinfo=etree.tostring(info,method='c14n',exclusive=False,with_comments=False)
    signature=base64.b64decode(sig.find('ds:SignatureValue',NS).text)
    cert.public_key().verify(signature,signedinfo,padding.PKCS1v15(),hashes.SHA256())

def rejected(raw):
    try:
        verify_synthetic(raw)
        return False
    except Exception:
        return True

def main():
    if len(sys.argv)!=2: raise SystemExit('Uso: qa-078-xmlsig-independiente.py archivo.xml')
    with open(sys.argv[1],'rb') as file: raw=file.read()
    verify_synthetic(raw)
    assert rejected(raw.replace(b'<Monto>100.00</Monto>',b'<Monto>100.01</Monto>',1)), 'No detecta importe alterado'
    assert rejected(raw.replace(POLICY_B64.encode(),b'BAD'+POLICY_B64.encode()[3:],1)), 'No detecta política alterada'
    assert rejected(raw.replace(b'<ds:SignatureValue>',b'<ds:SignatureValue>X',1)), 'No detecta firma alterada'
    assert rejected(raw.replace(b'Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"',b'Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha512"',1)), 'No detecta SignedInfo alterado'
    print('QA externo: RSA-SHA256, 2 referencias C14N, digest X.509, política y 4 alteraciones rechazadas (5/5)')

if __name__=='__main__': main()
