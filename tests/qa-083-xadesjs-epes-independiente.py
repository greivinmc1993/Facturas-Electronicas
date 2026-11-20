"""Verificador externo de las muestras XAdESjs 3.x del workflow v0.6.83.
No usa XAdESjs ni el generador de FacturaCR. Solo acepta 3 XML ficticios
con reglas estrictas; no valida identidad, XSD, confianza ni conformidad fiscal.
"""
import sys,base64,hashlib,copy
from pathlib import Path
from lxml import etree
from cryptography.hazmat.primitives.asymmetric import rsa,padding
from cryptography.hazmat.primitives import hashes
DS='http://www.w3.org/2000/09/xmldsig#'
X='http://uri.etsi.org/01903/v1.3.2#'
NS={'ds':DS,'x':X}
POLICY_URI='https://cdn.comprobanteselectronicos.go.cr/xml-schemas/Resoluci%C3%B3n_General_sobre_disposiciones_t%C3%A9cnicas_comprobantes_electr%C3%B3nicos_para_efectos_tributarios.pdf'
POLICY_B64='DWxin1xWOeI8OuWQXazh4VjLWAaCLAA954em7DMh0h8='
C14N='http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
EXC='http://www.w3.org/2001/10/xml-exc-c14n#'
SIGN_RSA='http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
SHA='http://www.w3.org/2001/04/xmlenc#sha256'

def check(raw,variant):
    if not raw or len(raw)>150_000 or b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
        raise ValueError('No se admite XML externo ni DTD')
    root=etree.fromstring(raw,etree.XMLParser(resolve_entities=False,no_network=True,load_dtd=False,huge_tree=False))
    assert root.tag=='FacturaCRPruebaEspecializada'
    assert [v.text for v in root.findall('Tipo')]==['NO_FISCAL']
    assert [v.text for v in root.findall('Monto')]==['100.00']
    if variant=='simple':
        assert [e.tag for e in root]==['Tipo','Monto',f'{{{DS}}}Signature']
    elif variant=='servicio':
        assert [e.tag for e in root]==['Tipo','Servicio','Monto',f'{{{DS}}}Signature']
        assert [e.tag for e in root.find('Servicio')]==['Cantidad','Precio']
        assert [e.text for e in root.find('Servicio')]==['2','50.00']
    elif variant=='mercaderia':
        assert [e.tag for e in root]==['Tipo','Articulos','Monto',f'{{{DS}}}Signature']
        p=root.find('Articulos').findall('Producto')
        assert [(v.get('codigo'),v.text) for v in p]==[('DEMO-A','35.00'),('DEMO-B','65.00')]
    else: raise ValueError('Variante ajena al laboratorio')
    assert len(root.xpath('//ds:Signature',namespaces=NS))==1
    assert len(root.xpath('//x:SignedProperties',namespaces=NS))==1
    assert len(root.xpath('//x:SignaturePolicyId',namespaces=NS))==1
    assert not root.xpath('//x:SignaturePolicyImplied',namespaces=NS)
    assert not root.xpath('//comment()')
    allids=[x.get('Id') for x in root.iter() if x.get('Id')]
    assert len(allids)==len(set(allids))
    sig=root.find('ds:Signature',NS)
    info=sig.find('ds:SignedInfo',NS)
    assert info is not None
    canon=info.find('ds:CanonicalizationMethod',NS).get('Algorithm')
    assert canon in (C14N,EXC)
    assert info.find('ds:SignatureMethod',NS).get('Algorithm')==SIGN_RSA
    policy=sig.find('.//x:SignaturePolicyId',NS)
    assert policy.find('.//x:Identifier',NS).text==POLICY_URI
    assert policy.find('.//ds:DigestValue',NS).text.strip()==POLICY_B64
    sp=sig.find('.//x:SignedProperties',NS)
    refs=info.findall('ds:Reference',NS)
    assert len(refs)==2
    uris=[r.get('URI') for r in refs]
    assert '' in uris and ('#'+str(sp.get('Id'))) in uris
    for ref in refs:
        uri=ref.get('URI')
        assert ref.find('ds:DigestMethod',NS).get('Algorithm')==SHA
        transforms=[v.get('Algorithm') for v in ref.findall('.//ds:Transform',NS)]
        assert len(transforms)<=3 and all(v in (DS+'enveloped-signature',C14N,EXC) for v in transforms)
        if uri=='':
            assert DS+'enveloped-signature' in transforms
            cloned=copy.deepcopy(root)
            cloned.remove(cloned.find('ds:Signature',NS))
            node=cloned
        else:
            assert uri=='#'+sp.get('Id')
            assert ref.get('Type')=='http://uri.etsi.org/01903#SignedProperties'
            assert DS+'enveloped-signature' not in transforms
            node=sp
        canonical=etree.tostring(node,method='c14n',exclusive=EXC in transforms,with_comments=False)
        actual=base64.b64encode(hashlib.sha256(canonical).digest()).decode()
        assert ref.find('ds:DigestValue',NS).text.strip()==actual, f'Digest inválido: {uri}'
    modulus=sig.find('.//ds:RSAKeyValue/ds:Modulus',NS)
    exponent=sig.find('.//ds:RSAKeyValue/ds:Exponent',NS)
    assert modulus is not None and exponent is not None
    n=int.from_bytes(base64.b64decode(modulus.text),'big')
    e=int.from_bytes(base64.b64decode(exponent.text),'big')
    assert n.bit_length()>=2048 and e==65537
    key=rsa.RSAPublicNumbers(e,n).public_key()
    signedinfo=etree.tostring(info,method='c14n',exclusive=canon==EXC,with_comments=False)
    value=base64.b64decode(sig.find('ds:SignatureValue',NS).text)
    key.verify(value,signedinfo,padding.PKCS1v15(),hashes.SHA256())


def rejected(raw,variant):
    try: check(raw,variant); return False
    except Exception: return True

def main():
    if len(sys.argv) not in (2,3): raise SystemExit('Uso: python qa-083-xadesjs-epes-independiente.py DIR_TEMP [083|084]')
    base=Path(sys.argv[1]); pref=sys.argv[2] if len(sys.argv)==3 else '083'
    if pref not in ('083','084'): raise SystemExit('Prefijo no autorizado')
    n=0
    for variant in ('simple','servicio','mercaderia'):
        raw=(base/f'xadesjs-{pref}-{variant}-NO-FISCAL.xml').read_bytes()
        check(raw,variant);n+=1
        assert rejected(raw.replace(b'<Monto>100.00</Monto>',b'<Monto>101.00</Monto>',1),variant)
        assert rejected(raw.replace(POLICY_B64.encode(),b'B'+POLICY_B64.encode()[1:],1),variant)
        n+=2
    print(f'QA independiente XAdESjs: 3 firmas verificadas y 6 mutaciones rechazadas ({n}/9) - NO FISCAL')
if __name__=='__main__': main()
