# FacturaCR v0.6.59 — Seguridad de sesiones y QA del ejecutable empaquetado

**Versión vigente: 0.6.59 (9 de noviembre de 2026).** Esta actualización parte de v0.6.58 y conserva módulos comerciales, base SQLite e instalador NSIS.

## Corrección adicional de v0.6.59: migración real 0.6.34 → 0.6.59 (HTTP 401)

- **Causa del fallo en Actions:** la migración conservaba correctamente empresas, ventas, proformas e inventario, pero `qa:version-upgrade` consultaba `/api/companies` **sin cookie** después de iniciar un servidor HTTP nuevo. El usuario creado durante el smoke de Electron persiste en SQLite, pero su sesión en memoria **no se comparte entre procesos**; por seguridad, la API responde HTTP 401.
- **Corrección:** al arrancar el ejecutable nuevo, el QA entrega una contraseña temporal aleatoria mediante variable de entorno **solo al proceso de prueba**. El verificador HTTP consulta `/api/auth/status`, confirma que el propietario ya existe y que todavía no hay sesión, comprueba rechazo 401 sin cookie y realiza `POST /api/auth/login` con las credenciales efímeras. Utiliza la cookie `HttpOnly` / `SameSite=Strict` en las consultas de empresas, ventas, proformas y ajustes.
- **Seguridad:** no se crean accesos ocultos ni se deshabilita la autenticación; la cookie y la contraseña no se agregan al JSON de evidencias, a los argumentos del `.exe` ni a los logs. También se verifica que las rutas comerciales sigan rechazando solicitudes sin sesión después del login.
- **Cobertura:** seis pruebas nuevas ejecutables con `node tests/qa-version-auth-test.cjs`, incluidas en `npm test`, más verificación estática del contrato. El ensayo **real** entre instaladores v0.6.34 y v0.6.59 todavía debe aprobarse en **GitHub Actions Windows** para cerrar el incidente.
- La corrección se mantiene en **v0.6.59**, sin cambiar el esquema SQLite ni alterar módulos comerciales. Ejecutar el workflow **QA Windows e instalador** después de subir el código.

## Corrección adicional de v0.6.59: prueba de reinstalación NSIS (9 de noviembre de 2026)

- **Fallo corregido en `qa:install-upgrade`:** al reinstalar, el propietario creado durante el primer arranque **permanece en SQLite**. El QA del ejecutable ahora reconoce ambos estados seguros: `Configurar propietario` cuando no existe cuenta propietaria, e `Iniciar sesión` cuando ya existe.
- El ensayo de instalación/reinstalación comparte una contraseña de prueba aleatoria **solo entre procesos del runner temporal, mediante una variable de entorno**, sin escribir contraseñas en SQLite como texto plano, en la línea de comandos, en logs ni en evidencias.
- Se confirma que la segunda ejecución **no crea otro propietario**, que la API sigue exigiendo autenticación y que los registros de la empresa siguen presentes e íntegros tras reinstalar y desinstalar.
- Las pruebas reales del instalador **deben volver a ejecutarse en GitHub Actions Windows**. Las pruebas estáticas pueden pasar en otros sistemas, pero no sustituyen la ejecución del instalador NSIS real.

## Qué cambia en v0.6.59

- **Corrección del fallo `qa:packaged` en GitHub Actions:** el ejecutable arranca con una base de prueba aislada, por lo que es normal que aparezca primero **Configurar propietario**, sin barra lateral. El QA ahora verifica esa pantalla protegida y los rechazos HTTP **428** antes de la configuración y **401** antes del inicio de sesión. Después crea un propietario aleatorio exclusivamente en esa base temporal, inicia sesión usando las rutas reales y comprueba que aparezca el menú comercial, que el preload de Electron funcione y que responda `/api/health`.
- **Sin puertas traseras:** ninguna ruta se abre por ser un QA. La contraseña de prueba es aleatoria, no se registra en logs ni en los resultados y el directorio temporal se elimina al terminar. Los fallos capturan evidencia visual cuando es posible.
- **Cambios de contraseña más seguros:** las demás sesiones abiertas del mismo usuario se revocan; la sesión que acaba de acreditar la contraseña anterior permanece activa. Suspender una cuenta o cambiar su contraseña temporal sigue invalidando sus sesiones.
- **Gestión atómica de cuentas:** contraseña, activación y asignación a empresas se validan antes de escribir y se confirman mediante una transacción SQLite con auditoría; si una actualización falla, no debe dejar la cuenta modificada parcialmente.
- **Recuperación administrada para personal:** se mantiene el restablecimiento mediante cuentas autorizadas (propietario/administrador según alcance), que impone el cambio de clave temporal al ingresar. **No existe recuperación desatendida del propietario**: no se añadió una clave maestra ni un acceso oculto. Proteger las credenciales y los respaldos sigue siendo indispensable.
- **QA:** nuevas pruebas `qa-seguridad-sesiones.cjs` (sesiones, revocaciones, transacciones) y `qa-empaquetado-seguridad.cjs` (contrato del arranque Windows). La prueba `qa-servidor-real.cjs` también comprueba cambio de contraseña y cierre de sesiones antiguas contra HTTP/SQLite reales, al ejecutarse con dependencias instaladas.

## Comprobación y publicación

```bash
npm ci
npm test
npm run qa:real-server
npm run build
npm run dist:win
npm run qa:packaged
```

`qa:packaged` requiere **Windows** y el ejecutable generado en `release/win-unpacked/FacturaCR.exe`; GitHub Actions lo ejecuta automáticamente después del empaquetado. Las verificaciones de instalador y migración 0.6.34 → 0.6.59 se mantienen en `.github/workflows/windows-installer.yml`. Cuando una prueba no haya sido ejecutada en Windows no debe indicarse como aprobada.

**Actualización segura:** realiza un respaldo SQLite, confirma que el propietario conoce su clave, instala la versión nueva y revisa carritos pendientes antes de continuar operaciones. No se modificó el esquema de SQLite.

---

# FacturaCR v0.6.58 — Seguridad y bloqueo para todos los usuarios

- El tiempo de inactividad es **global**, puede configurarlo cualquier usuario autenticado (propietario, administrador, supervisor y cajero) y se aplica a todas las sesiones. Opciones: 5, 15, 30, 60 minutos o desactivado.
- La barra de seguridad conserva el aviso de cambios pendientes y muestra una confirmación únicamente después de recibir respuesta satisfactoria de la API.
- **Diseño corregido:** el selector y los botones comparten altura de 42 px y línea inferior exacta; se eliminó el margen inferior heredado que desplazaba el selector 18 px por encima de los botones. Diseño adaptable a ventanas estrechas.
- Se mantiene la protección de sesión nula y la prueba de servidor HTTP que inicia sesión antes de acceder a rutas protegidas.
- La corrección visual no modifica SQLite, roles, ventas ni otras pantallas.

---

# FacturaCR v0.6.58 — Corrección de sesión y confirmación de seguridad

## Cambios en v0.6.58

