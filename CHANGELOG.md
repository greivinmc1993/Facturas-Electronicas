## Corrección adicional v0.6.59 — QA migración entre versiones y autenticación HTTP

- `qa:version-upgrade` deja de consultar `/api/companies` sin autenticación después de la migración real desde v0.6.34. El proceso de Electron conserva el propietario en SQLite, pero un servidor HTTP nuevo requiere iniciar una sesión nueva.
- El QA comparte solo durante la ejecución una contraseña QA aleatoria por variable de entorno con el smoke empaquetado y usa `/api/auth/status`, `/api/auth/login` y la cookie `HttpOnly; SameSite=Strict` para consultar empresas, ventas, proformas y configuración. Comprueba explícitamente que el acceso sin cookie continúe devolviendo 401.
- Nuevo helper `tests/qa-version-auth.cjs` y 6 pruebas de regresión `tests/qa-version-auth-test.cjs` incorporadas a `npm test`, además de una comprobación del contrato de actualización. No se guardan secretos de QA en evidencias ni se desactiva autenticación.
- Se mantienen versión 0.6.59, permisos, módulos comerciales, esquema SQLite, instalador Windows, README unificado y las pruebas existentes. Ejecución real de la migración NSIS en Windows Actions: pendiente de revalidación.

---

## Corrección adicional v0.6.59 — QA de reinstalación NSIS

- `qa:install-upgrade` ya no exige erróneamente el formulario **Configurar propietario** en la segunda ejecución. Comprueba el inicio de sesión cuando la cuenta propietaria persiste en SQLite.
- Reutiliza una contraseña QA generada al inicio de la prueba mediante variable de entorno del proceso temporal; no se persiste en archivos ni se expone en reportes.
- Verifica la existencia de un único propietario después de reinstalar y mantiene los controles de HTTP 428/401, acceso con cookie auténtica y conservación de datos.
- Añadida regresión estática para ambos caminos de autenticación. La ejecución real de NSIS en Windows Actions sigue pendiente de validación.

---

## 0.6.59 — Arranque empaquetado autenticado y seguridad de sesiones (2026-11-09)

- Corrección del `qa:packaged` que exigía menú de empresas en una instalación nueva sin propietario: ahora valida pantalla de configuración protegida, rechazos 428/401, creación de cuenta temporal por API normal, inicio de sesión, menú comercial, preload y salud del servidor.
- El QA de Electron usa directorio temporal aislado y contraseña aleatoria; no desactiva controles de seguridad. Guarda captura también ante fallos de arranque cuando es posible y la evidencia del workflow sigue disponible como artefacto.
- Cambio de contraseña transaccional y con auditoría; revoca otras sesiones del mismo usuario para evitar accesos obsoletos.
- Actualizaciones de usuarios (activación, contraseña temporal y asignaciones) se validan y confirman en una transacción SQLite; revocación de sesiones posterior a confirmación.
- Nuevas pruebas de seguridad (10 verificaciones) y contrato del ejecutable (6 verificaciones); caso adicional HTTP real para invalidación de sesiones.
- Actualizados scripts, versiones, README y prueba de actualización NSIS desde v0.6.34. Sin cambios en el esquema SQLite y sin usuarios ocultos.
- **Límite:** el inicio real de Electron empaquetado, compilación Vite y NSIS deben verificarse en Windows/GitHub Actions; la existencia de QA estática no equivale a haber pasado esas ejecuciones.

---

## 0.6.58 — Bloqueo global, aviso de guardado y sesión null

- La pantalla de inicio y las transiciones de sesión toleran `state` o `user` nulos sin romper el render de React.
- El selector de inactividad para todos los usuarios (5, 15, 30, 60 minutos y desactivado) ahora puede ser modificado por el propietario, administradores de empresa, supervisores y cajeros autenticados; su efecto es **global** y las sesiones abiertas lo sincronizan. Se registran los cambios de política en auditoría y se exige haber cambiado la contraseña temporal.
- Se informa mediante notificación visible, con estado de éxito/error verificado por API, al guardar la configuración.
- Corrección de alineación real de controles: se anula `margin-bottom:18px` heredado por `label`, se fijan a 42 px la altura del selector y los botones, y se distribuyen en una cuadrícula de columnas estables; en móviles los controles se reordenan sin desplazamientos.
- Se reorganizó el panel de seguridad con diseño simétrico y adaptable: texto e indicador de tiempo guardado, selector de minutos, botones alineados y aviso de cambios pendientes. Se actualizó la leyenda para reflejar que todos los roles pueden cambiar el tiempo global.
- QA HTTP nativo corregido: `qa-servidor-real.cjs` realiza bootstrap de propietario y login temporal antes de consultar rutas protegidas, preserva la autenticación por cookie HttpOnly en descargas y pruebas de API, y comprueba los rechazos 428/401 cuando corresponde. Se evitan usuarios o bases de datos de prueba permanentes.
- Se incorpora QA automatizada de edición por los cuatro roles, persistencia global, auditoría, contraseñas temporales y render nulo.

