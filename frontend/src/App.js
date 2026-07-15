// src/App.jsx
import React, { useState, useMemo } from "react";
import { Bar, Pie } from "react-chartjs-2";
import "chart.js/auto";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";

const TASAS = ["0", "1", "2", "4", "8", "13"];

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

export default function App() {
  const [resultados, setResultados] = useState(null); // { iva: {...}, base: {...} }
  const [comercios, setComercios] = useState([]); // array of { comercio, total, cantidad, iva:{}, base:{}, fecha? }
  const [cargando, setCargando] = useState(false);

  // filtros
  const [filtroComercio, setFiltroComercio] = useState("TODOS");
  const [filtroTarifa, setFiltroTarifa] = useState("TODAS");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");

  // ----------------------------------------------------
  // SUBIR XMLs (múltiples)
  // ----------------------------------------------------
  const subirArchivos = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (let f of files) formData.append("files", f);

    try {
      setCargando(true);
      const res = await fetch("http://localhost:4000/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Error del servidor al procesar XMLs");
      const data = await res.json();

      // Normalizar globales
      const ivaNorm = {};
      const baseNorm = {};
      TASAS.forEach((t) => {
        ivaNorm[t] = Number(data.iva?.[t] || 0);
        baseNorm[t] = Number(data.base?.[t] || 0);
      });

      // Agrupar por comercio
      const mapa = {};

      (data.facturas || []).forEach((f) => {
        // Intentar extraer fecha si existe (campo FechaEmision en el XML -> backend puede enviar f.fecha)
        const fecha = f.fecha || f.FechaEmision || null;

        const nombre = f.comercio || "DESCONOCIDO";
        if (!mapa[nombre]) {
          mapa[nombre] = {
            comercio: nombre,
            total: 0,
            cantidad: 0,
            fechaUltima: fecha || null,
            iva: { "0": 0, "1": 0, "2": 0, "4": 0, "8": 0, "13": 0 },
            base: { "0": 0, "1": 0, "2": 0, "4": 0, "8": 0, "13": 0 },
          };
        }

        mapa[nombre].total += Number(f.total || 0);
        mapa[nombre].cantidad += 1;
        if (fecha) mapa[nombre].fechaUltima = fecha;

        // f.impuestos -> array of {tarifa, monto}
        const impuestos = Array.isArray(f.impuestos) ? f.impuestos : (f.impuestos ? [f.impuestos] : []);
        TASAS.forEach((t) => {
          const ivaFiltrado = impuestos.filter((i) => String(i.tarifa) === t);
          const sumaIVA = ivaFiltrado.reduce((acc, i) => acc + Number(i.monto || 0), 0);
          mapa[nombre].iva[t] += sumaIVA;

          // base por tasa enviada en f.bases (object)
          mapa[nombre].base[t] += Number((f.bases && f.bases[t]) || 0);
        });
      });

      setResultados({ iva: ivaNorm, base: baseNorm });
      setComercios(Object.values(mapa));
    } catch (err) {
      console.error(err);
      alert("Error al procesar archivos: " + err.message);
    } finally {
      setCargando(false);
    }
  };

  // ----------------------------------------------------
  // FILTRADOS
  // ----------------------------------------------------
  const comerciosFiltrados = useMemo(() => {
    return comercios.filter((c) => {
      // filtro comercio
      if (filtroComercio !== "TODOS" && c.comercio !== filtroComercio) return false;

      // filtro tarifa: show commerces that have >0 base or iva for that tarifa
      if (filtroTarifa !== "TODAS") {
        const t = String(filtroTarifa);
        if ((Number(c.iva[t] || 0) === 0) && (Number(c.base[t] || 0) === 0)) return false;
      }

      // filtro fechas (usa fechaUltima si existe)
      if (fechaInicio || fechaFin) {
        const fecha = c.fechaUltima ? new Date(c.fechaUltima) : null;
        if (!fecha) return false; // si la factura no tiene fecha no la incluimos en rango
        if (fechaInicio) {
          const inicio = new Date(fechaInicio + "T00:00:00");
          if (fecha < inicio) return false;
        }
        if (fechaFin) {
          const fin = new Date(fechaFin + "T23:59:59");
          if (fecha > fin) return false;
        }
      }

      return true;
    });
  }, [comercios, filtroComercio, filtroTarifa, fechaInicio, fechaFin]);

  // ----------------------------------------------------
  // EXPORTS
  // ----------------------------------------------------
  const exportComerciosExcel = () => {
    if (!comercios.length) return;
    const rows = [["Comercio", "Total", "Facturas", "IVA Total", "Base Total"]];
    comercios.forEach((c) => {
      const totalIVA = TASAS.reduce((s, t) => s + Number(c.iva[t] || 0), 0);
      const totalBase = TASAS.reduce((s, t) => s + Number(c.base[t] || 0), 0);
      rows.push([c.comercio, c.total, c.cantidad, totalIVA, totalBase]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Comercios");
    XLSX.writeFile(wb, "Comercios.xlsx");
  };

  const exportComerciosPDF = () => {
    if (!comercios.length) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Resumen por Comercio", 14, 18);
    const body = comercios.map((c) => {
      const totalIVA = TASAS.reduce((s, t) => s + Number(c.iva[t] || 0), 0);
      const totalBase = TASAS.reduce((s, t) => s + Number(c.base[t] || 0), 0);
      return [c.comercio, c.total.toFixed(2), c.cantidad, totalIVA.toFixed(2), totalBase.toFixed(2)];
    });
    doc.autoTable({ head: [["Comercio", "Total", "Facturas", "IVA", "Base"]], body, startY: 28 });
    doc.save("Comercios.pdf");
  };

  const exportIVAComerciosExcel = () => {
    if (!comercios.length) return;
    const rows = [["Comercio", "Tarifa", "Base", "IVA"]];
    comercios.forEach((c) => {
      TASAS.forEach((t) => {
        rows.push([c.comercio, t + "%", Number(c.base[t] || 0), Number(c.iva[t] || 0)]);
      });
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "IVA_por_comercio");
    XLSX.writeFile(wb, "IVA_por_comercio.xlsx");
  };

  // ----------------------------------------------------
  // PDF GLOBAL (tablas)
  // ----------------------------------------------------
  const exportPDFGlobal = () => {
    if (!resultados) return;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Reporte Global IVA", 14, 15);

    // IVA global
    doc.setFontSize(14);
    doc.text("IVA Global por Tarifa", 14, 30);
    const bodyGlobal = TASAS.map((t) => [t + "%", Number(resultados.base[t] || 0).toFixed(2), Number(resultados.iva[t] || 0).toFixed(2)]);
    doc.autoTable({ head: [["Tarifa", "Base", "IVA"]], body: bodyGlobal, startY: 36 });

    // IVA por comercio filtrados
    doc.text("IVA por Comercio (filtrados)", 14, doc.lastAutoTable ? doc.lastAutoTable.finalY + 12 : 100);
    const bodyCom = [];
    comerciosFiltrados.forEach((c) => {
      TASAS.forEach((t) => {
        bodyCom.push([c.comercio, t + "%", Number(c.base[t] || 0).toFixed(2), Number(c.iva[t] || 0).toFixed(2)]);
      });
    });
    doc.autoTable({ head: [["Comercio", "Tarifa", "Base", "IVA"]], body: bodyCom, startY: doc.lastAutoTable.finalY + 10 });
    doc.save("Reporte_IVA_Global.pdf");
  };

  // ----------------------------------------------------
  // CHART DATA
  // ----------------------------------------------------
  const chartIVAglobal = resultados
    ? {
        labels: TASAS.map((t) => t + "%"),
        datasets: [
          {
            label: "Base",
            data: TASAS.map((t) => Number(resultados.base[t] || 0)),
            backgroundColor: TASAS.map((t) => tarifaColores[t]),
          },
          {
            label: "IVA",
            data: TASAS.map((t) => Number(resultados.iva[t] || 0)),
            backgroundColor: TASAS.map((t) => {
              // make IVA colors a bit stronger
              return t === "13" ? "#e57373" : t === "8" ? "#ffb74d" : t === "4" ? "#ba68c8" : t === "2" ? "#81c784" : t === "1" ? "#29b6f6" : "#bdbdbd";
            }),
          },
        ],
      }
    : null;

  const chartTopComercios = {
    labels: comerciosFiltrados.map((c) => c.comercio),
    datasets: [
      {
        label: "Monto Total por Comercio",
        data: comerciosFiltrados.map((c) => c.total),
        backgroundColor: comerciosFiltrados.map(() => "#90caf9"),
      },
    ],
  };

  const chartIVAporComercio = {
    labels: comerciosFiltrados.map((c) => c.comercio),
    datasets: TASAS.map((t, idx) => ({
      label: t + "%",
      data: comerciosFiltrados.map((c) => Number(c.iva[t] || 0)),
      backgroundColor: tarifaColores[t],
    })),
  };

  // ----------------------------------------------------
  // RENDERS
  // ----------------------------------------------------
  return (
    <div style={{ padding: 28, fontFamily: "Arial, sans-serif", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ textAlign: "center" }}>Dashboard IVA — XML v4.4</h1>

      {/* CONTROLES */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
        <label style={fileLabelStyle}>
          Seleccionar XML(s)
          <input type="file" multiple accept=".xml" onChange={subirArchivos} style={{ display: "none" }} />
        </label>

        <button onClick={exportComerciosExcel} style={buttonStyle} disabled={!comercios.length}>
          Exportar Comercios Excel
        </button>

        <button onClick={exportComerciosPDF} style={buttonPdfStyle} disabled={!comercios.length}>
          PDF Comercios
        </button>

        <button onClick={exportIVAComerciosExcel} style={buttonStyle} disabled={!comercios.length}>
          Exportar IVA por comercio (Excel)
        </button>

        <button onClick={exportPDFGlobal} style={buttonPdfStyle} disabled={!resultados}>
          Exportar PDF Global
        </button>
      </div>

      {cargando && <p style={{ textAlign: "center" }}>Procesando archivos... ⏳</p>}

      {/* FILTROS */}
      <div style={{ marginTop: 20, marginBottom: 18, display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
        <div>
          <label>Comercio</label><br />
          <select value={filtroComercio} onChange={(e) => setFiltroComercio(e.target.value)} style={{ padding: 8, borderRadius: 6 }}>
            <option value="TODOS">Todos</option>
            {comercios.map((c) => (
              <option key={c.comercio} value={c.comercio}>
                {c.comercio}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Tarifa IVA</label><br />
          <select value={filtroTarifa} onChange={(e) => setFiltroTarifa(e.target.value)} style={{ padding: 8, borderRadius: 6 }}>
            <option value="TODAS">Todas</option>
            {TASAS.map((t) => (
              <option key={t} value={t}>{t}%</option>
            ))}
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

      {/* TOTALES GLOBALES */}
      {resultados && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
            <div style={{ ...cardStyle(), minWidth: 200 }}>
              <h3>Total Base</h3>
              <p style={{ fontSize: 20, fontWeight: 700 }}>₡{TASAS.reduce((s, t) => s + Number(resultados.base[t] || 0), 0).toLocaleString()}</p>
            </div>
            <div style={{ ...cardStyle(), minWidth: 200 }}>
              <h3>Total IVA</h3>
              <p style={{ fontSize: 20, fontWeight: 700 }}>₡{TASAS.reduce((s, t) => s + Number(resultados.iva[t] || 0), 0).toLocaleString()}</p>
            </div>
          </div>

          {/* IVA POR PORCENTAJE (GLOBAL) */}
          <div style={{ marginTop: 20 }}>
            <h2 style={{ textAlign: "center" }}>IVA por porcentaje (global)</h2>
            <table style={{ ...tableStyle, marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Tarifa</th>
                  <th>Base</th>
                  <th>IVA</th>
                </tr>
              </thead>
              <tbody>
  {TASAS.map((t) => (
    <tr key={t} style={{ background: tarifaColores[t] }}>
      <td style={{ padding: 8, textAlign: "center" }}>{t}%</td>
      <td style={{ padding: 8, textAlign: "center" }}>
        ₡{Number(resultados.base[t] || 0).toLocaleString()}
      </td>
      <td style={{ padding: 8, textAlign: "center" }}>
        ₡{Number(resultados.iva[t] || 0).toLocaleString()}
      </td>
    </tr>
  ))}
</tbody>

            </table>

            {/* Grafico IVA global */}
            <div style={{ marginTop: 18 }}>
              <Bar data={chartIVAglobal} />
            </div>
          </div>
        </>
      )}

      {/* TABLA DE COMERCIOS */}
      {comerciosFiltrados.length > 0 && (
        <>
          <h2 style={{ marginTop: 28, textAlign: "center" }}>Totales por Comercio</h2>

          <table style={{ ...tableStyle, marginTop: 8 }}>
  <thead>
    <tr>
      <th style={{ textAlign: "center" }}>Comercio</th>
      <th style={{ textAlign: "center" }}>Total Facturado</th>
      <th style={{ textAlign: "center" }}>Cant. Facturas</th>
      <th style={{ textAlign: "center" }}>IVA Total</th>
      <th style={{ textAlign: "center" }}>Base Total</th>
      <th style={{ textAlign: "center" }}>Última Fecha</th>
    </tr>
  </thead>

  <tbody>
    {comerciosFiltrados.map((c) => {
      const totalIVA = TASAS.reduce((s, t) => s + Number(c.iva[t] || 0), 0);
      const totalBase = TASAS.reduce((s, t) => s + Number(c.base[t] || 0), 0);
      return (
        <tr key={c.comercio}>
          <td style={{ padding: 8, textAlign: "center" }}>{c.comercio}</td>
          <td style={{ padding: 8, textAlign: "center" }}>₡{Number(c.total).toLocaleString()}</td>
          <td style={{ padding: 8, textAlign: "center" }}>{c.cantidad}</td>
          <td style={{ padding: 8, textAlign: "center" }}>₡{totalIVA.toLocaleString()}</td>
          <td style={{ padding: 8, textAlign: "center" }}>₡{totalBase.toLocaleString()}</td>
          <td style={{ padding: 8, textAlign: "center" }}>
            {c.fechaUltima ? new Date(c.fechaUltima).toLocaleDateString() : "-"}
          </td>
        </tr>
      );
    })}
  </tbody>
</table>


          {/* Gráficos extra */}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 20 }}>
            <div style={{ minWidth: 320, flex: 1 }}>
  	    <h3 style={{ textAlign: "center" }}>Top comercios (por total)</h3>
            <Bar data={chartTopComercios} />
          </div>


            <div style={{ minWidth: 320, flex: 1 }}>
              <h3 style={{ textAlign: "center" }}>IVA por comercio (apilado por tarifas)</h3>
              <Bar data={chartIVAporComercio} options={{ scales: { x: { stacked: true }, y: { stacked: true } } }} />
            </div>
          </div>

          {/* IVA por % dentro de cada comercio (con colores) */}
          <div style={{ marginTop: 26 }}>
            <h2 style={{ textAlign: "center" }}>IVA por % dentro de cada comercio</h2>

            {comerciosFiltrados.map((c) => (
  	      <div key={c.comercio} style={{ marginTop: 18, textAlign: "center" }}>
                <h3>{c.comercio} — Total ₡{Number(c.total).toLocaleString()}</h3>
                <table style={{ ...tableStyle, marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>Tarifa</th>
                      <th>Base</th>
                      <th>IVA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TASAS.map((t) => (
                      <tr key={t} style={{ background: tarifaColores[t] }}>
                        <td style={{ padding: 8 }}>{t}%</td>
                        <td style={{ padding: 8 }}>₡{Number(c.base[t] || 0).toLocaleString()}</td>
                        <td style={{ padding: 8 }}>₡{Number(c.iva[t] || 0).toLocaleString()}</td>
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

// small helper style function
function cardStyle() {
  return {
    background: "#fff",
    padding: 14,
    borderRadius: 10,
    boxShadow: "0 8px 20px rgba(0,0,0,0.09)",
    textAlign: "center",
  };
}