- **Inicio de aplicación corregido:** la pantalla de acceso no intenta leer datos del usuario antes de recibir el estado de autenticación. Evita el error `Cannot read properties of null (reading 'user')` al iniciar o finalizar una sesión.
- **Tiempo de bloqueo editable por cualquier usuario:** propietario, administradores de empresa, supervisores y cajeros pueden acceder a **Mi sesión → Seguridad y bloqueo** y elegir **5, 15, 30, 60 minutos o desactivado**, con **15 minutos** como valor inicial. **La configuración es global**: el cambio afecta a todos los usuarios y las sesiones abiertas lo adoptan automáticamente. Cada cambio efectivo se registra en el historial de auditoría con el usuario responsable. Las cuentas con contraseña temporal deben cambiarla primero.
- **Confirmación real del guardado:** al guardar seguridad se muestra una notificación visible de éxito con el tiempo aplicado a todos los usuarios, únicamente después de recibir respuesta válida de la API. Los errores se informan como fallos; los cambios no guardados se advierten antes de guardar. El aviso se oculta automáticamente a los 6 segundos y permite cerrarlo manualmente.
- **Barra de seguridad alineada:** información y estado del tiempo actual a la izquierda; selector y botones de guardar/cerrar agrupados y alineados a la derecha. Distribución adaptable en monitores anchos, tabletas y ventanas estrechas. Se eliminó el texto antiguo que atribuía el ajuste exclusivamente al propietario.
- **Corrección del QA HTTP con dependencias reales:** `tests/qa-servidor-real.cjs` ahora prueba primero el rechazo inicial (HTTP 428), crea el propietario temporal en una carpeta aislada, comprueba que sin sesión devuelve HTTP 401, inicia sesión y envía la cookie segura a rutas de empresas, respaldos y exportaciones. No se desactiva ninguna comprobación de autenticación ni se crea usuario permanente.
- **Pruebas:** caso `qa-seguridad-config.cjs` para selección global por los cuatro roles, auditoría, contraseña temporal, valores inválidos y comprobación del estado nulo de la interfaz. Se conserva el resto del proyecto, sus pruebas y la compilación NSIS.

**Actualización:** respaldar la base SQLite antes de instalar. No hay cambios al esquema ni borrado de datos. Si quedó un borrador de venta, revisarlo tras volver a iniciar sesión.

---

# FacturaCR v0.6.57 — Usuarios por empresa, ventas recuperables y sesión profesional


## Nuevo en v0.6.57 — Usuarios, control de caja y recuperación de carritos

- **Usuarios reales por empresa:** el propietario puede crear administradores de empresa, supervisores y cajeros; asignar y retirar acceso por empresa, suspender o reactivar cuentas y restablecer contraseñas temporales. El administrador de empresa solo puede crear o administrar subordinados dentro de sus empresas y no puede crear otros administradores ni administrar al propietario. La contraseña temporal debe cambiarse antes de usar rutas comerciales.
- **Controles en servidor con denegación predeterminada:** cada petición de un usuario no propietario se valida por empresa, método y permiso; operaciones sin autorización explícita se rechazan. El propietario puede configurar el intervalo de inactividad, mientras que cualquier usuario puede bloquear su propia pantalla. El bloqueo inmediato revoca la cookie de sesión en el servidor. El cierre de sesión desmonta la interfaz del usuario anterior.
- **Sesión rediseñada:** barra con avatar e icono, identidad y estado de conexión; menú **Mi sesión → Bloquear ahora / Seguridad y bloqueo (propietario) / Cerrar sesión**. Configuración de 15 minutos predeterminados, con 5/15/30/60 o desactivado. Configuración delegada a propietario, no a cajeros.
- **Borrador persistente por usuario y empresa en SQLite:** carrito, cantidades, cliente, tipo de venta, descuentos y pagos en preparación; restaurar o descartar al ingresar de nuevo tras cerrar el programa. Se guardan cambios secuencialmente en SQLite y se intenta guardar el último estado al cerrar la ventana. Una venta confirmada elimina su borrador en la misma transacción. La restauración reconstruye artículos según el catálogo vigente: hay que verificar precio, stock y pago antes de confirmar. Los borradores no mueven inventario ni cobran. Un apagón instantáneo podría perder el último cambio no escrito.
- **Caja por cajero:** las sesiones nuevas guardan quién abrió el turno; un cajero solo ve y cierra su propia sesión. Supervisores y administradores conservan el acceso a reportes y gastos según sus permisos. Los cierres antiguos mantienen usuario no asignado, sin inventar identidades.
- **Privacidad:** en el catálogo del cajero la API no devuelve costos de compra ni notas internas. Los usuarios sin permisos para respaldos y configuración no obtienen acceso por llamar directamente a su API.
- **QA:** `npm test` incluye pruebas de cuentas y roles, cambio obligatorio de contraseña, separación por empresa, borradores, control de acceso a reportes, caja por usuario y regresión de ventas.

**Precauciones antes de actualizar:** haz un respaldo de `facturacr.sqlite` desde la instalación funcional previa. La aplicación funciona localmente, sin recuperación remota de credenciales. Conserva la clave del propietario. Por ahora el historial de ventas no identifica el vendedor de registros históricos previos a esta versión; el control de cajero se aplica a sesiones nuevas de caja. El envío al cerrar la ventana y el guardado de borradores no garantizan preservar un cambio escrito justo en el instante de un corte brusco de corriente.

**Instalación / verificación:** `npm ci`, `npm test`, `npm run dist:win`. No elimina empresas, productos, clientes, ventas, créditos ni respaldos existentes. La compilación Vite y el instalador real requieren validación en Windows/GitHub Actions si no se dispone de dependencias en el entorno de trabajo.

## Anterior: v0.6.56 — Inicio de sesión y Caja CSV mejorada

- **Acceso real y obligatorio**: primera apertura crea una cuenta propietaria local (sin cuentas de desarrollador), mediante un asistente de configuración. Contraseñas con `scrypt` y sal criptográfica, sesiones con tokens aleatorios y cookies `HttpOnly`, `SameSite=Strict`.
- **Protección de API**: todas las rutas comerciales, caja, datos, respaldos y configuración exigen sesión válida; solo las rutas de inicio y diagnóstico quedan públicas. **En esta etapa solamente puede iniciar sesión el propietario**: crear supervisores/cajeros y asignar permisos efectivos queda para la siguiente versión.
- **Bloqueo automático**: 15 minutos predeterminados, configurables en la barra superior (5, 15, 30, 60 o sin bloqueo). La actividad real del usuario reinicia el temporizador. El carrito de venta continúa montado detrás del bloqueo y se recupera al desbloquear. Cerrar sesión o reiniciar la aplicación no garantiza persistir un carrito sin guardar.
- **CSV de caja más legible**: misma tabla de cuatro columnas, con secciones `REPORTE DE CAJA`, `SESIÓN`, `RESUMEN`, `CIERRE` y `GASTOS`; fechas completas, detalles, categorías, importes numéricos CRC, sin caracteres `₡` ilegibles en Excel y sin `.xlsx`. Los PDF siguen mostrando ₡.
- **Seguridad y límites**: sin usuarios ocultos ni claves maestras. La instalación requiere acceso físico a este equipo para configurar el propietario. El mecanismo formal de recuperación de contraseñas se entregará en una versión posterior. Si se restaura un respaldo antiguo sin cuentas, será necesario configurar nuevamente el propietario; realizar siempre un respaldo actualizado antes de restaurar.
- **Pruebas**: `node --no-warnings tests/qa-auth.cjs` comprueba contraseñas, propietario único, sesiones, errores, expiración estructural, bloqueo de API y rechazo de orígenes externos. `npm test` conserva QA de módulos comerciales y de SQLite.
- **Pendiente**: verificación final de compilación Vite/instalador y renderizado real en Windows; los permisos finos por empresa todavía no están habilitados.