---

## v0.6.57 — Roles multiempresa, carritos recuperables y barra de sesión (2026-11-09)

- CRUD de cuentas de personal por empresa, administradores delegados con límites, contraseñas temporales obligatorias y revocación de acceso a empresas y suspensión que invalida sesiones existentes.
- Restricciones de API por empresa/método/permiso con rechazo predeterminado y ocultamiento de costos y notas internas para cajeros.
- Borradores del punto de venta persistidos en SQLite por cajero y empresa, con recuperación o descarte después de un cierre/reinicio; la venta solo se registra al confirmar.
- Caja registra el usuario que abre una sesión nueva, impide a cajeros ver o cerrar turnos de otras personas y preserva sin asignación los historiales antiguos.
- Rediseño profesional de la barra de sesión, iconos, menú de perfil y configuración de bloqueo reservada al propietario. Bloquear ahora invalida la sesión del servidor.
- Nuevas suites QA para permisos, carritos y cajas por usuario, además de QA previo conservado.

## v0.6.56 — Autenticación del propietario y CSV de Caja mejorado (2026-11-09)

- Creación inicial del único propietario, con contraseña `scrypt` y hash seguro; nunca se instala una credencial por defecto.
- Inicio de sesión y cierre mediante cookie de sesión HttpOnly SameSite Strict, protección global de rutas comerciales y respaldos, bloqueo por inactividad ajustable (15 min predeterminados) y preservación de venta activa durante bloqueo.
- CSV de Caja: tabla consistente de cuatro columnas, bloques de sesión, resumen, cierre y gastos, cifras numéricas en CRC; PDF permanece con colones ₡.
- 7 pruebas adicionales de autenticación, pruebas generales e integración anteriores conservadas.
- La asignación de cuentas de personal por empresa queda para la siguiente versión. Aún no es multiusuario.

## v0.6.54 — CSV sin símbolo monetario y campos de cobro sin flechas (2026-11-09)

- En reportes CSV de caja, importes de CRC como cifras decimales (sin ₡ ni símbolos extraños); los PDF conservan la moneda visible.
- Normalización general de valores monetarios prefijados por ₡ al serializarlos en los CSV compartidos, sin modificar productos, textos ni datos almacenados.
- Eliminadas únicamente las flechas de aumento/disminución de los campos de efectivo recibido y otros pagos en Ventas. No cambia el control de cantidades ni las validaciones.
- Pruebas de regresión para formatos monetarios, signos negativos, seguridad de fórmulas y campos de Ventas.

## v0.6.53 — Control de caja y gastos (2026-11-09)

- Nueva pantalla Caja y gastos con apertura, fondo inicial, registro de egresos en efectivo y cierre mediante arqueo físico.
- Control por empresa, sesiones SQLite y protección transaccional para no abrir dos cajas a la vez.
- Los cobros se leen de pagos en efectivo de ventas activas, aislados mediante identificadores de pago por sesión.
- Reportes CSV (UTF-16 LE compatible con Excel) y PDF con totales, notas y detalle de gastos.
- Regresión automatizada de apertura, cierre, validación de importes, exportaciones y aislamiento multiempresa.
- Limitación documentada: anulaciones posteriores pueden cambiar resúmenes históricos recalculados; el cierre conserva su importe y diferencia.

## 0.6.52 — Costo histórico en Kardex

- Migración no destructiva `inventory_movements.unit_cost_cents` con disparador para registrar el costo conocido de movimientos nuevos.
- Historial y exportaciones CSV/PDF con valores de entradas, salidas y cobertura de costos, distinguiendo movimientos no valorados.
- Pruebas de regresión específicas de la captura histórica y protección de datos antiguos.

## 0.6.52 — CSV compatible con Excel Windows
- Exportaciones CSV en UTF-16 LE con BOM, manteniendo el separador regional `;`.
- Retirada la exportación .xlsx; se conservan CSV y PDF.
- Importación de catálogo compatible con UTF-16 LE, UTF-8 BOM y Windows-1252 antiguo.
- Corrección de caracteres acentuados sin modificar valores numéricos ni registros.

## 0.6.50 — Auditoría y corrección de exportaciones
- Corrección de codificación UTF-8 con BOM para los CSV y protección de fórmulas sin alterar cantidades negativas.
- Exportación de Kardex en CSV, XLSX y PDF; PDF de catálogo, movimientos, reposición y créditos; XLSX de valoración.
- Diseño unificado de reportes PDF, metadatos y pruebas de exportación.
- Se mantienen archivos históricos únicamente en este CHANGELOG.md.

## v0.6.49 — Valoración de inventario al costo

