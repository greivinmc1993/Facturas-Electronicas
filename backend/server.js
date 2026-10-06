const express = require("express");
const cors = require("cors");
const multer = require("multer");
const xml2js = require("xml2js");

const app = express();
app.use(cors());
const upload = multer();

const TASAS = ["0", "1", "2", "4", "8", "13"];
const TIPOS_DOCUMENTO = {
    FacturaElectronica: { nombre: "Factura electrónica", signo: 1 },
    TiqueteElectronico: { nombre: "Tiquete electrónico", signo: 1 },
    NotaCreditoElectronica: { nombre: "Nota de crédito", signo: -1 },
    NotaDebitoElectronica: { nombre: "Nota de débito", signo: 1 },
};

function crearTotales() {
    return TASAS.reduce((acc, tasa) => {
        acc[tasa] = 0;
        return acc;
    }, {});
}

function numero(valor) {
    const n = parseFloat(valor);
    return Number.isFinite(n) ? n : 0;
}

function identificarDocumento(parsed) {
    for (const [raiz, info] of Object.entries(TIPOS_DOCUMENTO)) {
        if (parsed[raiz]) {
            return {
                raiz,
                tipoDocumento: info.nombre,
                signo: info.signo,
                doc: parsed[raiz],
            };
        }
    }
    return null;
}

function extraerFecha(doc) {
    return doc.FechaEmision || doc.FechaEmisionDocumento || null;
}

function extraerConsecutivo(doc) {
    return doc.NumeroConsecutivo || doc.Consecutivo || null;
}

function extraerClave(doc) {
    return doc.Clave || null;
}

function texto(valor) {
    if (valor === undefined || valor === null) return null;
    if (typeof valor === "object" && "_" in valor) return String(valor._);
    return String(valor);
}

function extraerIdentificacion(persona) {
    if (!persona) return null;
    const identificacion = persona.Identificacion || {};
    return {
        tipo: texto(identificacion.Tipo),
        numero: texto(identificacion.Numero),
    };
}

function extraerResumen(doc, signo) {
    const resumen = doc.ResumenFactura || {};
    const totalVenta = numero(resumen.TotalVenta) * signo;
    const totalVentaNeta = numero(resumen.TotalVentaNeta) * signo;
    const totalDescuentos = numero(resumen.TotalDescuentos) * signo;
    const totalImpuesto = numero(resumen.TotalImpuesto) * signo;
    const totalComprobante = numero(resumen.TotalComprobante) * signo;

    const moneda = resumen.CodigoTipoMoneda || {};
    return {
        totalVenta,
        totalVentaNeta,
        totalDescuentos,
        totalImpuesto,
        totalComprobante,
        moneda: texto(moneda.CodigoMoneda) || texto(resumen.CodigoMoneda) || "CRC",
        tipoCambio: numero(moneda.TipoCambio || resumen.TipoCambio) || 1,
        medioPago: (() => {
            const medios = resumen.MedioPago
                ? (Array.isArray(resumen.MedioPago) ? resumen.MedioPago : [resumen.MedioPago])
                : [];
            return medios.map((medio) => ({
                tipo: texto(medio.TipoMedioPago || medio.CodigoMedioPago),
                medio: texto(medio.MedioPago),
                total: numero(medio.TotalMedioPago) * signo,
            }));
        })(),
    };
}

function extraerDetalleLineas(doc, signo) {
    let lineas = doc.DetalleServicio?.LineaDetalle || [];
    if (!Array.isArray(lineas)) lineas = [lineas];

    return lineas.filter(Boolean).map((linea, indice) => {
        const descuentos = linea.Descuento
            ? (Array.isArray(linea.Descuento) ? linea.Descuento : [linea.Descuento])
            : [];
        const impuestos = linea.Impuesto
            ? (Array.isArray(linea.Impuesto) ? linea.Impuesto : [linea.Impuesto])
            : [];

        return {
            linea: indice + 1,
            codigo: texto(linea.Codigo),
            cantidad: numero(linea.Cantidad),
            unidadMedida: texto(linea.UnidadMedida),
            detalle: texto(linea.Detalle),
            precioUnitario: numero(linea.PrecioUnitario),
            montoTotal: numero(linea.MontoTotal) * signo,
            descuentos: descuentos.map((d) => ({
                monto: numero(d.MontoDescuento) * signo,
                naturaleza: texto(d.NaturalezaDescuento),
            })),
            subtotal: numero(linea.SubTotal) * signo,
            impuestos: impuestos.map((imp) => ({
                codigo: texto(imp.Codigo),
                codigoTarifa: texto(imp.CodigoTarifa),
                tarifa: numero(imp.Tarifa),
                monto: numero(imp.Monto) * signo,
            })),
            montoTotalLinea: numero(linea.MontoTotalLinea) * signo,
        };
    });
}

function extraerInformacionDocumento(doc, signo) {
    const resumen = extraerResumen(doc, signo);
    return {
        emisor: {
            nombre: texto(doc.Emisor?.Nombre),
            identificacion: extraerIdentificacion(doc.Emisor),
            nombreComercial: texto(doc.Emisor?.NombreComercial),
            correo: texto(doc.Emisor?.CorreoElectronico),
        },
        receptor: {
            nombre: texto(doc.Receptor?.Nombre),
            identificacion: extraerIdentificacion(doc.Receptor),
            correo: texto(doc.Receptor?.CorreoElectronico),
        },
        resumen,
        detalle: extraerDetalleLineas(doc, signo),
    };
}

