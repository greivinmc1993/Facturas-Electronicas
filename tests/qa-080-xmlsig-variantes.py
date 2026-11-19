"""QA independiente para TRES formas de XML sintético firmado de FacturaCR.

Ejecutar con Python lxml y cryptography. No valida XML fiscal ni la
conformidad XAdES/PKI de producción. No importa el firmador Node.
"""
from pathlib import Path
import runpy
import sys

verify = runpy.run_path(str(Path(__file__).with_name('qa-078-xmlsig-independiente.py')))['verify_synthetic']


def test_variant(path, variant):
    raw=Path(path).read_bytes()
    verify(raw,expected_variant=variant)
    tests={
        'importe':(b'<Monto>100.00</Monto>',b'<Monto>101.00</Monto>'),
        'tipo':(b'SIMULACION_NO_FISCAL',b'FACTURA_FISCAL'),
        'firma':(b'<ds:SignatureValue>',b'<ds:SignatureValue>X'),
        'politica':(b'DWxin1xWOeI8OuWQXazh4VjLWAaCLAA954em7DMh0h8=',b'Z'+b'Wxin1xWOeI8OuWQXazh4VjLWAaCLAA954em7DMh0h8='),
        'elemento inesperado':(b'</FacturaCRLaboratorio>',b'<Extra>INYECCION</Extra></FacturaCRLaboratorio>'),
    }
    if variant=='servicio':
        tests['servicio precio']=(b'<Precio>100.00</Precio>',b'<Precio>999.00</Precio>')
    if variant=='mercaderia':
        tests['mercaderia cantidad']=(b'<Cantidad>2</Cantidad>',b'<Cantidad>999</Cantidad>')
    for name,(before,after) in tests.items():
        assert before in raw, (variant,name,'mutación no encontrada')
        altered=raw.replace(before,after,1)
        assert altered!=raw
        try: verify(altered,expected_variant=variant)
        except Exception: pass
        else: raise AssertionError(f'Alteración NO rechazada: {variant} - {name}')
    print(f'OK externo {variant}: firma y dos referencias verificadas, {len(tests)} alteraciones rechazadas')
    return len(tests)


def main():
    if len(sys.argv)!=4:
        raise SystemExit('Uso: python tests/qa-080-xmlsig-variantes.py standard.xml servicio.xml mercaderia.xml')
    variants=('standard','servicio','mercaderia')
    count=sum(test_variant(path,variant) for path,variant in zip(sys.argv[1:],variants))
    print(f'QA externo v0.6.80: 3/3 plantillas, {count}/{count} alteraciones rechazadas')

if __name__=='__main__':main()