- Vista global por empresa de valor conocido de existencias en colones y productos sin valoración por falta de costo CRC válido.
- Filtros por SKU/nombre, estado y disponibilidad de costo; paginación 50 artículos por página.
- Exportación CSV completa apta para Excel y PDF A4 horizontal, con todas las filas filtradas.
- Sin cambiar existencias, movimientos, estructura SQLite o cálculos comerciales.
- Nuevas pruebas unitarias e integración SQL para valorar existencias, exportar y aislar empresas.

## v0.6.48 — Eliminación de proformas

- Botón Eliminar proforma con doble paso: selección y confirmación explícita.
- API DELETE aislada por empresa, eliminación transaccional de proformas y sus líneas.
- Mensajes de éxito y error; no se afectan ventas, pagos ni inventario.
- Nuevas pruebas de QA para eliminación, inexistencia y aislamiento multiempresa.

## 0.6.47 — Ajustes de inventario y auditoría

- Permite realizar un ajuste con existencias finales en cero.
- Vista previa de existencias y variación antes de confirmar.
- Motivos sugeridos editables y validación de motivos de al menos cinco caracteres.
- Protección contra dobles envíos en movimientos manuales.
- Confirma el identificador del movimiento y sus saldos después de registrar.
- Controles transaccionales de cantidades y límites en el servidor.
- Pruebas de integración para ajustes, trazabilidad y validación.

## 0.6.46 — Kardex avanzado de inventario

- Vista global de movimientos por empresa, filtros combinados de artículo, tipo, fechas UTC y búsqueda.
- Indicadores de movimientos y variaciones reales de existencias, con paginación de 50 registros.
- Exportación CSV completa del historial filtrado, incluyendo artículos retirados y SKU.
- Se mantiene la corrección de QA de migración SQLite de v0.6.45.
- No se altera el esquema ni los movimientos existentes.

## 0.6.45 — Corrección del QA entre versiones

- Prueba de actualización 0.6.34 → 0.6.45 compatible con migraciones aditivas de SQLite.
- Verificación estricta de registros y columnas originales; rechazo de pérdidas, cambios de datos y costos históricos inventados.
- Seis pruebas adicionales del comparador integradas en `npm test`.

## 0.6.45 — Alertas y lista de reposición de inventario

- Vista priorizada por agotados y existencias bajas, separada por empresa.
- Cantidades sugeridas basadas en mínimos configurados, con una unidad sugerida si un agotado tiene mínimo cero.
- Estimación parcial de costo de reposición para productos con costo CRC válido; advertencia de costos desconocidos.
- Exportación CSV segura para Excel, con códigos SKU, unidades, prioridades y costo estimado.
- Sin compras automáticas, modificaciones de stock ni migraciones de base de datos.
- Pruebas unitarias del cálculo y contratos del servidor.

## 0.6.44 — Rentabilidad por producto

- Ranking de margen bruto por producto usando costo histórico capturado al registrar la venta.
- Cobertura explícita de líneas sin costo, porcentaje de margen calculado solo sobre ingresos cubiertos y distinción de pérdidas.
- Sección visual responsiva y exportación CSV resumen/PDF resumen y detallado.
- Pruebas SQL de filtros por cliente/empresa y coherencia de reportes.
- Conserva el instalador NSIS, GitHub Actions, README y CHANGELOG único.

## 0.6.43 — Comparativas y análisis comercial

- Comparación con el período anterior de igual longitud, respetando empresa y filtros, con crecimiento de ventas y transacciones.
- Resumen de evolución mensual y clientes recurrentes.
- Migración aditiva `sale_lines.unit_cost_cents` y captura del costo histórico **solo en ventas nuevas con costo registrado en CRC**.
- Estimación de margen bruto parcial sobre líneas cubiertas, con porcentaje de cobertura y advertencias de datos faltantes.
- Exportación CSV y PDF incorpora comparativa, márgenes parciales, meses y clientes frecuentes.
- QA ampliado: tests de cálculos, contratos, integración SQLite y comparación entre períodos.
- Mantiene instalador Windows y GitHub Actions; no se generan archivos de notas por versión.

# Versión 0.6.42 — Dashboard comercial avanzado

- Diseño equilibrado en ocho tarjetas KPI, rankings, gráficas, resúmenes, pagos y tabla paginada.
- Filtros combinables por fecha, cliente/consumidor final, condición, estado y método de pago.
- Consultas SQL agregadas aisladas por empresa, sin depender de las últimas 500 ventas.
- Exportaciones CSV resumen y detallado completo, PDF resumen vertical y detallado horizontal.
- Protección contra fórmulas CSV en campos de texto y escapado HTML para documentos PDF.
- QA nuevo para filtros, aislamiento, exportación y 510 ventas; conserva las pruebas anteriores.
- Sin cambios de esquema SQLite ni alteraciones de ventas registradas.