## Funciones anteriores: Caja y gastos en efectivo

- **Caja y gastos** en el menú lateral, separada por empresa. Apertura con fondo inicial, un solo turno abierto por empresa, gastos con categoría y descripción y cierre con efectivo contado y diferencia.
- Los ingresos de caja provienen únicamente de **pagos Efectivo** de ventas actualmente activas, incluyendo abonos a crédito; SINPE, tarjetas y transferencias no se suman al efectivo físico. Una sesión nueva inicia desde el último identificador de pago de la empresa y no recoge cobros previos.
- Historial de 20 sesiones y exportación de la sesión seleccionada a **CSV compatible con Excel** y **PDF** de escritorio. Los gastos no cambian existencias, ventas ni abonos; la diferencia del cierre se conserva registrada.
- **Limitación relevante:** la anulación posterior de una venta puede excluir sus cobros del resumen histórico recalculado; el saldo esperado y la diferencia al cerrar permanecen guardados. No se gestionan todavía devoluciones de efectivo ni transferencias de caja. Esto es un control operativo, no una conciliación contable formal.
- QA: `npm test` cubre apertura, límites, gastos, cierre, exportaciones y aislamiento entre empresas. GitHub Actions verificará la compilación y el instalador Windows con el próximo push.

**Corrección Excel para Windows:** los CSV se descargan con codificación UTF-16 LE y BOM, separador `;`, para que tildes y símbolos se interpreten correctamente al abrir directamente en Excel. Se retiraron todos los botones y endpoints `.xlsx`; se mantienen los PDF existentes.

**Nota:** CSV no almacena anchos de columna. Si Excel muestra `########` en una fecha, amplía la columna B (doble clic en su borde derecho). Excel también puede cambiar el formato de los números según la configuración regional.

**Importación:** el catálogo acepta archivos CSV UTF-16 LE, UTF-8 con BOM y Windows-1252 anteriores.

**QA:** ejecuta `npm test`. Genera el instalador con `npm run dist:win` y valida GitHub Actions.

---


## Nuevo en v0.6.49 — Valoración de inventario

- Nueva pantalla **Valoración inventario** con indicadores y tabla paginada de productos activos bajo control de existencias.
- Valor a costo registrado expresado en colones; los productos sin costo válido en CRC o con costo en USD se informan **sin valorar**, sin aplicar tipos de cambio arbitrarios.
- Filtros por nombre/SKU, estado de existencias y cobertura de costos.
- Exportaciones **CSV completo compatible con Excel** y **PDF horizontal** desde la aplicación de escritorio; ambos respetan los filtros y contienen todos los productos filtrados, sin límite de 50 filas.
- No modifica existencias ni el esquema de SQLite. Mantiene Kardex, ventas, proformas y los workflows de QA.
- Pruebas: `npm test`, `npm run build`, `npm run dist:win`.

## FacturaCR v0.6.41 — Dashboard comercial

- El historial de copias automáticas ahora permite **buscar por nombre o fecha**, incluso entre archivos más antiguos que los 20 mostrados inicialmente.
- Se puede alternar entre **Mostrar todas** y **Mostrar solo 20**. La búsqueda no mueve, borra ni restaura copias de seguridad.
- El historial de versiones se encuentra en un único archivo: [`CHANGELOG.md`](CHANGELOG.md). Se dejaron de generar archivos `NOTAS_VERSION_*.txt` o `NOTAS_VERSION_*.md`.
- Para validar: `npm test`, `npm run build`, `npm run dist:win`.

## FacturaCR v0.6.38 — Confirmación clara al restaurar respaldos

- Primer diálogo: **Continuar**, no Eliminar.
- Confirmación final: **Restaurar respaldo**, resaltada como acción de reemplazo.
- Tras el éxito del servidor: ventana **Restauración realizada con éxito**, con botón **Aceptar** y nombre de la copia previa.
- Se conservan la inspección de SQLite, la copia previa y las confirmaciones.
- Ejecuta `npm test`, `npm run build` y `npm run dist:win`; GitHub Actions ejecutará QA de Windows.

## FacturaCR v0.6.38 — Inspección segura antes de restaurar

Al seleccionar un archivo `.sqlite` en Respaldos, la aplicación verifica su integridad y muestra una comparación de registros del respaldo frente a la base activa. Se conserva la doble confirmación y la copia previa. La inspección no modifica las empresas actuales. Consulta `CHANGELOG.md`.

## FacturaCR v0.6.27 — Precio final con IVA incluido

Se corrigió el redondeo al registrar ventas con productos cuyo precio incluye IVA. Antes, un artículo con precio final ₡700 e IVA 13% podía terminar con total ₡699 porque la base y el IVA se redondeaban por separado.

Ahora se conserva el precio final por unidad y la diferencia de redondeo queda en el IVA de la línea: ₡619 base + ₡81 IVA = ₡700. El cálculo del carrito y el del servidor usan la misma regla. Los artículos registrados sin IVA incluido conservan la regla anterior.

**Importante:** las ventas anteriores se mantienen intactas. Comprueba primero con una venta de prueba antes de generar un nuevo instalador.

# FacturaCR v0.6.24 — Búsqueda rápida de clientes al vender

En Ventas, el selector tradicional de clientes fue reemplazado por un buscador con resultados clicables. Busca por nombre, nombre comercial, cédula (con o sin guiones), teléfono o correo; selecciona el resultado. La búsqueda presenta hasta ocho sugerencias y permite usar flechas y Enter. El cliente seleccionado queda visible, y el botón «Cambiar» permite elegir otro. Sin seleccionar cliente se registra como consumidor final (solo venta de contado). Las ventas a crédito siguen requiriendo seleccionar un cliente.

Esta actualización parte de la v0.6.23 y conserva las mejoras del instalador, respaldos y demás módulos.

## Prueba rápida

1. `npm install`
2. `npm run build`
3. `npm run desktop:dev`
4. En Ventas, escribe parte de un nombre, haz clic en el resultado y verifica que el cliente quede seleccionado.
5. Prueba también una cédula con y sin separadores, y el botón Cambiar.
6. Si funciona, ejecuta `npm run dist:win` desde Windows.

La información continúa almacenada en la base SQLite habitual; no reemplaces ni elimines la carpeta de datos de FacturaCR.

<div align="center">
  <h1>🇨🇷 FacturaCR</h1>
  <p><strong>Punto de venta y gestión comercial de escritorio para Costa Rica</strong></p>
  <p>Empresas · Clientes · Artículos · Inventario · Ventas · Crédito · Respaldos</p>
  <p>
    <img src="https://img.shields.io/badge/Versi%C3%B3n-0.6.52-blue" alt="Versión 0.6.52" />
    <img src="https://img.shields.io/badge/Estado-En%20pruebas-orange" alt="En pruebas" />
    <img src="https://img.shields.io/badge/Plataforma-Windows-0078D4" alt="Windows" />
  </p>
  <p>
    <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
    <img src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white" alt="Vite 6" />
    <img src="https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white" alt="Electron 44" />
    <img src="https://img.shields.io/badge/Node.js-Express-339933?logo=nodedotjs&logoColor=white" alt="Node.js y Express" />
    <img src="https://img.shields.io/badge/SQLite-Local-003B57?logo=sqlite&logoColor=white" alt="SQLite" />
  </p>
