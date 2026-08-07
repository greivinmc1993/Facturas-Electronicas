# 📄 Facturas Electrónicas - Analizador de IVA

![React](https://img.shields.io/badge/React-19-blue?logo=react)
![Node.js](https://img.shields.io/badge/Node.js-Express-green?logo=node.js)
![Status](https://img.shields.io/badge/Status-Completed-success)

Aplicación web desarrollada para **procesar facturas electrónicas en formato XML**, calcular automáticamente las bases imponibles e impuestos (IVA), agrupar la información por comercio y generar reportes visuales y exportables.

---

## 📸 Vista previa

> Agrega aquí una captura del proyecto.

```
docs/home.png
```

---

# ✨ Características

- 📂 Carga múltiple de archivos XML.
- 🧾 Lectura de Facturas Electrónicas.
- 💳 Compatibilidad con:
  - Factura Electrónica
  - Tiquete Electrónico
  - Nota de Crédito
  - Nota de Débito
- 📊 Cálculo automático de:
  - Base imponible
  - IVA por tarifa
- 🏪 Agrupación por comercio.
- 📈 Gráficos estadísticos.
- 📅 Filtros por fechas.
- 🔍 Filtros por comercio.
- 💰 Filtros por tarifa.
- 📄 Exportación a PDF.
- 📊 Exportación a Excel.

---

# 🛠 Tecnologías

## Frontend

- React 19
- Chart.js
- React ChartJS 2
- SheetJS (XLSX)
- jsPDF
- jsPDF AutoTable

## Backend

- Node.js
- Express
- Multer
- xml2js
- CORS

---

# 📁 Estructura del proyecto

```
Facturas-Electronicas/
│
├── backend/
│   ├── server.js
│   ├── package.json
│   └── node_modules/
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── README.md
│
└── EJECUTAR.txt
```

---

# ⚙ Instalación

## 1. Clonar el repositorio

```bash
git clone https://github.com/usuario/Facturas-Electronicas.git
```

---

## 2. Backend

```bash
cd backend

npm install

node server.js
```

Servidor disponible en:

```
http://localhost:4000
```

---

## 3. Frontend

```bash
cd frontend

npm install

npm start
```

Aplicación disponible en:

```
http://localhost:3000
```

---

# 🚀 Flujo de funcionamiento

1. Ejecutar Backend.
2. Ejecutar Frontend.
3. Seleccionar uno o varios XML.
4. El sistema procesa cada factura.
5. Se calcula automáticamente:

- Bases
- IVA
- Totales

6. Los datos se agrupan por comercio.
7. Se muestran gráficos estadísticos.
8. Se pueden exportar los resultados a PDF o Excel.

---

# 📊 Funcionalidades principales

### Procesamiento XML

- Lectura automática del XML.
- Eliminación de prefijos.
- Conversión de datos.
- Extracción de impuestos.

---

### Agrupación

El sistema agrupa automáticamente por:

- Comercio
- Tarifa
- Fecha

---

### Reportes

Genera:

- Tabla resumen
- Totales por comercio
- Bases imponibles
- IVA por tarifa
- Gráficos

---

### Exportación

- Excel (.xlsx)
- PDF

---

# 📈 Tarifas de IVA soportadas

| Tarifa | Descripción |
|---------|-------------|
| 0% | Exento |
| 1% | Reducido |
| 2% | Reducido |
| 4% | Especial |
| 8% | Reducido |
| 13% | General |

---

# 📦 Dependencias principales

### Backend

- express
- cors
- multer
- xml2js

### Frontend

- react
- chart.js
- react-chartjs-2
- xlsx
- jspdf
- jspdf-autotable

---

# 💡 Posibles mejoras

- Login de usuarios.
- Base de datos.
- Historial de reportes.
- Dashboard avanzado.
- Exportación CSV.
- Modo oscuro.
- Docker.
- Despliegue en la nube.

---

# 👨‍💻 Autor

**Tu Nombre**

GitHub:
https://github.com/tuusuario

LinkedIn:
https://linkedin.com/in/tuusuario

---