---

## 0.6.41 — Dashboard comercial
- Dashboard por empresa con métricas, tendencias diarias, productos más vendidos y métodos de pago.
- Rangos de fecha (UTC), períodos rápidos y exportación CSV.
- Consultas SQL agregadas que omiten ventas anuladas y no dependen del límite de historial.
- Pruebas de contrato y servidor HTTP para dashboard.

# Historial de cambios de FacturaCR

## v0.6.40 — Historial de respaldos y documentación

- Búsqueda por fecha o nombre en todas las copias automáticas disponibles.
- Alternar entre mostrar 20 o todas las copias; mensajes claros cuando no hay resultados.
- Se consolidan las notas históricas de versión en este único archivo.
- QA automatizado específico para el buscador.

---

## Archivo histórico de notas anteriores

El contenido siguiente procede de las notas de versión antiguas y se conserva para consulta en un solo archivo.

### NOTAS_VERSION_0.6.39.md

# FacturaCR v0.6.39 — Estabilidad al restaurar respaldos

- Bloqueo síncrono contra solicitudes repetidas de restauración desde la interfaz.
- Indicador visible de inspección/restauración y controles de respaldos temporalmente deshabilitados.
- Ventana de error específica si falla la inspección o restauración; recomienda verificar los datos antes de repetir.
- La confirmación positiva del servidor se presenta como restauración exitosa aunque después falle la recarga visual de empresas; ese segundo error se advierte por separado.
- Ventanas de éxito/error con un solo botón «Aceptar» y sin estilo peligroso.
- Dos comprobaciones nuevas en `tests/qa-contrato-restauracion-ux.cjs`.
- Se mantienen la inspección SQLite, la copia previa y la doble confirmación.

## QA

`npm test`: 57/57 comprobaciones locales aprobadas (7 monetarias, 31 estáticas/contratos, 19 de integración).
Sintaxis JSX verificada sin errores en `src/main.jsx` y `src/QuotesPanel.jsx`.
No se compiló Vite ni se ejecutó Electron/NSIS en este entorno: validar en GitHub Actions y Windows antes de distribuir.

---

### NOTAS_VERSION_0.6.38.md

# FacturaCR 0.6.38

Corrección de etiquetas de confirmación y notificación modal de éxito al restaurar respaldos. No se modifica la API ni el esquema SQLite.

---

### NOTAS_VERSION_0.6.37.md

# FacturaCR v0.6.37 — Inspección previa de respaldos

- Añade `/api/backups/inspect`: recibe una copia temporal, comprueba integridad SQLite, tablas esenciales y compatibilidad de columnas.
- Muestra al usuario recuentos de empresas, clientes, artículos, ventas y proformas en el respaldo **y** en la base actual antes de confirmar.
- No cambia los datos durante la inspección. El temporal se elimina incluso si la inspección falla.
- Se mantiene la doble confirmación, copia previa y verificación independiente en `/api/backups/restore`.
- Se amplía QA nativo con inspección válida e inválida.

**Nota:** el resumen muestra recuentos, no combina registros ni garantiza que el respaldo contenga exactamente las mismas columnas de la versión actual.

---

### NOTAS_VERSION_0.6.36.md

# FacturaCR v0.6.36 — Estabilidad y QA

1. Protección de envíos duplicados (ventas, abonos, anulaciones) en la sesión de React.
2. El carrito se vacía tras confirmar la escritura de la venta, independientemente del resultado de impresión.
3. Pruebas de contrato de bloqueo de operaciones.
4. QA de respaldos SQLite reales y rechazo de restauraciones inválidas en carpeta temporal.
5. GitHub Actions actualiza el ensayo v0.6.34 → v0.6.36.

No se cambian tablas ni migraciones comerciales.

---

### NOTAS_VERSION_0.6.35.txt

FacturaCR v0.6.35
QA real de actualización desde v0.6.34 hacia v0.6.35.
- Dos instaladores NSIS construidos de forma independiente en Windows GitHub Actions.
- Versión anterior congelada como fixture con SHA256.
- Suite de persistencia comercial y consulta HTTP después de actualizar.
- Reporte JSON y capturas del ejecutable de ambas versiones.
- 44 comprobaciones locales, incluido nuevo contrato de upgrade.
- Sin cambios de esquema ni lógica productiva; la nueva prueba de Windows requiere ejecución en GitHub Actions.

---

### NOTAS_VERSION_0.6.34.txt

FacturaCR v0.6.34 — QA de instalación Windows
- Prueba automatizada de instalación NSIS, reinstalación del mismo paquete y desinstalación en runner Windows efímero.
- Comprobación de persistencia e integridad de SQLite con empresa sintética.
- Capturas y reporte JSON en artefactos de GitHub Actions.
- 39 pruebas preexistentes conservadas.
- Sin modificaciones en API de ventas, contabilidad o migraciones de base de datos.