</div>

<hr />

<h2>📋 Acerca del proyecto</h2>
<p><strong>FacturaCR</strong> es una aplicación de escritorio, desarrollada para gestionar operaciones de negocios costarricenses desde una interfaz local. Utiliza <strong>SQLite integrado</strong>, por lo que no requiere instalar MySQL ni un servidor de base de datos independiente.</p>
<p>El proyecto se encuentra en desarrollo y pruebas. Su módulo de ventas genera registros comerciales internos; <strong>todavía no emite comprobantes electrónicos autorizados por Hacienda</strong>.</p>

<h2>✨ Funcionalidades</h2>
<ul>
  <li><strong>Empresas:</strong> gestión multiempresa, datos comerciales y tributarios; la empresa activa se selecciona desde su módulo.</li>
  <li><strong>Clientes:</strong> identificaciones, contacto, dirección y datos para futuras operaciones tributarias.</li>
  <li><strong>Artículos y servicios:</strong> fotografías, SKU, códigos de barras, CABYS, costos, precios, unidades y tarifas de IVA.</li>
  <li><strong>Inventario:</strong> entradas, salidas y ajustes con historial, prevención de existencias negativas y alertas de mínimo.</li>
  <li><strong>Punto de venta:</strong> carrito, ventas al contado y crédito, pagos en efectivo, tarjeta, SINPE Móvil y transferencia; combinación de medios de pago.</li>
  <li><strong>Historial:</strong> consulta de ventas y anulación con reposición de existencias según las reglas del sistema.</li>
  <li><strong>Cuentas por cobrar:</strong> abonos y seguimiento de saldos de ventas a crédito, incorporados para pruebas en v0.6.3.</li>
  <li><strong>Precios e IVA:</strong> precio final ingresado en Artículos, cálculo del precio base y desglose tributario en Ventas, en pruebas en v0.6.3.</li>
  <li><strong>Respaldos manuales:</strong> creación, descarga y restauración de bases SQLite con comprobaciones y protección previa a restaurar.</li>
  <li><strong>CSV:</strong> herramientas de importación y exportación, incluida exportación de movimientos de inventario, con ajustes para Excel en Windows.</li>
  <li><strong>Interfaz:</strong> diseño adaptable, búsquedas, ordenamiento y confirmaciones antes de acciones relevantes.</li>
</ul>

<h2>🖨️ Impresión y redondeo (v0.6.3, en pruebas)</h2>
<ul>
<li>Selección de impresora Windows por empresa, impresión de prueba, hasta 5 copias y modo silencioso opcional.</li>
<li>Diseños clásico, compacto y moderno; papel 58/80 mm, logotipo, mensaje, redes sociales y campos configurables.</li>
<li>Configuración guardada localmente por empresa; no se incluye en el respaldo de SQLite.</li>
<li>Empresa predeterminada seleccionable en Empresas, priorizada al reiniciar.</li>
<li>Las nuevas ventas y abonos redondean los montos al colón más cercano. Las ventas históricas conservan sus importes originales.</li>
<li>El enlace del negocio se muestra como texto. QR gráfico y funciones ESC/POS quedan pendientes.</li>
<li>Se requiere probar la impresión física en Windows con controladores de 58 y 80 mm.</li>
</ul>

<h2>🧰 Tecnologías</h2>
<table>
  <thead><tr><th>Capa</th><th>Tecnología</th></tr></thead>
  <tbody>
    <tr><td>Interfaz</td><td>React 19, Vite 6, CSS</td></tr>
    <tr><td>Escritorio</td><td>Electron 44</td></tr>
    <tr><td>API local</td><td>Node.js, Express 4</td></tr>
    <tr><td>Base de datos</td><td>SQLite, better-sqlite3</td></tr>
    <tr><td>Instalador</td><td>electron-builder, NSIS (Windows)</td></tr>
  </tbody>
</table>

<h2>📁 Estructura</h2>
<pre><code>FacturaCR/
├── build/             # Iconos y recursos de instalación
├── electron/          # Proceso principal de Electron
├── server/            # API Express y persistencia SQLite
├── src/               # React y estilos
├── index.html
├── package.json
├── package-lock.json
├── vite.config.js
├── .gitignore
└── README.md</code></pre>

<h2>🚀 Instalación y ejecución</h2>
<p><strong>Requisitos:</strong> Windows 10/11 x64, Node.js 22 LTS y npm. Si los módulos nativos lo requieren, instalar las herramientas de compilación C++ de Visual Studio.</p>
<p>Clona el repositorio privado y entra en su carpeta:</p>
<pre><code>git clone URL_DEL_REPOSITORIO
cd FacturaCR</code></pre>
<p>Sustituye <code>URL_DEL_REPOSITORIO</code> por la dirección real del repositorio.</p>
<p>Instala las dependencias y ejecuta la versión de escritorio en desarrollo:</p>
<pre><code>npm install
npm run desktop:dev</code></pre>
<p>Otros comandos disponibles:</p>
<table>
  <thead><tr><th>Comando</th><th>Función</th></tr></thead>
  <tbody>
    <tr><td><code>npm run dev</code></td><td>Inicia API y Vite</td></tr>
    <tr><td><code>npm run build</code></td><td>Compila la interfaz en <code>dist/</code></td></tr>
    <tr><td><code>npm run desktop</code></td><td>Compila y abre Electron</td></tr>
    <tr><td><code>npm run dist:win</code></td><td>Genera instalador Windows NSIS en <code>release/</code></td></tr>
  </tbody>
</table>
<p>El instalador no se almacena en Git: se construye localmente. Para distribución pública se recomienda firmar digitalmente el ejecutable.</p>

<h2>💾 Datos y respaldos</h2>
<ul>
  <li>En desarrollo, SQLite se guarda normalmente en <code>data/</code>; en la versión instalada, en el directorio <code>userData</code> de Electron (habitualmente bajo <code>%APPDATA%</code>).</li>
  <li>Los datos de desarrollo y los de la instalación <strong>no se sincronizan automáticamente</strong>.</li>
  <li>Los respaldos y restauraciones manuales afectan la base completa, incluidas todas las empresas.</li>
  <li>Antes de actualizar o restaurar, crear una copia externa y comprobar que puede recuperarse.</li>
  <li>Los respaldos actuales no están cifrados: tratarlos como información confidencial.</li>
  <li>Los respaldos automáticos se planifican para la versión 0.6.4; aún no están implementados.</li>
</ul>

