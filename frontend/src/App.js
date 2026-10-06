import React, { useState, useMemo } from "react";
import { Bar } from "react-chartjs-2";
import "chart.js/auto";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";

const TASAS = ["0", "1", "2", "4", "8", "13"];

const TIPOS = [
  "Factura electrónica",
  "Tiquete electrónico",
  "Nota de crédito",
  "Nota de débito",
];

const tarifaColores = {
  "0": "#f5f5f5",
  "1": "#81d4fa",
  "2": "#a5d6a7",
  "4": "#ce93d8",
  "8": "#ffcc80",
  "13": "#ef9a9a",
};

const fileLabelStyle = {
  background: "#2196F3",
  color: "#fff",
  padding: "10px 15px",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 700,
};

const buttonStyle = {
  background: "#4CAF50",
  color: "#fff",
  padding: "10px 12px",
  borderRadius: 8,
  cursor: "pointer",
  border: "none",
  fontWeight: 700,
};

const buttonPdfStyle = { ...buttonStyle, background: "#E91E63" };

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  background: "#fff",
  boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
};

function crearTotales() {
  return TASAS.reduce((acc, tasa) => {
    acc[tasa] = 0;
    return acc;
  }, {});
}

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function formatearColon(valor) {
  return `₡${numero(valor).toLocaleString("es-CR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function App() {
  const [resultados, setResultados] = useState(null);
  const [comercios, setComercios] = useState([]);
  const [documentos, setDocumentos] = useState({});
  const [cargando, setCargando] = useState(false);
  const [documentoSeleccionado, setDocumentoSeleccionado] = useState(null);

  const [filtroComercio, setFiltroComercio] = useState("TODOS");
  const [filtroTarifa, setFiltroTarifa] = useState("TODAS");
  const [filtroTipo, setFiltroTipo] = useState("TODOS");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");

  // ----------------------------------------------------
  // SUBIR XMLs (múltiples)
  // ----------------------------------------------------
  const subirArchivos = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (const f of files) formData.append("files", f);

    try {
      setCargando(true);
      const res = await fetch("http://localhost:4000/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Error del servidor al procesar XMLs");

      const data = await res.json();

      const ivaNorm = crearTotales();
      const baseNorm = crearTotales();
      TASAS.forEach((t) => {
        ivaNorm[t] = numero(data.iva?.[t]);
        baseNorm[t] = numero(data.base?.[t]);
      });

      const mapa = {};

      (data.facturas || []).forEach((f) => {
        const nombre = f.comercio || "DESCONOCIDO";
        const tipoDocumento = f.tipoDocumento || "Desconocido";
        const fecha = f.fecha || null;

        if (!mapa[nombre]) {
          mapa[nombre] = {
            comercio: nombre,
            total: 0,
            cantidad: 0,
            cantidadPorTipo: TIPOS.reduce((acc, tipo) => {
              acc[tipo] = 0;
              return acc;
            }, {}),
            fechaUltima: fecha,
            iva: crearTotales(),
            base: crearTotales(),
            documentos: [],
          };
        }

        const comercio = mapa[nombre];
        comercio.total += numero(f.total);
        comercio.cantidad += 1;
        comercio.cantidadPorTipo[tipoDocumento] =
          (comercio.cantidadPorTipo[tipoDocumento] || 0) + 1;

        if (fecha && (!comercio.fechaUltima || new Date(fecha) > new Date(comercio.fechaUltima))) {
          comercio.fechaUltima = fecha;
        }

        TASAS.forEach((t) => {
          comercio.iva[t] += numero(f.impuestos?.filter((i) => String(i.tarifa) === t)
            .reduce((acc, i) => acc + numero(i.monto), 0));
          comercio.base[t] += numero(f.bases?.[t]);
        });

        comercio.documentos.push(f);
      });

      setResultados({ iva: ivaNorm, base: baseNorm, totalNeto: numero(data.totalNeto) });
      setDocumentos(data.documentos || {});
      setComercios(Object.values(mapa));
      setDocumentoSeleccionado(null);
    } catch (err) {
      console.error(err);
      alert("Error al procesar archivos: " + err.message);
    } finally {
      setCargando(false);
      e.target.value = "";
    }
  };

  // ----------------------------------------------------
  // FILTRADOS
  // ----------------------------------------------------
  const comerciosFiltrados = useMemo(() => {
    return comercios.filter((c) => {
      if (filtroComercio !== "TODOS" && c.comercio !== filtroComercio) return false;

      if (filtroTipo !== "TODOS") {
        if ((c.cantidadPorTipo?.[filtroTipo] || 0) === 0) return false;
      }

      if (filtroTarifa !== "TODAS") {
        const t = String(filtroTarifa);
        if (numero(c.iva[t]) === 0 && numero(c.base[t]) === 0) return false;
      }

      if (fechaInicio || fechaFin) {
        const fecha = c.fechaUltima ? new Date(c.fechaUltima) : null;
        if (!fecha) return false;
        if (fechaInicio && fecha < new Date(`${fechaInicio}T00:00:00`)) return false;
        if (fechaFin && fecha > new Date(`${fechaFin}T23:59:59`)) return false;
      }

      return true;
    });
  }, [comercios, filtroComercio, filtroTipo, filtroTarifa, fechaInicio, fechaFin]);

  const totalNeto = resultados ? numero(resultados.totalNeto) : 0;
  const totalIVA = resultados
    ? TASAS.reduce((s, t) => s + numero(resultados.iva[t]), 0)
    : 0;
  const totalBase = resultados
    ? TASAS.reduce((s, t) => s + numero(resultados.base[t]), 0)
    : 0;

  const todosLosDocumentos = resultados ? (
    comercios.flatMap((c) => c.documentos || [])
  ) : [];

  const documentosFiltrados = todosLosDocumentos.filter((f) => {
    if (filtroComercio !== "TODOS" && f.comercio !== filtroComercio) return false;
    if (filtroTipo !== "TODOS" && f.tipoDocumento !== filtroTipo) return false;
    if (filtroTarifa !== "TODAS") {
      const t = String(filtroTarifa);
      const tieneTarifa = numero(f.iva?.[t]) !== 0 || numero(f.bases?.[t]) !== 0;
      if (!tieneTarifa) return false;
    }
    if (fechaInicio || fechaFin) {
      if (!f.fecha) return false;
      const fecha = new Date(f.fecha);
      if (fechaInicio && fecha < new Date(`${fechaInicio}T00:00:00`)) return false;
      if (fechaFin && fecha > new Date(`${fechaFin}T23:59:59`)) return false;
    }
    return true;
  });

  // ----------------------------------------------------
  // EXPORTACIONES
  // ----------------------------------------------------
  const exportComerciosExcel = () => {
    if (!comercios.length) return;
    const rows = [["Comercio", "Total neto", "Documentos", "IVA neto", "Base neta"]];
    comercios.forEach((c) => {
      const iva = TASAS.reduce((s, t) => s + numero(c.iva[t]), 0);
      const base = TASAS.reduce((s, t) => s + numero(c.base[t]), 0);
      rows.push([c.comercio, c.total, c.cantidad, iva, base]);
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Comercios");
    XLSX.writeFile(wb, "Comercios_Neto.xlsx");
  };

  const exportComerciosPDF = () => {
    if (!comercios.length) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Resumen neto por Comercio", 14, 18);
    const body = comercios.map((c) => {
      const iva = TASAS.reduce((s, t) => s + numero(c.iva[t]), 0);
      const base = TASAS.reduce((s, t) => s + numero(c.base[t]), 0);
      return [c.comercio, c.total.toFixed(2), c.cantidad, iva.toFixed(2), base.toFixed(2)];
    });
    autoTable(doc, { head: [["Comercio", "Total neto", "Documentos", "IVA neto", "Base neta"]], body, startY: 28 });
    doc.save("Comercios_Neto.pdf");
  };

  const exportIVAComerciosExcel = () => {
    if (!comercios.length) return;
    const rows = [["Comercio", "Tarifa", "Base neta", "IVA neto"]];
    comercios.forEach((c) => {
      TASAS.forEach((t) => rows.push([c.comercio, `${t}%`, numero(c.base[t]), numero(c.iva[t])]));
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "IVA_por_comercio");
    XLSX.writeFile(wb, "IVA_por_comercio_Neto.xlsx");
  };

  const exportPDFGlobal = () => {
    if (!resultados) return;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Reporte Global IVA Neto", 14, 15);

    doc.setFontSize(14);
    doc.text("Resumen de documentos", 14, 28);
    const resumenDocumentos = TIPOS.map((tipo) => [tipo, documentos[tipo] || 0]);
    autoTable(doc, { head: [["Tipo de documento", "Cantidad"]], body: resumenDocumentos, startY: 34 });

    doc.text("IVA Global Neto por Tarifa", 14, doc.lastAutoTable.finalY + 12);
    const bodyGlobal = TASAS.map((t) => [
      `${t}%`,
      numero(resultados.base[t]).toFixed(2),
      numero(resultados.iva[t]).toFixed(2),
    ]);
    autoTable(doc, { head: [["Tarifa", "Base neta", "IVA neto"]], body: bodyGlobal, startY: doc.lastAutoTable.finalY + 5 });

    doc.text("IVA neto por Comercio", 14, doc.lastAutoTable.finalY + 12);
    const bodyCom = [];
    comerciosFiltrados.forEach((c) => {
      TASAS.forEach((t) => {
        bodyCom.push([c.comercio, `${t}%`, numero(c.base[t]).toFixed(2), numero(c.iva[t]).toFixed(2)]);
      });
    });
    autoTable(doc, { head: [["Comercio", "Tarifa", "Base neta", "IVA neto"]], body: bodyCom, startY: doc.lastAutoTable.finalY + 5 });
    doc.save("Reporte_IVA_Global_Neto.pdf");
  };

  // ----------------------------------------------------
  // GRÁFICOS
  // ----------------------------------------------------
  const chartIVAglobal = resultados
    ? {
        labels: TASAS.map((t) => `${t}%`),
        datasets: [
          {
            label: "Base neta",
            data: TASAS.map((t) => numero(resultados.base[t])),
            backgroundColor: TASAS.map((t) => tarifaColores[t]),
          },
          {
            label: "IVA neto",
            data: TASAS.map((t) => numero(resultados.iva[t])),
            backgroundColor: TASAS.map((t) => tarifaColores[t]),
          },
        ],
      }
    : null;

  const chartTopComercios = {
    labels: comerciosFiltrados.map((c) => c.comercio),
    datasets: [{
      label: "Total neto por Comercio",
      data: comerciosFiltrados.map((c) => c.total),
      backgroundColor: comerciosFiltrados.map(() => "#90caf9"),
    }],
  };

  const chartIVAporComercio = {
    labels: comerciosFiltrados.map((c) => c.comercio),
    datasets: TASAS.map((t) => ({
      label: `${t}%`,
      data: comerciosFiltrados.map((c) => numero(c.iva[t])),
      backgroundColor: tarifaColores[t],
    })),
  };

  return (
    <div style={{ padding: 28, fontFamily: "Arial, sans-serif", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ textAlign: "center" }}>Dashboard IVA — XML v6.0</h1>
      <p style={{ textAlign: "center" }}>
        Las notas de crédito se restan automáticamente y las notas de débito se suman.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <label style={fileLabelStyle}>
          Seleccionar XML(s)
          <input type="file" multiple accept=".xml" onChange={subirArchivos} style={{ display: "none" }} />
        </label>
        <button onClick={exportComerciosExcel} style={buttonStyle} disabled={!comercios.length}>Exportar Comercios Excel</button>
        <button onClick={exportComerciosPDF} style={buttonPdfStyle} disabled={!comercios.length}>PDF Comercios</button>
        <button onClick={exportIVAComerciosExcel} style={buttonStyle} disabled={!comercios.length}>Exportar IVA por comercio</button>
        <button onClick={exportPDFGlobal} style={buttonPdfStyle} disabled={!resultados}>Exportar PDF Global</button>
      </div>

      {cargando && <p style={{ textAlign: "center" }}>Procesando archivos... ⏳</p>}

      <div style={{ marginTop: 20, marginBottom: 18, display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
        <div>
          <label>Comercio</label><br />
          <select value={filtroComercio} onChange={(e) => setFiltroComercio(e.target.value)} style={{ padding: 8, borderRadius: 6 }}>
            <option value="TODOS">Todos</option>
            {comercios.map((c) => <option key={c.comercio} value={c.comercio}>{c.comercio}</option>)}
          </select>
        </div>

        <div>
          <label>Tipo de documento</label><br />
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={{ padding: 8, borderRadius: 6 }}>
            <option value="TODOS">Todos</option>
            {TIPOS.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
          </select>
        </div>

        <div>
          <label>Tarifa IVA</label><br />
          <select value={filtroTarifa} onChange={(e) => setFiltroTarifa(e.target.value)} style={{ padding: 8, borderRadius: 6 }}>
            <option value="TODAS">Todas</option>
            {TASAS.map((t) => <option key={t} value={t}>{t}%</option>)}
          </select>
        </div>

        <div>
          <label>Fecha inicio</label><br />
          <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} style={{ padding: 8, borderRadius: 6 }} />
        </div>

        <div>
          <label>Fecha fin</label><br />
          <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} style={{ padding: 8, borderRadius: 6 }} />
        </div>
      </div>

      {resultados && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
            <div style={{ ...cardStyle(), minWidth: 180 }}><h3>Base neta</h3><p style={numeroGrande}>{formatearColon(totalBase)}</p></div>
            <div style={{ ...cardStyle(), minWidth: 180 }}><h3>IVA neto</h3><p style={numeroGrande}>{formatearColon(totalIVA)}</p></div>
            <div style={{ ...cardStyle(), minWidth: 180 }}><h3>Total neto</h3><p style={numeroGrande}>{formatearColon(totalNeto)}</p></div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 12 }}>
            {TIPOS.map((tipo) => (
              <div key={tipo} style={{ ...cardStyle(), minWidth: 170 }}>
                <strong>{tipo}</strong>
                <p style={{ fontSize: 20, margin: "8px 0 0" }}>{documentos[tipo] || 0}</p>
                <small>documentos</small>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20 }}>
            <h2 style={{ textAlign: "center" }}>IVA neto por porcentaje (global)</h2>
            <table style={{ ...tableStyle, marginTop: 8 }}>
              <thead><tr><th>Tarifa</th><th>Base neta</th><th>IVA neto</th></tr></thead>
              <tbody>
                {TASAS.map((t) => (
                  <tr key={t} style={{ background: tarifaColores[t] }}>
                    <td style={{ padding: 8, textAlign: "center" }}>{t}%</td>
                    <td style={{ padding: 8, textAlign: "center" }}>{formatearColon(resultados.base[t])}</td>
                    <td style={{ padding: 8, textAlign: "center" }}>{formatearColon(resultados.iva[t])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 18 }}><Bar data={chartIVAglobal} /></div>
          </div>
        </>
      )}

      {resultados && documentosFiltrados.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ textAlign: "center" }}>Comprobantes procesados</h2>
          <p style={{ textAlign: "center" }}>Haz clic en un comprobante para consultar su información completa.</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ ...tableStyle, marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Tipo</th><th>Fecha</th><th>Emisor</th><th>Consecutivo</th><th>Clave</th><th>Total neto</th>
                </tr>
              </thead>
              <tbody>
                {documentosFiltrados.map((f, i) => (
                  <tr key={`${f.clave || f.nombreArchivo}-${i}`} onClick={() => setDocumentoSeleccionado(f)} style={{ cursor: "pointer" }}>
                    <td style={{ padding: 8, textAlign: "center" }}>{f.tipoDocumento}</td>
                    <td style={{ padding: 8, textAlign: "center" }}>{f.fecha ? new Date(f.fecha).toLocaleString("es-CR") : "-"}</td>
                    <td style={{ padding: 8 }}>{f.emisor?.nombre || f.comercio}</td>
                    <td style={{ padding: 8, textAlign: "center" }}>{f.consecutivo || "-"}</td>
                    <td style={{ padding: 8, fontSize: 12 }}>{f.clave || "-"}</td>
                    <td style={{ padding: 8, textAlign: "right", fontWeight: 700 }}>{formatearColon(f.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {documentoSeleccionado && (
            <div style={{ ...cardStyle(), marginTop: 18, textAlign: "left" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>Detalle del comprobante</h3>
                <button onClick={() => setDocumentoSeleccionado(null)} style={{ ...buttonPdfStyle, padding: "7px 10px" }}>Cerrar</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 14 }}>
                <div><strong>Tipo:</strong> {documentoSeleccionado.tipoDocumento}</div>
                <div><strong>Archivo:</strong> {documentoSeleccionado.nombreArchivo}</div>
                <div><strong>Fecha:</strong> {documentoSeleccionado.fecha ? new Date(documentoSeleccionado.fecha).toLocaleString("es-CR") : "-"}</div>
                <div><strong>Clave:</strong> {documentoSeleccionado.clave || "-"}</div>
                <div><strong>Consecutivo:</strong> {documentoSeleccionado.consecutivo || "-"}</div>
                <div><strong>Moneda:</strong> {documentoSeleccionado.resumen?.moneda || "-"}</div>
                <div><strong>Tipo de cambio:</strong> {documentoSeleccionado.resumen?.tipoCambio || "-"}</div>
                <div><strong>Medio de pago:</strong> {(documentoSeleccionado.resumen?.medioPago || []).map((m) => m.tipo || m.medio || "-").join(", ") || "-"}</div>
              </div>

              <hr />
              <h4>Emisor</h4>
              <p><strong>Nombre:</strong> {documentoSeleccionado.emisor?.nombre || "-"}</p>
              <p><strong>Identificación:</strong> {documentoSeleccionado.emisor?.identificacion?.tipo || "-"} {documentoSeleccionado.emisor?.identificacion?.numero || "-"}</p>
              <p><strong>Nombre comercial:</strong> {documentoSeleccionado.emisor?.nombreComercial || "-"}</p>
              <p><strong>Correo:</strong> {documentoSeleccionado.emisor?.correo || "-"}</p>

              <h4>Receptor</h4>
              <p><strong>Nombre:</strong> {documentoSeleccionado.receptor?.nombre || "-"}</p>
              <p><strong>Identificación:</strong> {documentoSeleccionado.receptor?.identificacion?.tipo || "-"} {documentoSeleccionado.receptor?.identificacion?.numero || "-"}</p>
              <p><strong>Correo:</strong> {documentoSeleccionado.receptor?.correo || "-"}</p>

              <h4>Resumen</h4>
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <tbody>
                    <tr><td style={{ padding: 8 }}>Total venta</td><td style={{ padding: 8, textAlign: "right" }}>{formatearColon(documentoSeleccionado.resumen?.totalVenta)}</td></tr>
                    <tr><td style={{ padding: 8 }}>Total venta neta</td><td style={{ padding: 8, textAlign: "right" }}>{formatearColon(documentoSeleccionado.resumen?.totalVentaNeta)}</td></tr>
                    <tr><td style={{ padding: 8 }}>Descuentos</td><td style={{ padding: 8, textAlign: "right" }}>{formatearColon(documentoSeleccionado.resumen?.totalDescuentos)}</td></tr>
                    <tr><td style={{ padding: 8 }}>Impuesto</td><td style={{ padding: 8, textAlign: "right" }}>{formatearColon(documentoSeleccionado.resumen?.totalImpuesto)}</td></tr>
                    <tr><td style={{ padding: 8, fontWeight: 700 }}>Total comprobante neto</td><td style={{ padding: 8, textAlign: "right", fontWeight: 700 }}>{formatearColon(documentoSeleccionado.resumen?.totalComprobante)}</td></tr>
                  </tbody>
                </table>
              </div>

              <h4>Detalle de productos / servicios</h4>
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead><tr><th>Línea</th><th>Código</th><th>Detalle</th><th>Cantidad</th><th>Precio unit.</th><th>Subtotal</th><th>IVA</th><th>Total línea</th></tr></thead>
                  <tbody>
                    {(documentoSeleccionado.detalle || []).map((linea) => (
                      <tr key={linea.linea}>
                        <td style={{ padding: 8 }}>{linea.linea}</td>
                        <td style={{ padding: 8 }}>{linea.codigo || "-"}</td>
                        <td style={{ padding: 8 }}>{linea.detalle || "-"}</td>
                        <td style={{ padding: 8, textAlign: "right" }}>{linea.cantidad}</td>
                        <td style={{ padding: 8, textAlign: "right" }}>{formatearColon(linea.precioUnitario)}</td>
                        <td style={{ padding: 8, textAlign: "right" }}>{formatearColon(linea.subtotal)}</td>
                        <td style={{ padding: 8, textAlign: "right" }}>{formatearColon((linea.impuestos || []).reduce((sum, imp) => sum + numero(imp.monto), 0))}</td>
                        <td style={{ padding: 8, textAlign: "right", fontWeight: 700 }}>{formatearColon(linea.montoTotalLinea)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {comerciosFiltrados.length > 0 && (
        <>
          <h2 style={{ marginTop: 28, textAlign: "center" }}>Totales netos por Comercio</h2>
          <table style={{ ...tableStyle, marginTop: 8 }}>
            <thead>
              <tr>
                <th>Comercio</th><th>Total neto</th><th>Documentos</th><th>IVA neto</th><th>Base neta</th><th>Última Fecha</th>
              </tr>
            </thead>
            <tbody>
              {comerciosFiltrados.map((c) => {
                const iva = TASAS.reduce((s, t) => s + numero(c.iva[t]), 0);
                const base = TASAS.reduce((s, t) => s + numero(c.base[t]), 0);
                return (
                  <tr key={c.comercio}>
                    <td style={{ padding: 8, textAlign: "center" }}>{c.comercio}</td>
                    <td style={{ padding: 8, textAlign: "center", fontWeight: 700 }}>{formatearColon(c.total)}</td>
                    <td style={{ padding: 8, textAlign: "center" }}>{c.cantidad}</td>
                    <td style={{ padding: 8, textAlign: "center" }}>{formatearColon(iva)}</td>
                    <td style={{ padding: 8, textAlign: "center" }}>{formatearColon(base)}</td>
                    <td style={{ padding: 8, textAlign: "center" }}>{c.fechaUltima ? new Date(c.fechaUltima).toLocaleDateString("es-CR") : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 20 }}>
            <div style={{ minWidth: 320, flex: 1 }}><h3 style={{ textAlign: "center" }}>Total neto por comercio</h3><Bar data={chartTopComercios} /></div>
            <div style={{ minWidth: 320, flex: 1 }}><h3 style={{ textAlign: "center" }}>IVA neto por comercio</h3><Bar data={chartIVAporComercio} options={{ scales: { x: { stacked: true }, y: { stacked: true } } }} /></div>
          </div>

          <div style={{ marginTop: 26 }}>
            <h2 style={{ textAlign: "center" }}>IVA neto por tarifa dentro de cada comercio</h2>
            {comerciosFiltrados.map((c) => (
              <div key={c.comercio} style={{ marginTop: 18, textAlign: "center" }}>
                <h3>{c.comercio} — Total neto {formatearColon(c.total)}</h3>
                <table style={{ ...tableStyle, marginTop: 8 }}>
                  <thead><tr><th>Tarifa</th><th>Base neta</th><th>IVA neto</th></tr></thead>
                  <tbody>
                    {TASAS.map((t) => (
                      <tr key={t} style={{ background: tarifaColores[t] }}>
                        <td style={{ padding: 8 }}>{t}%</td>
                        <td style={{ padding: 8 }}>{formatearColon(c.base[t])}</td>
                        <td style={{ padding: 8 }}>{formatearColon(c.iva[t])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}

      {!comerciosFiltrados.length && !cargando && <p style={{ textAlign: "center", marginTop: 16 }}>Sube tus XML para ver datos.</p>}
    </div>
  );
}

const numeroGrande = { fontSize: 20, fontWeight: 700 };

function cardStyle() {
  return {
    background: "#fff",
    padding: 14,
    borderRadius: 10,
    boxShadow: "0 8px 20px rgba(0,0,0,0.09)",
    textAlign: "center",
  };
}