---

### NOTAS_VERSION_0.6.33.txt

FacturaCR v0.6.33 - QA del ejecutable empaquetado

- Amplía CI Windows con prueba de arranque real de release/win-unpacked/FacturaCR.exe.
- Usa exclusivamente directorio temporal de datos; no toca datos de negocios.
- Verifica ventana React, navegación, API de salud y bridges del preload.
- Captura evidencia visual y reporte JSON para GitHub Actions.
- El instalador NSIS sigue verificándose por existencia y SHA256.
- Pendiente: prueba manual de instalación, desinstalación, impresión física y restauración de respaldos en Windows.

---

### NOTAS_VERSION_0.6.32.txt

FacturaCR v0.6.32 — QA Windows y empaquetado automatizado

- Se mantiene la suite QA existente (npm test): cálculos, comprobaciones estáticas, integración SQLite con adaptadores y sintaxis.
- Nuevo npm run qa:real-server: smoke tests de API HTTP usando Express y better-sqlite3 reales, con base SQLite temporal y limpieza.
- Nuevo npm run qa:full: npm test + QA con dependencias reales + compilación Vite.
- GitHub Actions: segundo workflow Windows (push/PR a main y ejecución manual), Node.js 22, npm ci, tests, compilación React, instalador NSIS, verificación EXE y artefacto descargable.
- Metadatos y verificaciones de versión actualizados a 0.6.32.
- Sin cambios en esquema de base de datos ni lógica de ventas.

Nota: El instalador generado en CI no está firmado digitalmente; Windows SmartScreen puede mostrar advertencias.
Nota: Construir un instalador no equivale a probar su instalación y uso interactivo en Windows.

---

### NOTAS_VERSION_0.6.31.txt

FacturaCR v0.6.31 - QA integral y estabilidad

- Suite QA automatizada ejecutable con npm test (Node.js 22+).
- Pruebas de integración de rutas reales y SQLite temporal mediante adaptadores (NO usa datos del usuario).
- Pruebas de operaciones contables, stock, créditos, proformas, respaldos, empresas y rendimiento sintético.
- Se corrigió versión obsoleta en GET /api/health.
- Pendiente validación visual y del instalador en Windows y prueba con dependencias productivas.

---

### NOTAS_VERSION_0.6.30.1.txt

FacturaCR v0.6.30.1
Corrección visual: el carrito de compras muestra todas las filas de artículos sin un límite de altura ni barra de desplazamiento interna.
El historial de movimientos conserva su desplazamiento. No se alteran datos, cálculos ni ventas.

---

### NOTAS_VERSION_0.6.30.txt

FacturaCR v0.6.30 — Correcciones QA

1. Ajuste de redondeo de IVA prorrateado después de aplicar descuentos (sin ₡1 residual para descuentos totales de la base).
2. Carrito: precio por línea ahora muestra el importe con IVA y aclara que es antes del descuento; base separada.
3. Descuentos excesivos y ventas de importe nulo se identifican antes de confirmar.
4. Validación de descuentos negativos/no finitos en el servidor.
5. Metadatos sincronizados a la versión 0.6.30.
6. Sin migraciones de base de datos. Ventas existentes permanecen intactas.

---

### NOTAS_VERSION_0.6.29.1.txt

v0.6.29.1
- Mejora visual del carrito de compras en Ventas.
- Encabezado más destacado, estado vacío estilizado, filas más visibles, precio por línea resaltado y mejor presentación responsive.

---

### NOTAS_VERSION_0.6.29.txt

FacturaCR v0.6.29
- Proformas editables en el mismo registro y con importes históricos preservados.
- Datos adicionales del cliente (nombre comercial, identificación, contacto y dirección) en PDF.
- Captura opcional de datos del destinatario no registrado.
- Escáner de códigos debajo del buscador en Ventas.
- Sin cambios en inventario o pagos al editar proformas.

---

### NOTAS_VERSION_0.6.28.txt

FacturaCR v0.6.28 — Cotizaciones / Proformas
- Historial de proformas por empresa en SQLite.
- Logo reutilizado desde impresión o configurado exclusivamente para cotizaciones; preferencias persistentes.
- Generación de PDF A4 con cliente, líneas, IVA, vigencia y condiciones.
- No altera existencias, ventas ni pagos.

---

### NOTAS_VERSION_0.6.27.txt

FacturaCR v0.6.27 – Corrección de redondeo de precios con IVA incluido

- Si un artículo se configura con precio final IVA incluido, el total de la línea respeta ese precio (redondeado a colón entero).
- La diferencia entre base imponible redondeada e impuesto se atribuye al IVA de la línea para que subtotal + impuesto = precio final.
- Se aplica idéntico ajuste en la vista previa del carrito y en el cálculo transaccional del servidor.
- No se alteran ventas anteriores ni registros de abonos, inventario o respaldos.
- Comprobar antes de usar con ventas reales, descuentos y varios tipos de IVA.