<h2>🕘 Evolución del proyecto</h2>
<table>
  <thead><tr><th>Versión</th><th>Principales avances</th></tr></thead>
  <tbody>
    <tr><td>0.4.x</td><td>Datos tributarios de clientes, artículos y servicios, fotos y migraciones de base de datos.</td></tr>
    <tr><td>0.5.0</td><td>Movimientos de inventario, trazabilidad y alertas de existencias.</td></tr>
    <tr><td>0.5.1–0.5.3</td><td>Mejoras de formularios, ordenamientos, empresa activa y confirmaciones.</td></tr>
    <tr><td>0.5.5–0.5.15</td><td>Respaldos manuales, interfaz responsive, exportaciones CSV y correcciones.</td></tr>
    <tr><td>0.6.0–0.6.1</td><td>Punto de venta, medios de pago, historial, correcciones del vuelto y fotos.</td></tr>
    <tr><td>0.6.3</td><td>Precio con IVA incluido, carrito destacado y abonos a crédito (en pruebas).</td></tr>
  </tbody>
</table>
<p>Las notas históricas se conservan en un único archivo <code>CHANGELOG.md</code>.</p>

<h2>🗺️ Hoja de ruta</h2>
<table>
  <thead><tr><th>Versión</th><th>Objetivo</th><th>Estado</th></tr></thead>
  <tbody>
    <tr><td>0.6.3</td><td>Tiquetes térmicos de 58/80 mm con impresoras Windows y diseños personalizables por empresa</td><td>Planificada</td></tr>
    <tr><td>0.6.4</td><td>Respaldos automáticos, programación, retención y validación de integridad</td><td>Planificada</td></tr>
    <tr><td>0.7.0</td><td>Reportes y estadísticas</td><td>Planificada</td></tr>
    <tr><td>0.8.0</td><td>Documentos electrónicos XML y representación PDF conforme a requisitos aplicables</td><td>Planificada</td></tr>
    <tr><td>0.9.0</td><td>Firma digital, envío y consulta de respuestas de Hacienda</td><td>Planificada</td></tr>
    <tr><td>1.0.0</td><td>Usuarios, autenticación y permisos</td><td>Planificada</td></tr>
    <tr><td>1.1.0</td><td>Licenciamiento comercial</td><td>Planificada</td></tr>
  </tbody>
</table>

<h2>🔐 Seguridad y limitaciones</h2>
<ul>
  <li>La API local escucha en <code>127.0.0.1</code>, pero todavía no cuenta con autenticación completa.</li>
  <li>La separación multiempresa organiza registros; no representa aislamiento de permisos entre usuarios.</li>
  <li>No publicar bases SQLite, respaldos, datos de clientes, certificados, claves privadas ni archivos <code>.env</code>.</li>
  <li><code>.gitignore</code> evita nuevas inclusiones accidentales, pero no elimina archivos ya rastreados por Git.</li>
  <li>El sistema no debe considerarse listo para operaciones tributarias reales ni para producción sin pruebas, controles de seguridad y validación regulatoria.</li>
</ul>

<h2>⚠️ Facturación electrónica</h2>
<p>Las ventas registradas actualmente y los futuros tiquetes térmicos son <strong>comprobantes internos</strong>; no sustituyen una factura electrónica validada por el Ministerio de Hacienda de Costa Rica. La generación XML, firma y envío se desarrollarán en etapas posteriores y deberán comprobarse contra las especificaciones oficiales vigentes.</p>

<h2>📄 Licencia</h2>
<p>Proyecto privado en desarrollo. No se concede autorización para copiar, redistribuir o comercializar el código por el mero hecho de acceder al repositorio. La licencia definitiva se establecerá antes de su distribución comercial.</p>

<hr />
<div align="center"><p><strong>FacturaCR</strong> · Desarrollado para negocios de Costa Rica 🇨🇷</p></div>


## Impresión térmica v0.6.3

Desde Ventas > Impresión de tiquetes puedes personalizar logotipo, mensaje, redes sociales, campos visibles y tamaño 58/80 mm por empresa. Desde el historial puedes previsualizar, imprimir y reimprimir tiquetes usando el diálogo de impresión de Windows. El papel y controlador deben estar configurados en Windows. No son comprobantes electrónicos autorizados por Hacienda.


<h2>💳 Histórico de ventas a crédito y abonos (v0.6.3, en pruebas)</h2>
<p>La sección Ventas incluye un histórico específico de ventas a crédito, con filtros por cliente, número, fecha y estado (pendiente, pagada o anulada), resumen de cuentas, consulta individual de cada abono (fecha, método e importe) y exportación CSV. Los registros se filtran por empresa activa y se almacenan en SQLite. Los pagos iniciales también se incluyen en el historial de pagos.</p>


### Ajustes de tiquetes (v0.6.3)
Los datos comerciales del tiquete (razón social, nombre comercial, identificación, dirección, teléfono, correo, sitio web y redes sociales) se administran en **Empresas → Editar datos**. Se eliminó la opción de QR. Las preferencias de impresión permanecen guardadas por empresa en el equipo.


### Guardar personalización de tiquetes
En **Ventas → Personalizar tiquete**, presiona **Guardar ajustes de impresión**. La configuración se guarda por empresa en el almacenamiento local de Electron; no se incluye aún en los respaldos SQLite.


### Logotipo del tiquete
En **Ventas → Personalizar tiquete**, puedes cargar un logotipo PNG, JPEG o WebP de hasta **800 × 800 píxeles** y **250 KB**. Se muestra una miniatura y puedes quitarlo antes de guardar. Los ajustes se conservan localmente por empresa mediante **Guardar ajustes de impresión**.

### v0.6.4 · Empresa recordada y respaldos automáticos
- La empresa activa se recuerda al cerrar y reabrir FacturaCR. Se eliminó la opción de empresa predeterminada.
- **Respaldos → Respaldos automáticos:** activación, frecuencia diaria/semanal/mensual, hora local, retención de 1 a 365 copias, creación manual y listado de copias.
- Se crean instantáneas consistentes con `better-sqlite3.backup()`, verificadas mediante `PRAGMA integrity_check`.
- La programación se guarda en `data/automatic-backup-settings.json` y los archivos en `data/automatic-backups/`. El directorio `data/` está excluido del repositorio Git.
- El programador funciona con FacturaCR abierto; al iniciar comprueba si hay una copia pendiente. No se instala una tarea independiente de Windows.
- **Limitación:** los ajustes de impresión guardados en localStorage aún no se incluyen en las copias SQLite automáticas. Copia también los datos de usuario de Electron antes de reinstalar Windows o cambiar de equipo.

### Claridad en configuración de respaldos
La opción **Cantidad de respaldos que deseas conservar** limita el número total de archivos automáticos (1 a 365). Por ejemplo, 14 respaldos diarios equivalen aproximadamente a dos semanas; el más antiguo se elimina al superar el límite. La casilla de activación ahora está alineada con su descripción.


### v0.6.5 · Personalización de tiquetes protegida por respaldos
- Los ajustes de impresión por empresa (logotipo, ancho de papel, plantilla, impresora, copias, etc.) se guardan también en SQLite.
- Al entrar a Ventas, la configuración previa de `localStorage` se migra automáticamente a SQLite si aún no existía en la base.
- Los respaldos manuales y automáticos de SQLite creados a partir de esta versión incluyen estas preferencias.
- Al restaurar una copia que contenga los ajustes, se recuperan automáticamente al abrir Ventas.
- La selección de empresa sigue recordándose localmente; no hay empresa predeterminada.
- Nota: los respaldos anteriores a esta actualización no contienen las preferencias de impresión. El respaldo de SQLite no incluye la configuración del programador de respaldos, guardada por separado en JSON.

