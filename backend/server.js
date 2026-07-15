const express = require("express");
const cors = require("cors");
const multer = require("multer");
const xml2js = require("xml2js");

const app = express();
app.use(cors());
const upload = multer();

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

                let doc =
                    result.FacturaElectronica ||
                    result.TiqueteElectronico ||
                    result.NotaCreditoElectronica ||
                    result.NotaDebitoElectronica;

                if (!doc) return resolve({ impuestos: [], bases: {} });

                let lineas = doc.DetalleServicio?.LineaDetalle;
                if (!lineas) return resolve({ impuestos: [], bases: {} });

                if (!Array.isArray(lineas)) lineas = [lineas];

                let impuestos = [];
                let bases = { "0": 0, "1": 0, "2": 0, "4": 0, "8": 0, "13": 0 };

                lineas.forEach((linea) => {
                    // Siempre convertir Impuesto en array
                    const impData = linea.Impuesto
                        ? Array.isArray(linea.Impuesto)
                            ? linea.Impuesto
                            : [linea.Impuesto]
                        : [];

                    impData.forEach((imp) => {
                        let tarifa = parseFloat(imp.Tarifa || 0);
                        let monto = parseFloat(imp.Monto || 0);

                        impuestos.push({ tarifa, monto });

                        // Extraer Base Imponible (varía según proveedor)
                        let base =
                            parseFloat(linea.BaseImponible) ||
                            parseFloat(linea.MontoBase) ||
                            parseFloat(linea.MontoGravable) ||
                            parseFloat(linea.SubTotal) ||
                            parseFloat(linea.MontoTotalLinea) ||
                            parseFloat(linea.MontoTotal) ||
                            null;

                        if (!isNaN(base) && base > 0 && String(tarifa) in bases) {
                            bases[String(tarifa)] += base;
                        }
                    });
                });

                resolve({ impuestos, bases });
            }
        );
    });
}

// ====================================================================
// ENDPOINT PRINCIPAL: SUBIR XML(s)
// ====================================================================
app.post("/upload", upload.array("files"), async (req, res) => {
    let totalesIVA = { "0": 0, "1": 0, "2": 0, "4": 0, "8": 0, "13": 0 };
    let totalesBase = { "0": 0, "1": 0, "2": 0, "4": 0, "8": 0, "13": 0 };

    let facturas = [];

    for (let file of req.files) {
        const xml = file.buffer.toString();

        try {
            // Parsear documento completo
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

            let doc =
                parsed.FacturaElectronica ||
                parsed.TiqueteElectronico ||
                parsed.NotaCreditoElectronica ||
                parsed.NotaDebitoElectronica;

            if (!doc) continue;

            // Nombre del comercio
            let comercio = doc.Emisor?.Nombre || "Desconocido";

            // Total de la factura
            let total = parseFloat(doc.ResumenFactura?.TotalComprobante || 0);

            // IVA y base
            const { impuestos, bases } = await procesarXML(xml);

            // Sumatorios globales
            impuestos.forEach(({ tarifa, monto }) => {
                if (String(tarifa) in totalesIVA) {
                    totalesIVA[String(tarifa)] += monto;
                }
            });

            for (let t in bases) {
                totalesBase[t] += bases[t];
            }

            // Registro de la factura individual
            facturas.push({
                comercio,
                total,
                impuestos,
                bases,
            });

        } catch (error) {
            console.log("Error procesando XML:", error);
        }
    }

    // Respuesta final
    res.json({
        iva: totalesIVA,
        base: totalesBase,
        facturas,
    });
});

// ====================================================================
// LEVANTAR SERVIDOR
// ====================================================================
app.listen(4000, () => {
    console.log("Backend v4.4 listo en http://localhost:4000");
});