---

### NOTAS_VERSION_0.6.26.txt

FacturaCR v0.6.26
- El buscador de clientes ocupa todo el ancho del carrito.
- La condición de venta se muestra debajo del cliente, en una fila independiente.
- Los resultados del buscador ya no modifican la altura del selector de contado o crédito.
- Cambios únicamente en JSX y CSS de distribución.

---

### NOTAS_VERSION_0.6.25.txt

FacturaCR v0.6.25
- La condición de venta conserva su altura normal mientras se muestran resultados del buscador de clientes.
- Corrección visual en el carrito, sin modificaciones de ventas ni base de datos.

---

### NOTAS_VERSION_0.6.24.txt

FacturaCR v0.6.24
- Sustituye el selector tradicional de clientes del POS por búsqueda con resultados clicables.
- Buscar por nombre, nombre comercial, cédula, teléfono o correo; acepta identificaciones con o sin separadores.
- Hasta 8 resultados visibles, con aviso para refinar; clic o flechas y Enter.
- Cliente elegido identificado claramente; Cambiar para volver a consumidor final.
- Conserva configuraciones del instalador profesional v0.6.23.

---

### NOTAS_VERSION_0.6.23.txt

FacturaCR v0.6.23 — Instalador de Windows personalizado

- Basado en la v0.6.22 (búsqueda de clientes, ventas, inventario, empresas y respaldos intactos).
- Asistente de instalación NSIS con imagen lateral exclusiva de FacturaCR (164 × 314 píxeles, BMP).
- Encabezado personalizado del asistente (150 × 57 píxeles, BMP).
- El desinstalador utiliza la misma identidad gráfica.
- Los accesos directos del programa y el instalador utilizan build/icon.ico de FacturaCR.
- La configuración NSIS utiliza español (LCID 3082).
- No se modifica la base SQLite ni la configuración de usuario.

Cómo compilar en Windows:
1. npm install
2. npm run build
3. npm run dist:win

El instalador .exe se genera en release/ tras compilar correctamente en Windows.
El archivo build/VISTA_PREVIA_INSTALADOR.png es una representación ilustrativa, no una captura del instalador ejecutándose.

---

### NOTAS_VERSION_0.6.22.txt

FacturaCR v0.6.22
- Búsqueda de cliente en Ventas por nombre, nombre comercial, cédula, teléfono o correo.
- El cliente seleccionado permanece visible mientras se aplican búsquedas.
- La búsqueda se reinicia al cambiar de empresa.
- No modifica cálculos de ventas, créditos ni base de datos.

---

### NOTAS_VERSION_0.6.21.txt

FacturaCR v0.6.21

- Corrige el color de Empresa activa en el menú lateral.
- El selector lateral y la lista de empresas muestran el color asignado como acento.
- Refina los iconos del menú para empresas, clientes, inventario, ventas y respaldos.
- Actualiza el icono base del instalador y del programa para una imagen más profesional.

---

### NOTAS_VERSION_0.6.20.txt

FacturaCR v0.6.20
- Color identificador personalizable para empresas, guardado en SQLite.
- Migración automática no destructiva de avatar_color.
- Selector de empresa visual con lista propia e iconos profesionales SVG.
- Vista previa del color en el formulario.
- Colores aplicados en la barra lateral y tarjetas de empresas.

---

### NOTAS_VERSION_0.6.19.txt

FacturaCR v0.6.19
- Creación y edición de empresas en ventana modal, sin formulario fijo en la pantalla de perfiles.
- Se preservan todos los campos de empresa y validaciones.
- Sin selector de color del icono: se mantiene el estilo automático.
- Bloque de empresa activa más compacto.
- Sin modificaciones del servidor, inventario, ventas ni respaldos.

---

### NOTAS_VERSION_0.6.18.txt

FacturaCR v0.6.18
- Se agregaron iconos pequeños en el menú lateral.
- Se redujo el tamaño del título FacturaCR para mejorar la simetría con el logo.
- La versión ahora se muestra solo en la parte inferior del lateral.
- Se amplió visualmente la caja de empresa activa y se mejoró el color del texto.
- Se añadió el rótulo Espacio de trabajo y se refinó el estilo del menú lateral.

---

### NOTAS_VERSION_0.6.17.txt

FacturaCR v0.6.17
- Nueva interfaz de respaldos: resumen, programación y listado de copias.
- Acceso a respaldos al pie del menú lateral.
- Botón para abrir la carpeta local de respaldos desde Electron.
- Conserva descarga, restauración y verificación de SQLite; sin cambios en la base de datos.

---

### NOTAS_VERSION_0.6.16.txt