### Corrección puntual: último colón de crédito
Se permite registrar el abono final cuando el saldo visible es ₡1 pero la base conserva céntimos. El servidor valida el saldo actual y liquida exactamente los céntimos pendientes dentro de una transacción SQLite. No se modificaron otros módulos de la interfaz.


### v0.6.6 — Botones animados
Efectos hover, pulsación y foco accesible; respeta movimiento reducido. Solo CSS.


## v0.6.8 — Historial y paneles plegables
- Historial de ventas: Hoy, Esta semana (lunes a hoy), Este mes, Este año, Todas las fechas y rango personalizado.
- Búsqueda por número, cliente o fecha combinable con el período.
- Cantidad y total de ventas visibles (total excluye anuladas).
- Historial de ventas y panel de créditos expandibles/plegables independientemente.
- El botón de exportación del historial conserva su comportamiento original: exporta todas las ventas de la empresa, no solo las filtradas.
- Sin cambios en la base de datos ni en la lógica de pagos y redondeo.

<h2>Actualización 0.6.9.2</h2>
<p>Reportes filtrados para Excel (CSV) y PDF, con corrección de persistencia de la opción de impresión automática por empresa. El cambio de esa casilla se guarda inmediatamente y se verifica en SQLite.</p>

<h2>Actualización v0.6.9.2 — PDF y catálogo grande</h2>
<ul>
<li>Los reportes filtrados se exportan a un PDF real con el selector de guardado de Windows por medio de Electron, sin ventanas emergentes.</li>
<li>El punto de venta muestra 24 artículos por página, con navegación anterior/siguiente y búsqueda por nombre, SKU y código de barras entre todos los artículos disponibles.</li>
<li>Se mantienen las operaciones de ventas, créditos, abonos, historial y respaldos.</li>
</ul>


## Novedades v0.6.10 — 1.000 artículos o más

- Búsqueda rápida por descripción, SKU o código de barras, con hasta ocho sugerencias seleccionables para añadir al carrito.
- Campo independiente para lectores de códigos de barras USB tipo teclado: escanear y Enter para añadir una unidad. También admite ingreso manual.
- Detecta códigos duplicados y evita agregar un artículo incorrecto.
- Conserva la paginación de 24 artículos por página de v0.6.9.2.
- La importación masiva CSV ya estaba disponible: hasta 2.000 productos por lote, vista previa y transacción todo o nada. No reemplaza artículos existentes.
- No se modifican las ventas, los abonos, la persistencia SQLite, los PDF ni los respaldos.


## v0.6.11: actualización masiva segura
En **Productos → Actualizar precios y existencias desde CSV**, exporta primero el catálogo y edítalo en Excel. Selecciona un CSV (hasta 2 MB o 2.000 filas), elige actualizar precios y/o ajustar existencias, valida la vista previa y confirma. El SKU o código de barras debe coincidir con un artículo existente. No se crean nuevos registros ni se modifica ningún artículo que no aparezca en el archivo. El lote es transaccional: si una fila falla, no se aplica nada. Se detectan cambios realizados desde la vista previa. Las diferencias de stock generan movimientos y los cambios de precio se registran en `product_bulk_price_changes`. Guarda un respaldo antes de una importación masiva.


### v0.6.12 — IVA visible
Al exportar artículos a CSV o XLSX ahora aparecen las columnas **Código IVA** e **IVA (%)**. Los tiquetes muestran la tarifa por artículo y un resumen de IVA por porcentaje, usando los datos históricos de cada venta. La nueva columna CSV es informativa y se ignora al importar artículos o actualizar precios/existencias.

## v0.6.13: vista previa adaptable y actualización de CABYS

En **Productos → Actualización masiva CSV** puedes elegir precios, existencias y/o CABYS. El archivo debe incluir SKU o código de barras, y los CABYS nuevos deben ser 13 dígitos. La vista previa es adaptable; la operación es atómica y verifica que los valores sigan siendo los mismos antes de guardar. Conserva los códigos CABYS como texto en Excel.


### v0.6.14 · Alertas y movimientos
En Productos, el panel Estado del inventario permite filtrar rápidamente agotados, stock bajo y disponibles. El historial individual permite consultar los últimos 300 movimientos por tipo y período, con sus motivos y observaciones.


## FacturaCR v0.6.17 — Vista de respaldos

- Resumen visual de la protección de datos y del número de copias automáticas.
- Programación diaria, semanal o mensual con hora local y retención de archivos.
- Historial de respaldos creados y verificados por SQLite.
- Botón **Abrir carpeta** que utiliza Electron para mostrar la carpeta local `automatic-backups`.
- Acceso rápido a respaldos y bloque informativo al final de la barra lateral.
- Se conserva la restauración con doble confirmación dentro de **Restauración y opciones avanzadas**.
- La carpeta automática sigue siendo la misma de versiones anteriores; esta entrega no permite cambiarla.

Antes de actualizar una instalación de trabajo, conserva una copia de `%APPDATA%\facturacr-desktop`.


## Novedad v0.6.22
En Ventas, busca clientes registrados por nombre, nombre comercial, cédula, teléfono o correo, y selecciónalos en la lista filtrada.


## v0.6.23 — Diseño del instalador Windows

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


## Novedad v0.6.28: Cotizaciones / Proformas

- Nueva sección **Cotizaciones / Proformas** en el menú izquierdo.
- Busca un cliente registrado por nombre o cédula, o escribe el nombre de un destinatario no registrado.
- Añade productos y servicios del catálogo, o conceptos personalizados con precio final e IVA.
- Guarda el documento en SQLite, consulta el historial y expórtalo como PDF A4 desde la aplicación de escritorio.
- El PDF incluye razón social, identificación y contacto de la empresa, cliente, conceptos, subtotal, IVA, total, vigencia, notas y condiciones.
- **Logo guardado por empresa:** puede usar el de Ventas → Personalizar tiquete o subir uno exclusivo para cotizaciones. En Preferencias guarda una vez el logo, su visibilidad, los días de vigencia y las condiciones. Todo queda en SQLite y en sus respaldos.
- Cada cotización conserva una copia del logo y de los precios aplicados, aunque después se actualice el catálogo.
- **Las cotizaciones NO generan ventas, ni cobran, ni descuentan existencias, ni constituyen comprobantes electrónicos de Hacienda.**
- Después de crear una proforma, elige **Guardar PDF de la proforma** para seleccionar la ubicación del archivo en Windows.

### Comprobaciones sugeridas

1. Guarda un logo desde los ajustes de tiquete o sube uno exclusivo desde Preferencias de proformas.
2. Guarda las preferencias y cierra/abre FacturaCR: deben persistir.
3. Agrega un artículo de ₡700 con IVA del 13% incluido; el total estimado debe ser ₡700.
4. Agrega un servicio personalizado, selecciona cliente y guarda la proforma.
5. Descarga el PDF y comprueba que el logo y los importes coinciden.
6. Verifica que el inventario, el historial de ventas y los pagos sigan sin cambios.