// ====================================================================
// FUNCIÓN PRINCIPAL: PROCESAR IVA Y BASES POR LÍNEA
// ====================================================================
function procesarXML(xml) {
    return new Promise((resolve, reject) => {
        xml2js.parseString(
            xml,
            {
                explicitArray: false,
                tagNameProcessors: [xml2js.processors.stripPrefix],
            },
            (err, result) => {
                if (err) return reject(err);

                const identificacion = identificarDocumento(result);
                if (!identificacion) {
                    return resolve({
                        tipoDocumento: "Desconocido",
                        signo: 1,
                        impuestos: [],
                        bases: crearTotales(),
                    });
                }

                const { doc, tipoDocumento, signo } = identificacion;
                let lineas = doc.DetalleServicio?.LineaDetalle;
                if (!lineas) {
                    return resolve({
                        tipoDocumento,
                        signo,
                        impuestos: [],
                        bases: crearTotales(),
                    });
                }

                if (!Array.isArray(lineas)) lineas = [lineas];

                const impuestos = [];
                const bases = crearTotales();

                lineas.forEach((linea) => {
                    const impData = linea.Impuesto
                        ? Array.isArray(linea.Impuesto)
                            ? linea.Impuesto
                            : [linea.Impuesto]
                        : [];

                    impData.forEach((imp) => {
                        const tarifa = numero(imp.Tarifa);
                        const monto = numero(imp.Monto);
                        const tasa = String(tarifa);

                        impuestos.push({
                            tarifa,
                            monto: monto * signo,
                        });

                        const base =
                            numero(linea.BaseImponible) ||
                            numero(linea.MontoBase) ||
                            numero(linea.MontoGravable) ||
                            numero(linea.SubTotal) ||
                            numero(linea.MontoTotalLinea) ||
                            numero(linea.MontoTotal);

                        if (base > 0 && tasa in bases) {
                            bases[tasa] += base * signo;
                        }
                    });
                });

                resolve({
                    tipoDocumento,
                    signo,
                    impuestos,
                    bases,
                });
            }
        );
    });
}

// ====================================================================
// ENDPOINT PRINCIPAL: SUBIR XML(s)
// ====================================================================
app.post("/upload", upload.array("files"), async (req, res) => {
    const totalesIVA = crearTotales();
    const totalesBase = crearTotales();
    const totalesDocumentos = {
        "Factura electrónica": 0,
        "Tiquete electrónico": 0,
        "Nota de crédito": 0,
        "Nota de débito": 0,
    };

    const facturas = [];
    let totalNeto = 0;

    for (const file of req.files || []) {
        const xml = file.buffer.toString();

        try {
            const parsed = await new Promise((resolve, reject) => {
                xml2js.parseString(
                    xml,
                    {
                        explicitArray: false,
                        tagNameProcessors: [xml2js.processors.stripPrefix],
                    },
                    (err, result) => (err ? reject(err) : resolve(result))
                );
            });

            const identificacion = identificarDocumento(parsed);
            if (!identificacion) continue;

            const { doc, tipoDocumento, signo } = identificacion;
            const comercio = doc.Emisor?.Nombre || "Desconocido";
            const totalOriginal = numero(doc.ResumenFactura?.TotalComprobante);
            const total = totalOriginal * signo;
            totalNeto += total;
            const fecha = extraerFecha(doc);
            const clave = extraerClave(doc);
            const consecutivo = extraerConsecutivo(doc);
            const informacion = extraerInformacionDocumento(doc, signo);

            const { impuestos, bases } = await procesarXML(xml);

            impuestos.forEach(({ tarifa, monto }) => {
                const tasa = String(tarifa);
                if (tasa in totalesIVA) totalesIVA[tasa] += monto;
            });

            for (const tasa of TASAS) {
                totalesBase[tasa] += bases[tasa] || 0;
            }

            totalesDocumentos[tipoDocumento] =
                (totalesDocumentos[tipoDocumento] || 0) + 1;

            facturas.push({
                nombreArchivo: file.originalname,
                tipoDocumento,
                signo,
                comercio,
                total,
                totalOriginal,
                fecha,
                clave,
                consecutivo,
                impuestos,
                bases,
                emisor: informacion.emisor,
                receptor: informacion.receptor,
                resumen: informacion.resumen,
                detalle: informacion.detalle,
            });
        } catch (error) {
            console.log(`Error procesando XML ${file.originalname}:`, error);
        }
    }

    res.json({
        iva: totalesIVA,
        base: totalesBase,
        totalNeto,
        documentos: totalesDocumentos,
        facturas,
    });
});

if (require.main === module) {
    app.listen(4000, () => {
        console.log("Backend v6.0 listo en http://localhost:4000");
    });
}

module.exports = {
    app,
    procesarXML,
    identificarDocumento,
    crearTotales,
    extraerInformacionDocumento,
    extraerDetalleLineas,
};