FacturaCR v0.6.16
- Se compactó la tarjeta lateral de empresa activa.
- La pantalla Empresas se rediseñó con tarjetas de perfiles más visuales.
- Se agregó acceso directo para crear empresa y abrir/editar perfiles desde tarjetas.
- Se mantuvo el estilo general y la lógica actual del proyecto.

---

### NOTAS_VERSION_0.6.15.txt

FacturaCR v0.6.15
- Se añadió logo y cabecera visual en la barra lateral.
- La empresa activa ahora se selecciona rápidamente desde la barra lateral.
- Se agregó acceso directo para crear/cambiar empresa desde la tarjeta lateral.
- Ajustes de interfaz únicamente, sin alterar lógica de ventas ni respaldos.

---

### NOTAS_VERSION_0.6.14.txt

FacturaCR v0.6.14 — Alertas de inventario y consulta de movimientos

- Panel con contadores de productos controlados, agotados, stock bajo y disponibles.
- Filtros rápidos por estado, combinables con búsqueda y ordenamiento existente.
- Los agotados se destacan aunque el aviso de mínimos esté desactivado.
- Se visualizan mínimos por artículo.
- Historial de un artículo: filtrar entradas/salidas/ajustes por fechas; muestra motivos y observaciones.
- Resumen de variación neta positiva y negativa de los movimientos mostrados.
- No cambia tablas ni lógica de ventas; usa los datos existentes en SQLite.
- Historial detallado sigue limitado a los 300 registros más recientes por artículo.

---

### NOTAS_VERSION_0.6.13.txt

FacturaCR v0.6.13

- Vista previa de actualizaciones masivas en filas adaptables sin barra horizontal.
- Nuevo selector «Actualizar CABYS» independiente de precios y existencias.
- Validación estricta del CABYS (13 dígitos) y comprobación por artículo.
- Cambios aplicados de manera atómica con verificación de CABYS, precio y stock desde la vista previa.
- Antes de actualizar, exporta el catálogo y guarda una copia de seguridad.
- Excel: conserva CABYS como texto para no perder ceros iniciales.

---

### NOTAS_VERSION_0.6.12.txt

FacturaCR v0.6.12
- Exportación CSV y XLSX: Código IVA más nueva columna «IVA (%)» con el porcentaje asignado.
- Tiquete: porcentaje de IVA de cada línea y desglose de impuesto por tasa.
- Mantiene el CSV de importación compatible: la columna informativa IVA (%) se ignora al importar.
- No se modifican datos de ventas, tarifas ni cálculos.

---

### NOTAS_VERSION_0.6.11.txt

FacturaCR v0.6.11: Actualización masiva de precios y existencias desde CSV. Vista previa por SKU/código de barras, validación y transacción atómica. Historial de cambios de precio y movimientos de inventario. No modifica la importación original.

---

### NOTAS_VERSION_0.6.10.txt

FacturaCR v0.6.10: búsqueda rápida con sugerencias y lectura de códigos de barras USB (teclado + Enter). Conserva importación CSV y funciones de v0.6.9.2.

---

### NOTAS_VERSION_0.6.9.2.txt

FacturaCR 0.6.9.2
- Corregido exportar ventas filtradas a PDF en Electron con diálogo Guardar como.
- Catálogo POS paginado: 24 artículos por página; búsqueda global por nombre, SKU y barras.
- No se alteraron tablas, saldos ni base SQLite.
- Compilar con npm install, npm run build y npm run dist:win.

---

### NOTAS_VERSION_0.6.9.1.txt

FacturaCR v0.6.9.1
- Reportes filtrados para Excel (CSV) y PDF desde historial de ventas.
- La opción de impresión automática se guarda inmediatamente al marcarla/desmarcarla.
- Verificación de persistencia en SQLite al guardar ajustes de impresión.
- Mantiene lógica de ventas, abonos, inventario y respaldos.
- No incluye instalador .exe; compilar en Windows.

---

### NOTAS_VERSION_0.6.9.txt

FacturaCR v0.6.9
- Exportar las ventas visibles con filtros de fechas y búsqueda en CSV compatible con Excel.
- Preparar reporte imprimible A4 horizontal para Guardar como PDF mediante el diálogo de impresión de Windows.
- Se conserva la exportación CSV de todas las ventas.
- Corregida ubicación de filteredSales: antes estaba dentro de useEffect, fuera del alcance de la vista.
- No se cambian registros ni cálculos de ventas, créditos o respaldos.

---

### NOTAS_VERSION_0.6.7.txt

FacturaCR v0.6.7 - Cuadros visuales para todos los métodos de pago.
Cada método distinto de efectivo muestra un panel de importe semejante al de efectivo. No se modifica la lógica de pagos ni se calcula vuelto para métodos distintos de efectivo.

---

### NOTAS_VERSION_0.6.6.txt