## Novedades v0.6.29
- Cotizaciones: botón **Editar proforma** al abrir un documento del historial. Se actualiza el mismo registro y se conserva el número, fecha, vigencia, condiciones y logo guardados.
- Puedes cambiar el cliente, título, observaciones, cantidades, agregar nuevos conceptos o quitar conceptos. Los precios originales de los renglones existentes se mantienen para evitar que una actualización del catálogo cambie cotizaciones anteriores.
- El PDF incluye información adicional del destinatario: nombre comercial, tipo de identificación, teléfono alternativo y dirección, cuando están disponibles.
- Para destinatarios no registrados, puedes abrir la sección de datos adicionales y agregar identificación, nombre comercial, teléfono(s), correo y dirección.
- Ventas: campo de escaneo de código de barras trasladado debajo del buscador principal para una distribución más clara.
- No se descuentan existencias ni se registran pagos al crear o editar proformas.

**Actualización:** la migración SQLite agrega columnas informativas sin eliminar registros anteriores. Realiza un respaldo antes de instalar. Para compilar en Windows: `npm install`, `npm run build`, `npm run dist:win`.

## Correcciones QA — v0.6.30

Esta versión incorpora las correcciones de redondeo de IVA con descuentos, claridad de precios en el carrito, validación previa de descuentos y sincronización del número de versión. Para detalles y limitaciones de las pruebas, consulta `INFORME_QA_CORREGIDO.md`.

Pruebas reproducibles (requieren Node.js):

```bash
node tests/qa-regresion-ventas.cjs
node tests/qa-estatica.cjs
```

## QA automatizado — v0.6.31

Con **Node.js 22+**, ejecuta `npm test` en la raíz del proyecto. Este comando corre los cálculos, las validaciones estáticas y una integración con **SQLite temporal**, sin usar tu base de datos. Los adaptadores de `tests/qa-adapters/` son **solo para pruebas**, no se emplean en la aplicación.

Revisa `INFORME_QA_v0.6.31.md` para conocer resultados, cobertura y límites. La compilación visual requiere `npm ci` y `npm run build`. Existe un workflow en `.github/workflows/qa.yml` para GitHub Actions cuando esté habilitado en el repositorio.


## QA Windows y generador de instalador (v0.6.32)

El workflow `.github/workflows/windows-installer.yml` se ejecuta al subir cambios a `main`, en pull requests dirigidas a `main`, o manualmente desde **GitHub → Actions → QA Windows e instalador → Run workflow**. Ejecuta el QA existente, prueba el servidor con Express y better-sqlite3 reales, compila React/Vite, genera el `.exe` NSIS y adjunta el instalador al run durante 7 días. Descarga desde la sección **Artifacts** al finalizar. El instalador no está firmado y no se valida su apertura interactiva en Windows.

Comandos locales en Windows después de `npm ci`:

```powershell
npm test
npm run qa:real-server
npm run qa:full
npm run dist:win
```

`npm test` se mantiene independiente de dependencias nativas en el adaptador de integración. `npm run qa:real-server` requiere instalar dependencias reales. `npm run qa:full` añade ambas y la compilación. Las bases de prueba se crean y eliminan en el directorio temporal del sistema; no se usan datos reales de `%APPDATA%`.


## QA del ejecutable Windows empaquetado (v0.6.33)

Además de las pruebas anteriores, el workflow `QA Windows e instalador` ahora ejecuta `npm run qa:packaged` después de empaquetar con electron-builder. Esta prueba **abre el ejecutable real** desde `release/win-unpacked/FacturaCR.exe`, con un directorio SQLite temporal exclusivo. Verifica que el servidor local responde, que React muestra la navegación y que los puentes seguros de Electron (impresión, PDF y respaldos) están disponibles. Al terminar, cierra la aplicación, elimina los datos de prueba y guarda una captura de pantalla y un resultado JSON como evidencias del workflow.

```powershell
npm ci
npm test
npm run build
npx electron-builder --win nsis --publish never
npm run qa:packaged
```

En GitHub puedes ver y descargar la evidencia bajo `FacturaCR-Electron-Smoke-N` en la ejecución del workflow. Si falla el arranque real, falla el job de Windows aunque se haya creado el instalador. La prueba no instala ni desinstala Windows, no valida impresoras físicas ni sustituye la restauración de una base de respaldo real en un equipo de prueba.


## QA de instalación y conservación de datos (v0.6.34)

El workflow de Windows incorpora una prueba **adicional** con un NSIS instalado de verdad sobre una carpeta temporal de un runner desechable: abre la aplicación, inserta una empresa de prueba en SQLite, reinstala el mismo paquete, vuelve a abrirlo, verifica los datos y comprueba que siguen presentes tras desinstalar. Publica evidencia JSON y capturas en **Actions → Artifacts**.

Esta prueba se ejecuta solo en GitHub Actions Windows y no debe hacerse manualmente en una computadora con FacturaCR instalado. **No prueba aún una actualización entre dos versiones distintas** ni reemplaza la validación manual de Windows o restauración de respaldos. `npm test` sigue ejecutando las 39 verificaciones locales sin instalar nada.

## QA de migración real entre versiones (v0.6.36)

La suite local se ejecuta con **`npm test`**: 44 comprobaciones de cálculos, integración, inspección estática y contrato de actualización. El test de migración real entre instaladores necesita Windows y **solo corre en el runner temporal de GitHub Actions**.

En el workflow **QA Windows e instalador**, GitHub construye el instalador anterior v0.6.34 desde `tests/fixtures/FacturaCR_v0.6.34_baseline.zip` (código congelado con SHA256), luego construye el instalador v0.6.36 e intenta instalar ambas versiones en secuencia en una ruta nueva de TEMP. Verifica empresas, clientes, productos, inventario, ventas, créditos, proformas y preferencias guardadas en SQLite, así como la lectura de datos históricos desde la API de la versión nueva.

Los resultados y capturas quedan en *Actions → Artifacts → FacturaCR-Electron-Smoke-...*, archivo `cross-version-upgrade-report.json`. El instalador nuevo se publica por separado como `FacturaCR-Windows-NSIS-...`.

Este ensayo no se ejecuta contra los datos de un cliente y no equivale a una certificación del instalador en todas las versiones de Windows. El alcance de QA y sus limitaciones quedan documentados en el historial de cambios y las pruebas.


## Actualización v0.6.36 — estabilidad en operaciones comerciales

- Protección de doble envío para ventas, abonos y anulaciones mediante bloqueo inmediato y estado visual.
- Se limpia el carrito al confirmarse la venta, antes de intentar impresión automática; un fallo de impresora no repite la venta.
- `npm test` incluye las pruebas de contrato de prevención de doble operación.
- `npm run qa:real-server` incluye verificaciones de respaldo real, integridad y rechazo de archivo inválido (base temporal).
- El QA Windows conserva el ensayo de migración desde la referencia congelada v0.6.34 hacia la versión actual.

**Límite:** no sustituye una prueba de impresión física ni una restauración supervisada en un equipo Windows real.


## Cambios de la versión 0.6.39

La restauración SQLite ahora incluye un indicador de operación activa, evita envíos repetidos, muestra errores en un diálogo claro y distingue el éxito de la restauración de cualquier fallo posterior al refrescar las empresas. Consulta `CHANGELOG.md`.


### Dashboard comercial (v0.6.41)