FacturaCR v0.6.6 — efectos visuales en botones
- Hover: elevación, sombra y brillo sutil.
- Pulsación: respuesta de escala.
- Foco visible para teclado y accesibilidad.
- Respeta la preferencia de movimiento reducido.
- No se modificaron React, el servidor, las bases de datos ni los abonos.
- index.html restaurado de la versión v0.6.5 que volvió a funcionar.
- ZIP de código fuente; no incluye instalador de Windows.

---

### NOTAS_VERSION_0.6.3.txt

FacturaCR 0.6.3: personalización por empresa y tiquetes térmicos vía impresión Electron/Windows. Probar con impresora instalada y tamaños de papel configurados en Windows. No incluye ESC/POS.

---

### NOTAS_VERSION_0.6.3_MEJORAS.txt

FacturaCR v0.6.3 - mejoras de impresión y ventas (versión de prueba)
- Enumeración de impresoras Windows y selección por empresa.
- Guardado local de ajustes de impresión por empresa: impresora, papel, copias, plantilla, datos visibles y modo silencioso.
- Tiquete de prueba sin venta real, reimpresión y tiquete de venta anulada.
- Impresión directa opcional solo con impresora explícitamente seleccionada; el éxito de la API no garantiza salida física.
- Empresa predeterminada configurable desde Empresas. Se recuerda la empresa activa; la predeterminada tiene prioridad al reiniciar.
- Ventas NUEVAS: redondeo al colón más cercano para precio base, descuento, IVA, pagos y abonos; las ventas históricas no se migran.
- Enlace web del negocio en tiquete como texto. QR gráfico aún NO incluido.
- El PDF puede obtenerse desde el diálogo de impresión de Windows, según impresoras instaladas.
- El corte automático y la gaveta ESC/POS NO están implementados.
- Los ajustes se guardan en localStorage del perfil Electron, NO en el respaldo SQLite.
- Requiere pruebas reales en Windows con impresoras de 58 y 80 mm.

---

### NOTAS_VERSION_0.6.3_TICKET_CLIENTE_FE.txt

Tiquete: datos de empresa, número interno de venta, datos del cliente y campos FE solo si existen realmente. Los consecutivos y claves de Hacienda NO se generan ni inventan: requieren integración futura con Hacienda. Migración SQLite no destructiva. Respaldar antes de actualizar.

---

### NOTAS_VERSION_0.6.2.txt

FacturaCR v0.6.2 — versión de pruebas

- Precio final con IVA incluido en Artículos; cálculo automático del precio base.
- Ventas muestran y utilizan precio base sin IVA, con IVA desglosado.
- Migración no destructiva: los artículos anteriores mantienen su interpretación de precio anterior hasta ser editados y guardados. Al editar, se muestra su precio final calculado.
- Carrito y total más visibles.
- Registro de abonos posteriores a ventas a crédito desde el detalle de la venta; actualización del saldo en transacción SQLite.
- Conserva respaldos, clientes, inventario y funciones anteriores.

IMPORTANTE: Haz un respaldo antes de actualizar. Prueba con datos ficticios y verifica el cálculo y los saldos antes de operar con ventas reales. Las ventas siguen siendo registros internos, NO facturas electrónicas de Hacienda.

---

### NOTAS_VERSION_0.6.1.txt

FacturaCR v0.6.1
- Cobro en efectivo: el monto recibido se introduce en un campo resaltado y solo aparece al seleccionar Efectivo.
- El efectivo aplicado es el mínimo entre lo recibido y el importe restante tras los pagos no efectivos; la diferencia se muestra como vuelto.
- Pagos electrónicos no generan vuelto. Se rechaza el exceso de pagos no efectivos.
- Fotografías de productos visibles en el selector POS.
- Campo de medio de pago habitual retirado del formulario Clientes; se conserva el campo anterior en SQLite para compatibilidad.
- No se modifica la base de datos ni el historial existente.
- Pendiente de pruebas funcionales en Windows.

---

### NOTAS_VERSION_0.6.0.txt

FacturaCR v0.6.0 - POS interno en pruebas

Incluye: carrito, ventas de contado y a credito con saldo pendiente, pagos combinados,
calculo de IVA y descuento, descuento atomico de existencias, historial, detalles,
anulacion con motivo y reingreso de inventario, exportacion CSV.

Limitaciones deliberadas:
- Solo articulos con precios CRC. No convertir USD con un tipo de cambio arbitrario.
- El pago en efectivo registra el importe aplicado a la venta; el vuelto es informativo.
- Los abonos posteriores, vencimientos y estado de cuentas por cobrar quedan pendientes.
- No emite factura electronica, tiquete fiscal ni XML de Hacienda.
- La anulacion interna NO equivale a una nota de credito electronica.
- No probado con instalador de Windows; utilizar exclusivamente datos de prueba.

Antes de probar: crear respaldo en la v0.5.15 que funciona.

---