Nueva sección **Dashboard** con fechas de registro en UTC, ventas activas, importes, ticket promedio, crédito pendiente, evolución diaria, top de artículos y cobros por método. Los resultados se agregan en SQLite sin el límite de las últimas 500 ventas. Permite exportar el detalle diario a CSV. No calcula utilidad neta ni sustituye reportes fiscales.


## Dashboard comercial avanzado (v0.6.42)

El menú **Dashboard** incluye ocho indicadores comerciales, evolución diaria, ranking de productos y clientes, pagos por método, composición de ventas, resumen monetario y tabla de ventas con páginas de 50 filas.

**Filtros:** desde/hasta UTC (hoy, ayer, semana, mes, año o fechas personalizadas), cliente registrado por nombre, identificación, teléfono o correo, consumidor final, condición de venta, estado y método de pago. Los reportes y archivos exportados usan los mismos filtros. Las empresas nunca se mezclan. Los valores de ventas excluyen anuladas, incluso cuando se muestran las anulaciones en la tabla. El indicador de crédito pendiente corresponde a saldos históricos de las ventas que cumplen los filtros no temporales, mientras los cobros son pagos realizados durante las fechas seleccionadas, incluso si provienen de ventas anteriores.

**Exportaciones:**

- **CSV resumen:** métricas, IVA/descuentos, productos, clientes, ventas por condición, pagos por método y evolución por día.
- **CSV detallado:** una fila por venta, con empresa, período/filtros, número y fecha, cliente, identificación, contacto, estado, condición, subtotal, descuento, IVA, total, abonado, saldo, métodos, unidades y artículos. Exporta todas las ventas filtradas sin el límite de paginación de la pantalla.
- **PDF resumen:** documento A4 vertical con identidad de empresa, métricas, rankings, pagos y ventas recientes.
- **PDF detallado:** documento A4 horizontal con todas las ventas filtradas y totales, usando el generador PDF de Electron.

Los PDF se guardan desde la aplicación de escritorio mediante el diálogo de Windows. La web de desarrollo muestra un error claro si se intenta guardar PDF fuera de Electron. Los archivos son **informes comerciales internos**, no documentos fiscales autorizados por Hacienda ni reportes de utilidad neta.

**QA:** `npm test` cubre cálculo, contratos, rutas SQLite temporales, aislamiento de empresas, combinaciones de filtros, exportación CSV/PDF, paginación y más de 500 ventas. `npm run qa:real-server` requiere dependencias nativas y se ejecuta en GitHub Actions, junto con la compilación de Vite y las pruebas de Windows. La instalación continúa generándose con `npm run dist:win`.


## Dashboard — comparativas y margen bruto (v0.6.45)

El dashboard añade una comparación con el período inmediatamente anterior **de igual cantidad de días**, respetando los filtros de empresa, cliente, condición de venta, método de pago y estado. La variación porcentual solo se calcula cuando el período anterior tiene un importe distinto de cero. Incluye evolución mensual y clientes frecuentes (mínimo dos compras en el intervalo). El CSV resumen y ambos PDF incluyen las comparativas y el análisis de costo. El CSV detallado conserva una fila por venta para facilitar su análisis en Excel.

### Costo histórico y estimación responsable

Desde la v0.6.45, al registrar una venta, el servidor guarda `sale_lines.unit_cost_cents` (colones, centavos) cuando el artículo posee un costo positivo confiable en CRC. El valor queda fijo para esa venta aunque se modifique el costo en el catálogo. **Las ventas antiguas mantienen `NULL`** en este campo: no es posible deducir su costo original con seguridad. Los productos sin costo positivo registrado también quedan como `NULL`. La migración es aditiva: no borra ni reescribe transacciones anteriores.

El indicador de **margen bruto estimado parcial** usa únicamente líneas cuyo costo histórico está registrado: base de venta después de descuentos **sin IVA**, menos costo capturado por cantidad. Muestra cantidad de líneas cubiertas y cobertura porcentual. **No equivale a la utilidad neta**, no incluye gastos generales, devoluciones externas, depreciación ni salarios, y no debe interpretarse como rentabilidad de todas las ventas cuando la cobertura es incompleta.

### QA

Ejecuta `npm test` antes de cada publicación. La suite incluye casos de margen parcial, registro de costo histórico, períodos de igual duración, aislamiento de empresas, exportaciones y el resto de regresiones anteriores. `npm run dist:win` y los workflows de GitHub Actions se mantienen; la compilación real en Windows debe validarse al subir la versión.


### v0.6.45 · Rentabilidad por producto

El dashboard agrega ranking de productos por margen bruto cubierto usando únicamente costos históricos registrados en las líneas de venta, con cobertura de líneas, márgenes parciales y porcentajes. El informe CSV resumen y ambos PDF incluyen esta tabla. No se inventan costos para ventas antiguas.


### Alertas de inventario v0.6.45
En Inventario y servicios, la lista de reposición muestra productos agotados o bajo mínimos cuando las alertas están habilitadas. Permite exportar CSV con sugerencias; los costos son estimaciones parciales en CRC y no se registra ninguna compra.

### Corrección QA de migración 0.6.34 → 0.6.45

La verificación compara las columnas históricas y exige valores idénticos. Permite la columna nueva `sale_lines.unit_cost_cents`, pero comprueba que quede `NULL` para líneas anteriores a su creación. El comando `npm test` incluye una regresión específica.


## Kardex avanzado — v0.6.46

Desde **Kardex · Movimientos** se consulta el historial global por empresa con filtros de producto, tipo, fechas UTC y texto. El saldo anterior y posterior se lee del historial inmutable. Los indicadores calculan variaciones positivas y negativas (incluyen ajustes según su delta). La tabla muestra 50 movimientos por página y el CSV exporta **todos** los movimientos filtrados. El módulo es de solo lectura.

Ejecuta `npm test` antes de `npm run dist:win`; valida el trabajo de GitHub Actions en el próximo push, especialmente la actualización real desde v0.6.34.


### Ajustes de inventario v0.6.47

En Inventario y servicios → Movimientos puedes establecer existencias finales incluso en cero, seleccionar o escribir un motivo, previsualizar el saldo y confirmar un movimiento que queda registrado en el Kardex. Requiere motivo mínimo de 5 caracteres y evita dobles envíos desde la interfaz.

### Proformas v0.6.49

Desde el historial puedes seleccionar una proforma y usar **Eliminar proforma**. Requiere confirmar; elimina únicamente la proforma y sus conceptos en la empresa activa. No elimina ventas, pagos o existencias. La acción es irreversible: realiza un respaldo si necesitas conservar la información.


## Novedades de la v0.6.52

- Cada movimiento **nuevo** guarda una instantánea del costo unitario CRC conocido al registrarse (sin convertir USD).
- Kardex con valoración estimada de entradas/salidas, cobertura y detalle en CSV/PDF.
- Movimientos históricos anteriores quedan sin costo; **no se recalculan usando el costo actual**.
- El importe representa valor al costo, no ingresos, caja ni utilidad.
- Sin exportación XLSX; se mantienen CSV y PDF.

### Ajustes de v0.6.56

Los CSV de caja exportan cifras sin el símbolo ₡, con columnas identificadas en CRC. Los PDF conservan el formato monetario. Los campos monetarios de cobro en Ventas ocultan las flechas de incremento, pero aceptan valores escritos por teclado.
