# FacturaCR v0.6.93 — Cotejo orientativo del certificado con la empresa (NO fiscal)

## 1. Objetivo y cambios

Se conserva el selector de certificado `.p12` / `.pfx` de la v0.6.92, con **dos campos independientes** (archivo y contraseña), un botón separado **Aceptar y verificar**, y un resultado técnico de lectura, vigencia, algoritmo RSA y prueba local de clave. **Novedad:** al completar esta inspección, se compara *únicamente* el identificador nacional declarado en atributos específicos del asunto X.509 (`serialNumber` u `organizationIdentifier`, incluidos sus OID) con el número registrado en el **perfil de la empresa seleccionada**. El cotejo es informativo y no utiliza un servicio en línea.

Se distinguen tres resultados:

| Resultado | Interpretación | Qué debe hacer el usuario |
|---|---|---|
| **Coincidencia textual** | El atributo explícito del certificado coincide con la identificación visible de la empresa. | Continuar con revisión de titular/representante y de la cadena; **NO** habilita firma. |
| **Identificaciones diferentes** | Se detecta un identificador explícito diferente. | Revisar empresa seleccionada, tipo de certificado y facultades del representante. |
| **Identificación no concluyente** | No se dispone de un identificador explícito único, o el formato no permite compararlo. | Revisar certificado con documentación del emisor; no asumir coincidencia. |

No se deduce identidad a partir de números dentro del nombre común (`CN`), ni se considera prueba de titularidad, representación, inscripción fiscal, autorización de Hacienda o cadena de confianza. Ante varios identificadores diferentes, el resultado es **no concluyente**. Ninguno de estos estados activa firma fiscal ni envío.

## 2. Impacto técnico y seguridad

- Se añadió `electron/fe-certificate-company.cjs`, un comparador local de solo lectura, con protección contra coincidencias parciales y datos mal formados.
- El selector efímero de certificado y su ticket aleatorio permanecen vinculados a la empresa; el navegador no recibe ruta, clave privada ni archivo `.p12`.
- El identificador que muestra la ficha fiscal se entrega al IPC únicamente para una **comparación orientativa**, no como credencial ni como autorización de acceso; no se añade a tablas de resultados ni habilita operaciones fiscales.
- Se borran los bytes temporales del `.p12` una vez revisados, y la contraseña se limpia del formulario. El resultado solo contiene metadatos públicos y el diagnóstico; nunca se exporta la clave privada.
- No se modificaron permisos existentes, SQLite, ventas, cierres, XML de borradores, impresión ni los laboratorios XAdESjs. **Sin migración de base de datos**.
- **Pendientes obligatorios para emisión:** verificación de cadena y revocación, correspondencia legal del firmante con el emisor, política XAdES-EPES, firma real y verificación independiente, XSD oficial vigente y pruebas de Hacienda.

## 3. Cómo probar y validar las novedades (Windows)

**Primero:** crea y verifica una copia de respaldo SQLite. Prueba la lectura de un certificado de demostración o uno autorizado, **sin compartir el archivo ni su contraseña**.

**A. QA automático (no necesita certificado propio):**

```powershell
npm ci
npm run qa:certificate-company
npm test
npm run qa:real-server
```

La nueva batería ejecuta **16 controles si OpenSSL está disponible**; en ausencia de OpenSSL, ejecuta los controles restantes y señala expresamente que quedó pendiente el ensayo real de `.p12`. Comprueba igualdad exacta, diferencia, número dentro de `CN` ignorado, atributo ambiguo, ticket por empresa, eliminación del búfer y respuesta sin secretos.

**B. Comprobación visual en la aplicación Electron:**

1. Abre **Empresas → ficha fiscal / preparación FE 4.4** con una empresa de prueba. Comprueba su número de identificación.
2. En **Certificado digital de Hacienda (.p12 / .pfx)**, pulsa **Examinar**, elige un archivo autorizado y escribe su contraseña en el campo separado.
3. Pulsa **Aceptar y verificar certificado**. Busca el nuevo recuadro **Cotejo orientativo entre certificado y empresa** debajo de los datos técnicos.
4. Comprueba uno de los tres resultados: **Coincidencia textual**, **Identificaciones diferentes** o **Identificación no concluyente**. El resultado depende de los atributos declarados en el certificado, no del nombre de la empresa.
5. Cambia de empresa: la selección y el diagnóstico anterior deben borrarse. Selecciona de nuevo el certificado si corresponde.
6. Intenta usar contraseña incorrecta: debe aparecer un error sin mostrar la contraseña ni conservarla en el formulario. No hagas múltiples intentos innecesarios con certificados reales.
7. En cualquier caso comprueba **Firma y envío bloqueados**. La coincidencia textual **NO** debe permitir firmar XML comerciales ni enviar documentos.

**C. Validación del instalador:**

```powershell
npm run dist:win
```

Después de compilar instala **en un entorno de prueba**, abre el módulo y repite el cotejo. Esta prueba visual y la instalación NSIS todavía necesitan confirmación en Windows; aprobar las pruebas automatizadas por sí solo no certifica el ejecutable.

## 4. Resultados y límites de las pruebas

La nueva batería `npm run qa:certificate-company` utiliza datos y certificados **ficticios generados en directorios temporales**, sin material del contribuyente. No valida cadena de confianza real, RUT, representación, revocación ni aceptación por Hacienda. No constituye certificación de firma XAdES-EPES.

## 5. Instalación y GitHub

Con respaldo SQLite comprobado, ejecutar `npm ci`, `npm test`, `npm run qa:certificate-company`, `npm run qa:real-server` y `npm run dist:win`. Tras comprobar el instalador y GitHub Actions, publicar el código con `git add -A`, `git commit -m "feat: v0.6.93 cotejo seguro certificado y empresa"` y `git push`.

## 6. Siguiente versión

Priorizar verificación independiente de la **cadena de confianza y el estado de revocación**, con una fuente confiable de certificados raíz y política de validación definida; hasta entonces la firma fiscal y el envío permanecen bloqueados.

---

## FacturaCR v0.6.92 · Preparación de firma XAdES-EPES (laboratorio, NO fiscal)

- En el modal de borrador FE/TE 4.4 hay un nuevo bloque **«Preparación de firma XAdES-EPES · laboratorio seguro»**. El botón **«Probar motor XAdESjs con XML ficticios»** ejecuta el laboratorio existente con tres XML sintéticos, verifica dos referencias por firma y que seis alteraciones sean rechazadas.
- **El laboratorio no recibe ni firma el borrador real**, ni recibe el archivo `.p12`, contraseña, claves, empresa o cliente. No se presenta como comprobante firmado ni puede habilitar emisión.
- La lista de condiciones distingue: XSD local solo con firma pendiente, ensayo de motor XAdESjs, certificado/cadena de confianza, política oficial, numeración real y aceptación Hacienda. El ensayo nunca marca como resueltas las condiciones fiscales.
- No se modifica SQLite, la API de ventas, los XML 4.4 almacenados ni los cálculos tributarios. Se preserva el validador XSD de v0.6.91 y la corrección UTF-8 de MSYS2.

**Cómo probar v0.6.92 (Windows):**

1. Respaldar SQLite y reemplazar únicamente los archivos de proyecto; mantener la base de datos comercial.
2. Ejecutar `npm ci`, `npm run qa:xades:preparation`, `npm run qa:xades-engine`, `npm test`, `npm run qa:real-server`.
3. Abrir **FacturaCR de escritorio** → empresa de prueba → historial de ventas → venta FE/TE → borrador XML 4.4.
4. En la sección XSD usar la carpeta local de esquemas (si procede). En **Preparación de firma** pulsar **Probar motor XAdESjs con XML ficticios**.
5. Debe mostrar **3/3 documentos ficticios verificados, 6/6 alteraciones rechazadas**, con **Firma fiscal: bloqueada · Envío: bloqueado**. No debe generar un XML fiscal firmado.
6. Probar deshabilitando las dependencias o ejecutando en navegador: debe indicar que no se pudo completar, sin marcar «aprobado».
7. Compilar `npm run dist:win` y comprobar aplicación instalada con el motor integrado: pendiente hasta ejecutar en Windows.

**QA nuevo:** `npm run qa:xades:preparation`. **Limitaciones:** no se ha firmado un borrador FE/TE con un certificado de contribuyente, no se ha validado un documento firmado real con XSD oficial, no se comprobaron revocación ni identidad del firmante y no se envió nada a Hacienda.

---

# FacturaCR v0.6.91 — Diagnóstico XSD previo a la firma FE/TE

**Corrección adicional (Windows / MSYS2):** el diagnóstico del validador ejecuta Python con salida UTF-8 explícita (`PYTHONIOENCODING=utf-8`, `PYTHONUTF8=1`) para que `único`, `validación` y otros textos con tildes aparezcan correctamente. La prueba `npm run qa:xsd:pre-sign-desktop` incluye ahora una regresión de codificación. La validación fiscal y sus criterios no cambian.

**Objetivo:** distinguir un borrador XML 4.4 sin firma que solo presenta la ausencia de `ds:Signature` de otro que contiene **errores estructurales adicionales**. La aplicación nunca inventa, inserta ni simula una firma para lograr la validación.

## 1. Novedades principales

- El resultado de la comparación XSD muestra un bloque **«Diagnóstico previo a la firma»** separado del estado **«Validación XSD completa»**.
- Si el esquema reporta exclusivamente que falta el elemento final `ds:Signature` en la raíz FE/TE, se explica que **ese es el único error detectado**. El estado estricto sigue siendo **NO coincide con XSD**; no se considera factura válida.
- Si existen errores de contenido, datos, orden, nombres de campos o faltan otros elementos, el sistema los mantiene en el listado con línea y detalle. **Nunca** se ocultan esos errores afirmando que falta solamente la firma.
- Si el XSD local permite un borrador sin firma, se indica que no detectó otros errores pero que **sigue sin firmar**. Si el XML contiene `Signature`, el XSD **no** demuestra que la firma sea criptográficamente válida.
- Se preservan los controles anteriores: carpeta seleccionada por el operador, alias local conocido XMLDSIG, SHA-256, XSD intactos, XML temporal eliminado, sin acceso externo y sin transmisión a Hacienda.
- Se conservan **todos** los cambios comerciales de v0.6.88–0.6.90: caja obligatoria y por cajero, venta e historial propios, impresión después del vuelto, PDF de cierres, tres códigos FCR2, permisos y respaldos. **No hay migraciones de SQLite.**

## 2. Cómo probar y validar las novedades (Windows)

**Antes de empezar:** realiza un respaldo **verificado** de SQLite, actualiza el proyecto con el ZIP v0.6.91, instala sus dependencias (`npm ci`) y usa Python con `lxml` (para MSYS2 UCRT64, `C:\msys64\usr\bin\pacman.exe -S mingw-w64-ucrt-x86_64-python-lxml`). Los XSD seleccionados deben proceder de una fuente confiable; el programa no verifica su origen ni vigencia. Conserva los XSD FE/TE 4.4 y `xmldsig-core-schema.xsd` en la misma carpeta si el esquema requiere esa dependencia.

**A. Pruebas automáticas, sin archivos de Hacienda:**

```powershell
npm run qa:xsd:selftest
npm run qa:xsd:desktop
npm run qa:xsd:desktop-real
npm run qa:xsd:pre-sign
npm run qa:xsd:pre-sign-desktop
npm test
npm run qa:real-server
```

Resultados esperados: 25/25 XSD sintético, 14/14 puente simulado, 5/5 puente Node/Python, **18/18** ensayos de pre-firma FE/TE, **13/13** comprobaciones del puente y UI pre-firma, suite general aprobada y servidor HTTP real sin errores en Windows. Estas pruebas **NO** suponen verificación ante Hacienda.

**B. Prueba visual de la novedad en FacturaCR (aplicación Electron):**

1. Inicia sesión con un rol habilitado para ver ventas y selecciona una empresa de **prueba**.
2. Ve a **Historial de ventas / Mis ventas** y abre una venta FE o TE de prueba.
3. Pulsa **Borrador FE 4.4 (prueba)** o **Borrador TE 4.4**; debe estar disponible solo cuando se cumplen los requisitos previos del borrador.
4. Pulsa **Elegir carpeta XSD y validar borrador** y selecciona tu carpeta XSD 4.4 junto con `xmldsig-core-schema.xsd`.
5. Si el **único** diagnóstico del XSD es «Missing child element(s) … Signature», debe aparecer **«Borrador sin firmar: el único error XSD detectado es la firma pendiente»**, y la sección **«Validación XSD completa» seguirá indicando que NO coincide**.
6. Si hay un error adicional de campo o estructura, se indicarán **otras diferencias** con línea y mensaje. No debería decir que solo falta firma.
7. Comprueba que sigan apareciendo el nombre y las huellas SHA-256 del XML/XSD; cierra y vuelve a abrir la ventana. No se modifica el historial de ventas.

**Resultado esperado:** tendrás un diagnóstico más comprensible para preparar las correcciones fiscales. **No se habilita firmar ni enviar XML reales**. Si el esquema local está desactualizado o es incorrecto, el resultado no demuestra cumplimiento fiscal. Para avanzar con los XSD vigentes se necesitan los archivos exactos con procedencia verificada.

**C. Compilación e instalación Windows:**

```powershell
npm run dist:win
```

Instala y abre el `.exe` en un equipo de prueba para confirmar que el validador empaquetado encuentra Python y `lxml` y puede abrir la carpeta XSD. La compilación no sustituye esta comprobación.

## 3. Estado de QA y limitaciones

- Pruebas sintéticas nuevas: **18/18 FE/TE** aprobadas (incluye XML sin firma, errores de campos, elementos obligatorios, namespace de firma incorrecto y rechazo CLI estricto de borradores incompletos).
- Integración de contrato local/UI: **13/13 comprobaciones**.
- `npm test`: aprobado; integración SQLite: **77/77**.
- **Pendiente:** comprobar esquema oficial actualizado en Windows, impresión física no afectada, HTTP real y el instalador NSIS generado desde esta versión. Aquí no se ha ejecutado el `.exe`.
- **No es validación fiscal:** ni el XSD por sí solo demuestra identidad, firma XAdES-EPES, validez de claves/CAByS o recepción por Hacienda. Nunca se declara «comprobante fiscal válido» en el modo pre-firma.

## 4. Instalación y GitHub

Primero respalda y verifica SQLite. Luego:

```powershell
npm ci
npm test
npm run qa:real-server
npm run qa:xsd:pre-sign
npm run dist:win

git add -A
git commit -m "feat: v0.6.91 diagnostico XSD previo a firma"
git push
```

Realiza el commit solo después de validar los cambios y el instalador. GitHub Actions incluye los ensayos Python del diagnóstico, separados de la validación oficial de Hacienda.

---

# FacturaCR v0.6.90 — Validación XSD local de borradores FE/TE desde Electron

**Alcance:** v0.6.90 permite validar un borrador XML FE o TE 4.4 directamente desde la aplicación de escritorio, eligiendo la carpeta de XSD con un diálogo nativo. **El XSD es proporcionado por el operador: el resultado NO demuestra que proceda de Hacienda, esté vigente, que el XML esté firmado, ni que sea apto para enviar.** Las ventas no se modifican y no se hace ninguna transmisión fiscal.

## Novedades

1. **Validación desde Historial de ventas / Mis ventas.** Abre el detalle de una venta FE o TE admisible, selecciona «Borrador FE 4.4 (prueba)» o «Borrador TE 4.4 · consumidor final», y en la ventana usa **«Elegir carpeta XSD y validar borrador»**. La selección se realiza en un diálogo de Windows/Electron, sin exponer rutas de archivos al navegador.
2. **Diagnóstico visible.** Se distingue «Coincide con el XSD local elegido», «El XML no coincide» y «No se pudo validar». Cuando existen diferencias se muestran líneas y mensajes; se muestran huellas SHA-256 del XSD y del XML. Ninguno de estos estados significa autorización de Hacienda.
3. **Seguridad.** Se admite únicamente FE/TE en esta pantalla; la matriz CLI de NC/ND se mantiene. El XML se escribe en una carpeta temporal y se elimina al terminar; el validador no descarga archivos, rechaza DTD arbitrarios e importaciones XSD externas; admite solo el encabezado DTD estándar de XMLDSIG sin cargar recursos externos y no modifica SQLite. Se ejecuta Python sin shell, con límite de 8 MB, tope de salida y tiempo máximo de 20 s.
4. **Distribución.** El empaquetado Windows incluye el validador Python en `app.asar.unpacked` (se sigue requiriendo Python con `lxml` instalado en la máquina). No se incluye ningún supuesto XSD oficial ni se descarga uno de terceros automáticamente.
5. **QA.** Nueva batería de 14 comprobaciones del puente local sin dependencia Python y 5 casos de integración Node→Python+lxml con XSD **sintéticos** (válido, inválido, esquema faltante). GitHub Actions ejecuta la integración independiente cuando instala `lxml`.

## Cómo probar y validar las novedades (Windows, paso a paso)

**Prerrequisitos:** respaldo verificado de tu base SQLite; copia del proyecto v0.6.90; Python instalado y disponible con `python` (para MSYS2 UCRT64, instala `mingw-w64-ucrt-x86_64-python-lxml` mediante pacman); XSD 4.4 descargados manualmente desde una fuente confiable y colocados con sus dependencias en la misma carpeta de esquemas. Los esquemas **no** están en el ZIP.

**A. Comprobar que el validador funciona (sin Hacienda):**

```powershell
npm run qa:xsd:selftest
npm run qa:xsd:desktop
npm run qa:xsd:desktop-real
```

Esperado: `25/25` ensayos sintéticos de la matriz; `14/14` comprobaciones del puente y `5/5` casos reales Node/Python con XSD **sintéticos**. Ninguno equivale a validación fiscal oficial.

**Dependencia XMLDSIG en XSD de Hacienda:** si ves `Dependencia XSD fuera de --schema-root: ../../xmldsig-core-schema.xsd`, descarga por separado `xmldsig-core-schema.xsd` de una fuente confiable (por ejemplo, el repositorio comunitario [CRLibre v4.4](https://github.com/CRLibre/API_Hacienda/blob/v4.4/xmldsig-core-schema.xsd), que **no es** una publicación oficial de Hacienda). Guárdalo **en la misma carpeta** que `FacturaElectronica_V4.4.xsd` y `TiqueteElectronico_V4.4.xsd`, sin modificar los XSD originales. Esta revisión resuelve exclusivamente el `xs:import` conocido de XML Signature desde esa carpeta, verifica el namespace, incluye su SHA-256 y mantiene cerrada la navegación fuera de ella. Si la dependencia falta, el programa presenta el nombre y la ubicación requerida. La dependencia W3C puede incluir su DOCTYPE original, pero el validador no carga el DTD remoto ni autoriza otros DOCTYPE.

**Ejemplo de estructura compatible:**

```text
XSD-4.4/
  FacturaElectronica_V4.4.xsd
  TiqueteElectronico_V4.4.xsd
  NotaCreditoElectronica_V4.4.xsd
  NotaDebitoElectronica_V4.4.xsd
  xmldsig-core-schema.xsd
```

**B. Probar en la interfaz de Electron:**

1. Entra con un usuario autorizado para ver sus ventas. Selecciona una empresa de pruebas y una venta FE/TE de prueba en **Punto de venta → Historial de ventas** (o **Mis ventas** para cajero).
2. Abre **Ver** y, según la modalidad, elige **Borrador FE 4.4 (prueba)** o **Borrador TE 4.4 · consumidor final**.
3. Si faltan datos fiscales, CAByS o medios de pago, el módulo indicará los problemas y el botón XSD quedará deshabilitado; no inventes información para forzar el borrador.
4. Si el borrador está listo, pulsa **Elegir carpeta XSD y validar borrador**; selecciona la carpeta que contenga `FacturaElectronica_V4.4.xsd` o `TiqueteElectronico_V4.4.xsd` junto con sus esquemas dependientes.
5. Esperado: estado de coincidencia o diferencias de esquema, línea y detalle de los errores. Los borradores **tienen claves y consecutivos ficticios, y no están firmados**; por ello pueden fallar ante XSD oficiales. Esa diferencia es informativa y no se corrige automáticamente.
6. Cancela una selección y comprueba que no cambia el borrador. Cierra y vuelve a abrir el detalle: ninguna venta, impuesto, recibo ni dato SQLite debe haber cambiado.

**C. Validar archivos XML externos FE/TE/NC/ND:** sigue disponible el comando de la v0.6.89, por ejemplo:

```powershell
python tests/qa-087-xsd-pareja.py --schema-dir "C:\EsquemasHacienda\v4.4" --fe-xml "C:\Pruebas\FE.xml" --json-out "C:\Pruebas\resultado-xsd.json"
```

Para NC, ND o TE usa `--nc-xml`, `--nd-xml` o `--te-xml` respectivamente. Si aparecen errores, consulta los nombres y líneas del informe JSON. En CLI `0` indica coincidencia con el XSD proporcionado, `1` indica diferencias y `2` que la validación no fue posible.

**Origen y vigencia:** el catálogo histórico ATV muestra enlaces a XSD 4.4, pero algunos no responden y existen modificaciones publicadas en 2026. Confirma los archivos con la documentación publicada oficialmente por Hacienda/TRIBU-CR antes de utilizarlos. Una huella SHA-256 solo permite comparar archivos, no demostrar el origen de un XSD.

- Portal institucional: https://atv.hacienda.go.cr/ATV/ComprobanteElectronico/frmAnexosyEstructuras.aspx
- Portal TRIBU-CR: https://ovitribucr.hacienda.go.cr/comprobantes-electronicos

## Resultados y pendientes de v0.6.90

- `npm test` en entorno Linux: aprobado, incluidos 77/77 controles locales SQLite y pruebas de regresión de caja, permisos y ventas.
- `npm run qa:xsd:selftest`: 25/25 con esquemas sintéticos.
- `npm run qa:xsd:desktop`: 14/14, puente probado con respuestas simuladas.
- `npm run qa:xsd:desktop-real`: 5/5 usando Python+lxml y XSD sintéticos.
- **Pendiente:** ejecutar y comprobar compilación e instalación real NSIS en Windows, validar con XSD 2026 oficiales verificables, probar el flujo visual en Electron Windows, reejecutar `npm run qa:real-server` en la nueva versión y comprobar cualquier respuesta oficial de Hacienda. La v0.6.90 no habilita emisión fiscal.

## Instalación y GitHub

Antes de reemplazar la aplicación, **crear y verificar respaldo completo de la base SQLite** (`userData` en Electron, o `data/` en desarrollo). Conservar toda la información real; nunca sustituir el SQLite productivo por uno de prueba. A continuación, dentro de la raíz del proyecto:

```powershell
npm ci
npm test
npm run qa:real-server
npm run qa:xsd:selftest
npm run qa:xsd:desktop-real
npm run dist:win
```

Tras verificar instalación y funcionamiento en Windows, actualiza GitHub:

```powershell
git add -A
git commit -m "feat: v0.6.90 validacion XSD local FE TE desde Electron"
git push
```

---

# FacturaCR v0.6.89 — Matriz de validación XSD 4.4 y seguridad de esquemas locales

**Alcance de esta versión:** amplía el laboratorio de validación de XML de comprobantes FE, TE, NC y ND con los XSD locales del operador. **No habilita emisión electrónica, numeración fiscal, firma XAdES-EPES de producción ni envío a Hacienda.** El POS, los tres códigos FCR2, las ventas de cada cajero, el bloqueo sin caja, el tiquete posterior al vuelto y el doble guardado de los cierres permanecen como en v0.6.88.

## Qué se agregó

1. `tests/qa-087-xsd-pareja.py`: valida independientemente FE/TE/NC/ND (uno o varios), comprobando raíz y espacio de nombres v4.4, usando `lxml` y XSD entregados por el operador.
2. **Diagnóstico por campo/línea**: JSON con `validWithSuppliedSchema`, `errors`, SHA-256 de XML, XSD y todas sus dependencias; códigos de salida **0** válido, **1** XML inválido y **2** imposibilidad de validar (esquema faltante, DTD, namespace equivocado, etc.). Se admite `--json-out` para conservar el informe en disco, fuera de SQLite.
3. **Lectura segura**: prohíbe DTD/DOCTYPE, entidades externas, URLs de importación, rutas fuera de `--schema-root`, archivos grandes y hashes alterados en manifiesto opcional. Acepta dependencias locales seguras (como `xmldsig-core-schema.xsd`) dentro del árbol autorizado.
4. **QA**: `npm run qa:xsd:selftest` ejecuta pruebas sintéticas y la acción Linux `xmlsig-independent-lab` las verifica. **No son pruebas con los XSD oficiales** y nunca se presentan como homologación de Hacienda.
5. **Metadatos v0.6.89** coherentes (`package.json`, lockfile, etiqueta visual y pruebas de versión). No hay migración de SQLite ni nuevos permisos.

## Cómo usar los XSD vigentes para verificar XML reales

Instala **Python 3.12+** y `lxml` (`python -m pip install 'lxml>=5,<7'`). Descarga los XSD v4.4 desde los enlaces oficiales de **TRIBU-CR / Hacienda**, manteniendo sus ficheros auxiliares y estructura de subcarpetas. Comprueba fecha y procedencia antes de validar; **FacturaCR no incluye ni descarga automáticamente los XSD, pues aquí no se verificó de forma independiente un paquete oficial vigente**.

Prueba un FE y un TE, o agrega NC y ND según tengas archivos y XSD:

```powershell
python tests/qa-087-xsd-pareja.py --schema-dir "C:\EsquemasHacienda\2026\v4.4" --schema-root "C:\EsquemasHacienda" --fe-xml "C:\Pruebas\FE.xml" --te-xml "C:\Pruebas\TE.xml" --json-out "C:\Pruebas\reporte-xsd.json"
```

Para NC y ND sustituye las opciones XML por `--nc-xml` y `--nd-xml`. Los archivos XSD deben llamarse `FacturaElectronica_V4.4.xsd`, `TiqueteElectronico_V4.4.xsd`, `NotaCreditoElectronica_V4.4.xsd` y `NotaDebitoElectronica_V4.4.xsd`. El directorio `--schema-root` debe incluir todas las dependencias locales referidas por los XSD. El parámetro opcional `--sha256-manifest` recibe un JSON de `ruta/relativa.xsd` a SHA-256 (incluidas dependencias); comprueba integridad, **no demuestra origen oficial**.

**Referencias para obtener los esquemas, sin sustituir la comprobación oficial:**
- Portal de Hacienda: https://atv.hacienda.go.cr/ATV/ComprobanteElectronico/frmAnexosyEstructuras.aspx
- Portal TRIBU-CR: https://ovitribucr.hacienda.go.cr/comprobantes-electronicos

**Limitaciones deliberadas:** los borradores generados tienen clave/consecutivo ficticios y no están firmados; es normal que XSD reales detecten errores hasta que el emisor FE 4.4 esté completo. No se modifica el XML para forzar una aprobación ni se declara listo para emisión. Quedan pendientes las comprobaciones con esquemas oficiales actualizados, validación CABYS/actividad RUT, claves y consecutivos reales, firma real, integración con Hacienda y pruebas en Windows.

## Actualización segura

Antes de reemplazar cualquier archivo, crear y **verificar** un respaldo completo de la SQLite de producción. Instalar desde el ZIP en carpeta de código y mantener `data/` o `userData` del ejecutable sin sobrescribir. Después:

```powershell
npm ci
npm test
npm run qa:real-server
npm run qa:xsd:selftest
npm run dist:win
```

Si las pruebas y el instalador Windows funcionan, subir código a GitHub:

```powershell
git add -A
git commit -m "feat: v0.6.89 matriz XSD 4.4 FE TE NC ND y QA de seguridad"
git push
```

---

## Corrección adicional v0.6.88 — Ventas por cajero, impresión y caja obligatoria (21/11/2026)

- **Ventas multiusuario:** el rol de cajero conserva `sales.create` y ahora puede usar `sales.read_own` para consultar el historial de **sus propias ventas** y recuperar sus detalles para imprimir tiquetes. Administradores y supervisores conservan los permisos más amplios según su rol. Un cajero no puede consultar ventas de otro cajero por API.
- **Trazabilidad en SQLite:** migración *aditiva* de `sales.created_by_user_id` y `sales.cash_session_id`; las nuevas ventas se vinculan al usuario autenticado y a la sesión abierta. No se reescriben ni se asignan ficticiamente las ventas históricas que no guardaron usuario: estas permanecen visibles al propietario/roles autorizados, no en «Mis ventas» de un cajero.
- **Caja obligatoria:** el POS informa cuando la caja está cerrada, impide agregar artículos, escanear y confirmar, y permite ir directamente a «Caja y gastos». El servidor **rechaza una venta** cuando no existe caja abierta, incluso si alguien intenta saltar la interfaz. Un cajero no puede vender en la caja abierta por otro usuario. Si una caja se cierra durante una operación, se conserva el carrito y se rechaza solamente el cobro no confirmado.
- **Impresión después del vuelto:** el botón principal es «Vuelto entregado · Imprimir tiquete», que primero cierra el modal y luego utiliza el puente de impresión Electron; también existe «Cerrar sin imprimir». Esta confirmación imprime incluso si estaba desactivada la impresión automática. Si imprimir falla, la venta ya registrada **no se duplica ni elimina**, y se avisa para poder reimprimirla desde el historial. Se mantienen los ajustes de impresora y la impresión sin vuelto.
- **Permisos de configuración:** se permite a usuarios con `sales.create` consultar/guardar los ajustes de tiquete de la empresa. «Caja y gastos» ahora recibe correctamente el rol cajero, sin exponer controles exclusivos de otros roles.
- **GitHub Actions y FCR2:** `tests/qa-servidor-real.cjs` deja de esperar `recoveryCode` de tipo FCR1 y comprueba los tres códigos `recoveryCodes` FCR2. Se agregó una prueba HTTP real de dos cajeros, apertura de caja, bloqueo cruzado, historial aislado, tiquete y persistencia en SQLite.
- **QA local ejecutado:** `npm test` pasó (incluida integración SQLite de pruebas 77/77), tests estáticos y sintaxis. **Pendientes:** `npm run qa:real-server` con dependencias nativas instaladas, compilación Vite/NSIS, impresión física y revisión manual de los permisos en Windows. No se ha validado el instalador en este entorno.

**Actualización segura:** respaldar y verificar la SQLite original antes de sustituir archivos, ejecutar `npm ci`, `npm test`, `npm run qa:real-server`, `npm run dist:win`. Conservar los datos y comprobar las ventas de cada cajero antes de instalar en producción.

## Actualización v0.6.88 — Doble respaldo automático de cierres de caja

Cuando confirmas **Cerrar caja**, FacturaCR crea un PDF de esa sesión y lo guarda primero en `cash_closure_pdfs` dentro de SQLite. Después Electron guarda una **segunda copia independiente** en tu carpeta Documentos. El cierre y su PDF de SQLite **no se pierden** si falla el guardado externo; aparecerá un mensaje y podrás hacer clic en **Guardar en PC** desde el historial.

**Ruta predeterminada (Windows):**

```text
Documentos\FacturaCR\Cierres de caja\Empresa_1\2026\11-Noviembre\
    FacturaCR_Cierre_2026-11-20_cajero1_E1_Caja18.pdf
```

El subdirectorio del mes se crea automáticamente. La **fecha del archivo es local de Costa Rica** aunque SQLite registre el cierre en UTC. El nombre incluye el **usuario que realizó el cierre** y un identificador de sesión único. Los cierres previos que no conserven el usuario de cierre utilizan el operador de apertura, cuando esté disponible.

En **Caja y gastos → Historial de PDF de cierres de caja** están las opciones **Consultar PDF**, **Descargar PDF**, **Guardar en PC**, **Generar PDF pendiente**, **Elegir carpeta**, **Usar Documentos** y **Abrir carpeta**. La carpeta opcional se selecciona desde Electron, no escribiendo manualmente rutas. Si eliges USB, conéctala antes de cerrar caja. La ubicación personalizada es **por instalación** y se conserva en la configuración local de Electron.

**Importante:** la copia del PDF en Documentos NO se agrega al respaldo SQLite como archivo de Windows, pero su PDF idéntico **sí está guardado como BLOB en SQLite**. Un respaldo de SQLite permite reconstruir la copia local desde el historial en una nueva PC. Al repetir «Guardar en PC», FacturaCR no sobrescribe archivos diferentes con el mismo nombre. Guarda tus respaldos SQLite en otra ubicación.

**QA nuevo:** `node tests/qa-088-double-cash-copy.cjs`, `node tests/qa-088-cash-closure-pdfs.cjs`, `npm test`; después, en Windows: `npm ci`, `npm run qa:real-server`, `npm run dist:win` y probar cierre real/PDF desde el instalador. Se conservan todas las funciones FE/TE y recuperaciones de usuarios de v0.6.88.

## Actualización de Caja y Seguridad · v0.6.88 (20/11/2026)

### Paneles de recuperación y botones simétricos

El panel de entrega única de tres códigos personales y el kit extraordinario permanece dentro de `<main>`, **centrado** y con máximo 960 px. «Copiar» y «Copiar clave» conservan las mismas medidas (126 × 42 px), sin saltos al pasar el cursor. «Guardar configuración» y «Cerrar» comparten tipografía y alturas. El menú lateral sigue fijo en escritorio y la interfaz se adapta a pantallas pequeñas.

### PDF automático al cerrar una caja

**Flujo:** Caja y gastos → «Cerrar caja» → introducir efectivo contado → «Revisar cierre» → «Confirmar cierre». La API guarda el cierre en SQLite y, después de confirmarlo, Electron crea el PDF automáticamente con el informe de esa sesión. El archivo se archiva en la nueva tabla `cash_closure_pdfs` (una copia por empresa/sesión, hash SHA-256, datos binarios PDF). No se solicita ubicación ni se pisa un cierre histórico; los PDF quedan incluidos en los respaldos de SQLite.

**Historial:** «Caja y gastos» → «Historial de PDF de cierres de caja». Cierres ordenados del más reciente al más antiguo, por páginas de 30; columnas sesión, fecha UTC, contado, diferencia y estado de documento; botones «Consultar PDF» (visor del equipo), «Descargar PDF» y «Generar PDF pendiente». Si un cierre se guardó pero Electron no pudo crear el PDF, aparece un mensaje específico de error y se puede generar más adelante sin cerrar otra vez. Los cierres preexistentes se indican como pendientes.

**Privacidad y permisos:** el historial es aislado por empresa. El cajero solo puede acceder a sesiones que abrió personalmente. Los PDF se obtienen por rutas autorizadas, nunca desde una ruta arbitraria suministrada por el usuario. Desde la corrección de doble guardado de esta misma versión, también se genera automáticamente una copia en Documentos de Windows; «Consultar» abre el PDF histórico con el visor configurado en Windows.

**Integridad:** el primer PDF archivado es inmutable. Si una venta se anula después, no se reescribe ese documento. Los informes para cierres anteriores sin PDF se generan a partir de los datos aún disponibles y podrían reflejar las ventas actualmente activas, a diferencia de la fotografía original al cierre. El tamaño máximo por PDF archivado es 1,2 MB; si se excede, se avisa y queda pendiente. Esta función es un informe interno de caja, **no** una factura electrónica ni un comprobante enviado a Hacienda.

**Compatibilidad:** migración SQLite únicamente aditiva (tabla `cash_closure_pdfs`), conservando las sesiones anteriores y todos los datos comerciales. Crea y verifica un respaldo independiente de SQLite antes de instalar. Para actualizar un repositorio antiguo en Git, ejecutar `npm run cleanup:legacy-email` y comprobar `git status --short` antes de `npm test`.

**Pruebas:** `npm test` (incluye suites nuevas de PDF de caja y controles de interfaz), `npm run qa:real-server`, `npm run qa:fe44-preflight` y `npm run dist:win`. Se completaron pruebas locales de SQLite y diseño, pero la impresión/consulta PDF en el `.exe` final necesita verificación en Windows/GitHub Actions.

### Ruta pendiente para v0.6.89

1. Incorporar y comprobar los XSD **oficiales y vigentes** FE y TE versión 4.4.
2. Verificar catálogo CAByS y actividades económicas contra fuentes de Hacienda/BCCR.
3. Claves y consecutivos fiscales reales con aislamiento por empresa/sucursal/terminal.
4. Validar tolerancias decimales sin dividir productos en varias líneas ni redondear artificialmente la base.
5. Firma XAdES-EPES real con certificado y política vigente.
6. Integración autenticada con Hacienda y recepción de respuestas, y notas NC/ND.

---

## Ajuste visual de Seguridad — v0.6.88 (20/11/2026)

La entrega única de tres códigos y el kit extraordinario del propietario se renderizan **dentro del área principal**, no encima del menú. El panel ocupa hasta 960 px; sus botones «Copiar» y «Copiar clave» miden 126 × 42 px, y los controles «Mostrar/Ocultar» permanecen centrados incluso al pasar el puntero. Los campos se adaptan a pantallas pequeñas y la entrega se desplaza a la vista cuando se generan códigos nuevos.

Se mantienen los códigos de un solo uso, la descarga PDF, el kit `.fcr` y la recuperación sin correo; **no se altera SQLite ni la política de usuarios**. Ejecuta `npm test` y revisa visualmente Seguridad y bloqueo, creación de usuarios y kit. Por seguridad, renueva cualquier código real que haya aparecido en una captura compartida.

La corrección anterior para GitHub Actions sigue aplicándose: al actualizar una carpeta Git antigua mediante ZIP, ejecutar **`npm run cleanup:legacy-email` antes de `npm test`**, verificar los archivos eliminados en `git status --short` y publicar el commit. El ZIP no elimina automáticamente los archivos obsoletos existentes.

## Corrección v0.6.88 — PDF de códigos y CI GitHub Actions (20/11/2026)

- **«Guardar mis 3 códigos en PDF»** aparece solamente en la pantalla de entrega única de tres códigos FCR2: alta de usuario, primer cambio de contraseña, renovación, recuperación del propietario y restablecimiento por propietario. Abre un diálogo nativo para elegir la ubicación del PDF, tamaño A4 vertical. No guarda la contraseña ni ninguna parte del kit extraordinario.
- **Cuidado:** el PDF contiene tres secretos válidos **sin cifrar**; no lo sincronices ni compartas sin protección. Copiar o guardar el PDF no sustituye la confirmación consciente de resguardo. Nunca guardar junto con el archivo `.fcr` y la clave `FCRK` del propietario.
- **Corrección del fallo GitHub Actions (`server/email-recovery.js true !== false`):** extraer un ZIP sobre un repositorio existente **no borra los archivos antiguos**. El archivo `server/email-recovery.js` puede seguir rastreado por Git aunque no venga en el ZIP nuevo. Antes de `npm test` y del commit, ejecutar **`npm run cleanup:legacy-email`** desde la raíz. Este comando solo elimina cuatro archivos obsoletos de recuperación SMTP (cuando estén presentes y sin referencias activas). No toca usuarios, SQLite, SMTP de terceros ni correos comerciales. Ejecutar `git status --short`: verificar las eliminaciones y después `git add -A` para que GitHub Actions reciba el borrado.
- Las aserciones de `tests/qa-088-no-email-recovery.cjs` **no se relajan**. Continúan bloqueando módulos obsoletos que permanezcan en el repositorio. El CI solamente quedará verde cuando Git reciba las eliminaciones correspondientes.
- La aplicación conserva versión `0.6.88`; no cambia esquema SQLite, roles ni los procedimientos fiscales. El envío real FE/TE a Hacienda sigue bloqueado.

**Orden recomendado (PowerShell):**

```powershell
# Antes: respaldo independiente y comprobado de SQLite
npm ci
npm run cleanup:legacy-email
npm test
npm run qa:real-server
npm run dist:win
git status --short
git add -A
git commit -m "fix: v0.6.88 - PDF codigos y limpieza modulos correo CI"
git push origin main
```

---

# FacturaCR v0.6.88 — Recuperación local sin correo (versión actual)

> **Versión vigente:** recuperación de cuentas mediante códigos individuales de un solo uso. **SMTP, Gmail, verificación del correo y recuperación por correo fueron retirados.** Las referencias de versiones anteriores son únicamente historial y no son instrucciones vigentes.

## 1. Tres códigos personales, regenerables

- Al crear una cuenta, el responsable autorizado recibe **tres códigos FCR2** distintos, con alta entropía. La pantalla los muestra **una sola vez**, junto con los controles de copia y la confirmación de resguardo. Nunca se guardan en texto claro en SQLite ni en Auditoría.
- **IMPORTANTE:** cuando el usuario recién creado inicia sesión y cambia su contraseña temporal, se generan **tres códigos nuevos solo para él**; los entregados al creador se invalidan. El usuario debe guardar los suyos en ese momento. No reenviar códigos por correo ni usar capturas compartidas.
- Cada código recupera exclusivamente la cuenta correspondiente, se consume una sola vez y revoca las sesiones anteriores. Una vez usado, el sistema muestra cuántos quedan.
- Para generar **otros tres**, entra a **Mi sesión → Seguridad y bloqueo → Códigos de recuperación** y confirma la **contraseña actual**. Los anteriores se invalidan; los nuevos se muestran una única vez. Esto funciona también cuando ya quedan cero códigos, siempre que la persona recuerde su contraseña.
- Una cuenta existente que todavía no tenga códigos puede obtener sus tres códigos iniciando sesión normalmente y usando la misma opción. Todos los roles pueden administrar **sus propios** códigos. Solo el propietario autenticado puede restablecer la contraseña de otra persona; ese proceso queda auditado y obliga al cambio de contraseña en el siguiente acceso.

## 2. Kit extraordinario del propietario: archivo + clave por separado

- Al configurar el primer propietario se muestran los tres códigos y un **kit de recuperación extraordinaria** de dos componentes: `FacturaCR-Rescate.fcr`, que contiene **una mitad aleatoria**, y una **clave FCRK** independiente. Para recuperar la cuenta sin contraseña ni códigos hacen falta **ambas partes**.
- Guarda el archivo y la clave **en lugares distintos**. El archivo no está cifrado ni contiene contraseñas ni la segunda mitad; ninguno de los dos componentes permite por sí solo recuperar la cuenta. SQLite almacena solamente el verificador criptográfico correspondiente.
- El propietario autenticado puede **renovar el kit** confirmando su contraseña. El anterior queda invalidado. Tras usar el kit para recuperar la cuenta, FacturaCR invalida el kit y los códigos previos y entrega inmediatamente un kit y tres códigos nuevos.
- **Sin contraseña, sin códigos y sin ambas partes del kit no existe un acceso maestro, atajo de soporte ni recuperación garantizada.** Un respaldo de SQLite no sustituye la comprobación de identidad.

## 3. Migración desde versiones anteriores (leer antes de instalar)

1. **Detén la aplicación, crea y verifica un respaldo de la base SQLite** en una carpeta independiente. Conserva además un respaldo de la última versión funcional del proyecto.
2. La migración crea `access_recovery_codes` y `access_owner_emergency`. Retira las tablas **exclusivas de recuperación por correo** `access_user_emails` y `access_email_tokens`, así como la interfaz, rutas SMTP y almacén local de credenciales SMTP. **No elimina correos comerciales de clientes o empresas**, ventas ni permisos.
3. El antiguo código `FCR1` del propietario sigue siendo válido **solo durante la transición**, hasta que se generen sus nuevos códigos FCR2. Si el propietario ya conoce su contraseña, debe entrar, generar y **guardar los tres FCR2 y el kit de dos partes** antes de borrar su antiguo respaldo.
4. El personal existente debe iniciar sesión y generar sus códigos cuanto antes. **Al retirar el correo ya no podrá recuperar la cuenta por email**; si pierde el acceso antes de generar códigos, el propietario autenticado podrá restablecer la contraseña y entregar temporalmente sus códigos nuevos.
5. Prueba el inicio de sesión, la regeneración, una recuperación con código en una **cuenta de prueba** y el kit en un **perfil de ensayo** antes de actualizar datos reales de la empresa. Confirma que la restauración SQLite funciona y que GitHub Actions Windows/NSIS permanece en verde.

## 4. Seguridad, compatibilidad y alcance

- Los códigos FCR2 tienen 192 bits aleatorios, el kit usa dos secretos criptográficos independientes. Se guardan verificadores SHA-256 de secretos de alta entropía; las operaciones que reemplazan o consumen códigos son transaccionales y los intentos se limitan. No hay correos, SMTP ni contraseñas maestras.
- Los secretos se devuelven por HTTP local solo en el momento de generarlos con `Cache-Control: no-store`. No agregarlos a archivos del proyecto, respaldos sin protección, logs, GitHub, capturas ni incidencias de soporte.
- Se conservan ventas FE/TE/genérica, historiales, caja, inventario, auditoría, respaldos, impresión después del vuelto, XAdESjs de laboratorio y el bloqueo de emisión fiscal. Las nuevas tablas son migración aditiva, con retiro **intencional** de tablas exclusivas de recuperación de correo.
- QA automatizado: `tests/qa-088-recovery-codes.cjs`, `tests/qa-088-legacy-migration.cjs`, `tests/qa-088-no-email-recovery.cjs`, regresiones y 76 pruebas de integración SQLite. **El servidor Express, la compilación React y el instalador NSIS en Windows deben verificarse en la instalación real y en GitHub Actions antes de reemplazar una versión productiva.**

## 5. Próxima versión (mantener pendiente)

**v0.6.89:** XSD oficiales vigentes de Hacienda para FE/TE 4.4, actividades económicas y CAByS oficiales, control de precisión fiscal, numeración y claves auténticas, firma XAdES-EPES con certificado real y verificador independiente, envío/aceptación en Hacienda, notas de crédito/débito y trazabilidad. No dividir líneas de productos ni alterar el IVA para forzar totales. Hasta completar la validación, los XML son borradores NO FISCALES.

## 6. Instalación y GitHub

```powershell
npm ci
npm test
npm run qa:real-server
npm run dist:win
```

Tras comprobar QA e instalador en Windows:

```powershell
git add -A
git commit -m "feat: v0.6.88 - recuperacion local tres codigos y kit propietario"
git push origin main
```

Se conservan `README.md`, `.gitignore`, `CHANGELOG.md` y `.github/workflows/`.

---

## Historial técnico de versiones anteriores

## v0.6.88 — Contraseñas visibles de forma temporal (login y usuarios)

- El acceso de usuarios, desbloqueo por inactividad, configuración del propietario, cambio de contraseña temporal y recuperación admiten **Mostrar / Ocultar** por campo. La contraseña permanece oculta por defecto y el botón no envía el formulario.
- En **Usuarios y permisos**, la contraseña temporal al crear un usuario y la contraseña al confirmar eliminación también ofrecen el control. Cada campo conserva el autocompletado, límites, reglas y controles del servidor; el valor no se guarda adicionalmente.
- El cambio es exclusivamente de interfaz. No hay migración SQLite, nuevos permisos ni cambio de autenticación.
- Prueba nueva `tests/qa-088-password-visibility.cjs` incluida en `npm test`. Se conservan ventas FE/TE/genérica, sus historiales, XAdESjs de laboratorio y emisión bloqueada.
- **Ajuste posterior sobre v0.6.88:** cierre manual «×» en notificaciones transitorias y botón de renovación de código legible. Recuperación con código individual por usuario queda registrada como mejora futura de seguridad, no aplicada en esta entrega.

## v0.6.87 — Corrección de tarjetas e historiales FE/TE/genérica (21-11-2026)

- **Selector simétrico:** se corrige el estilo `input{width:100%}` heredado por los radios, que expandía los círculos y desplazaba los títulos. Tres tarjetas de altura uniforme, alineación centrada, radio de tamaño fijo, descripción legible, foco de teclado y adaptación a dos o una columna.
- **Historial visible y buscable:** las ventas de tiquete electrónico `TE` permanecen junto a las demás ventas en Historial de ventas; incluye un filtro de **modalidad** FE / TE / genérica, y contador de tiquetes en el encabezado contraído. No se crea un historial separado ni se omiten ventas sin receptor.
- **Fecha de SQLite:** `CURRENT_TIMESTAMP` se almacena en UTC. Ahora el filtro «Hoy / Esta semana / Este mes» utiliza la **fecha local del equipo**, para no ocultar ventas del final del día en Costa Rica cuyo día UTC ya cambió. La presentación y los CSV/PDF filtrados muestran fecha local, sin modificar el valor original en SQLite.
- **Columna Cliente:** FE muestra el nombre registrado; TE «Tiquete electrónico»; genérica «Genérica»; en registros históricos sin modalidad no se inventa una clasificación. Se unificó también el CSV general y se mantienen los historiales de crédito, sus permisos y la impresión del vuelto.
- **QA:** 16/16 controles nuevos de fechas, etiquetas, estilos y filtro; `npm test` completo y 76/76 integraciones SQLite, con verificación HTTP simulado de FE/TE/genérica y CSV. Validación visual y NSIS **pendientes de Windows y GitHub Actions**.
- **Seguridad de datos:** sin nuevas migraciones y sin modificaciones de ventas ya guardadas. **Crear y verificar respaldo SQLite antes de instalar.** Firma fiscal y envío siguen bloqueados.

## v0.6.87 — Ajuste adicional de Ventas: modalidades FE / TE / genérica y historiales contraídos (20-11-2026)

- **Tipo de cliente y comprobante en Punto de venta:** se elige explícitamente **Cliente con datos · Factura electrónica**, **Sin datos · Tiquete electrónico**, o **Genérica · Factura interna**. El modo inicial es genérico; ninguna modalidad envía documentos a Hacienda en esta etapa.
- **Factura electrónica (FE):** solo aquí aparece **«Buscar cliente por nombre o cédula»**, con selector de un receptor registrado. No se puede confirmar FE sin cliente. La venta a crédito exige esta modalidad y cliente.
- **Tiquete electrónico (TE):** reserva la modalidad `TE`, registra venta de contado sin `client_id`, y permite generar posteriormente el borrador `TiqueteElectronico` 4.4 usando datos existentes del emisor, artículos, impuestos y medios de pago; **no inventa identificadores, no asigna numeración fiscal ni transmite XML**.
- **Factura genérica:** modo `GENERICA`, solo registro de venta e impresión del comprobante comercial interno. **No genera XML FE/TE**: la API lo bloquea incluso ante una solicitud manual.
- **Historial de ventas e historial de ventas a crédito:** empiezan contraídos y se expanden mediante sus botones existentes.
- **Persistencia:** columna aditiva `sales.document_mode` sin reclasificar ni recalcular registros históricos (NULL para antiguos). La recuperación de un carrito guarda/restaura la modalidad; al cambiar desde FE a TE o genérica se borra el cliente seleccionado.
- **Compatibilidad:** se conservan las pruebas antiguas de borradores FE/TE para ventas históricas sin modalidad (NULL), los datos fiscales, la precisión, la impresión posterior al vuelto y la seguridad de usuarios.
- **QA:** `npm test` aprobado; 76/76 pruebas de integración local y pruebas nuevas de modalidades. La validación XSD oficial, la firma fiscal y el envío a Hacienda siguen pendientes. Ejecutar `npm ci`, `npm run qa:real-server`, `npm run dist:win` y los workflows de GitHub Actions en Windows antes de reemplazar una instalación existente. **Crear y verificar respaldo SQLite antes de actualizar.**

# FacturaCR v0.6.87 — Borradores FE/TE 4.4 y ruta de validación XSD (NO FISCAL)

## 1. Cambio principal: tiquete electrónico para consumidores finales sin datos

- La venta **de contado sin cliente registrado** permite desde **Ventas → Historial → Detalle de venta** seleccionar **«Borrador TE 4.4 · consumidor final»**.
- El sistema genera un archivo `FacturaCR_BORRADOR_TE44_venta_<n>.xml` con raíz `TiqueteElectronico` y namespace de versión 4.4, **sin** las etiquetas `Receptor` ni `CodigoActividadReceptor`. No inventa cédulas, nombres ni direcciones del comprador.
- La venta con cliente identificado mantiene el botón **«Borrador FE 4.4 (prueba)»** y la identificación del receptor. El botón de TE se deshabilita en ventas con cliente o de crédito, para evitar convertir una factura identificada en un tiquete anónimo por error. Los botones FE/TE están agrupados de forma simétrica y separados del tiquete comercial impreso.
- Ambos tipos reutilizan el mismo motor de cálculos exactos y fotografía fiscal de la venta; siguen conservando **una línea por producto**, impuestos y pagos históricos. La selección solo genera una **vista previa de lectura**: no altera SQLite, el tipo de venta ni el inventario, y no genera un documento electrónico emitido.
- **Tiquete electrónico ≠ tiquete comercial impreso**: el botón «Vista previa del tiquete» corresponde al recibo comercial/impresión de caja. El borrador TE es un XML **NO FISCAL**, sin clave/consecutivo auténticos, sin XSD validado ni firma; no se envía a Hacienda. Los tiquetes electrónicos reales solo corresponden a operaciones con **consumidores finales** y **no respaldan créditos fiscales ni gastos tributarios**.

## 2. Prevalidación FE/TE y validación XSD

- `server/fe-xml-draft.js` admite `documentType=FE|TE`; con `TE` omite receptor y utiliza el elemento principal y namespace de tiquete. `server/fe-xml-preflight.js` comprueba ambos tipos, las relaciones aritméticas y que TE no haya recibido datos de receptor. La ruta `GET /api/companies/:companyId/sales/:saleId/fe/xml-draft?documentType=TE` conserva autorización por empresa y nunca escribe datos.
- `tests/qa-087-xsd-pareja.py` verifica **hasta cuatro XML distintos** (FE, TE, NC y ND) contra **sus XSD locales** proporcionados por quien opera el sistema. Confirma namespace y raíz correspondiente a FE/TE y muestra errores con líneas, `SHA-256` de cada XSD y el resultado. El nombre del archivo no demuestra procedencia ni vigencia del esquema.
- **NO hay XSD oficial verificado incorporado en este ZIP.** Se debe obtener la revisión vigente de ambos esquemas en el portal oficial de Hacienda/TRIBU-CR, incluyendo sus importaciones, antes de considerar la validación como fiscal. La autoprueba usa archivos XSD **sintéticos**, NO las estructuras oficiales.
- Comandos: `npm run qa:fe44-preflight` y `npm run qa:xsd:selftest`. Para usar esquemas descargados y verificados manualmente:

```powershell
python -m pip install "lxml>=5,<7"
python tests/qa-087-xsd-pareja.py --schema-dir "C:\esquemas-hacienda-v4.4" --fe-xml "C:\pruebas\factura.xml" --te-xml "C:\pruebas\tiquete.xml"
```

Los archivos `FacturaElectronica_V4.4.xsd` y `TiqueteElectronico_V4.4.xsd` deben provenir de la publicación vigente de Hacienda. La validación con XSD auténtico sigue **PENDIENTE**; tampoco se debe interpretar un XML con ceros fiscales como documento emitible.

## 3. Lista de trabajos pendientes (mantener visible en cada avance)

| Prioridad | Pendiente | Motivo / criterio de cierre |
|---|---|---|
| Alta | Obtener, fijar y verificar los XSD oficiales FE y TE 4.4 (revisión vigente) | Comprobar fecha, origen, hash SHA-256, dependencias y resultado detallado FE/TE |
| Alta | Completar tiquete electrónico real en Ventas | Selección fiscal explícita FE/TE, consecutivos y claves reales separados por tipo, persistencia inmutable y representación impresa; **todavía solo hay borradores** |
| Alta | Comprobación del emisor, RUT/actividades y CAByS | Verificar actividad `6619.0`, CABYS `2449001000000` y otros códigos con catálogos actuales, sin inventar datos |
| Alta | Validación del IVA, descuentos, cantidades y redondeos | Confirmar aceptación del residuo unitario de cinco decimales (por ejemplo ₡0,00005) ante Hacienda; no dividir líneas ni alterar IVA |
| Alta | Firma real XAdES-EPES | Integrar certificado por empresa con comprobaciones de confianza, revocación, política y verificador independiente, sin almacenar su contraseña |
| Alta | Integración de autenticación, envío y respuesta de Hacienda | Idempotencia, estados recibido/aceptado/rechazado y reintentos, sin marcar como emitido lo que no fue aceptado |
| Media | Notas de crédito/débito y trazabilidad | Referenciar importes fiscales originales, respetar histórico y registrar auditoría |
| Media | Impresión final, controles de interfaz y QA | Mantener impresión **después** de cerrar vuelto; pruebas Windows/NSIS, SQLite/backup, usuarios y permisos |

## 4. Seguridad, QA y compatibilidad

- Sin migraciones SQLite ni cambios en ventas históricas, usuarios, respaldos, existencias o pagos. El nuevo endpoint es de solo lectura y respeta el aislamiento por empresa.
- Pruebas de TE: 17/17; interfaz: 9/9; XSD con esquemas sintéticos: 6/6; integración SQLite real mediante adaptadores: 75/75. Las pruebas de integración no equivalen al arranque con Express/SQLite nativos en Windows.
- Conservar `README.md`, `.gitignore`, `CHANGELOG.md` y `.github/workflows`; no agregar informes por versión sueltos.

## 5. Verificación de la interfaz

Registra una venta de contado **sin cliente seleccionado**, ábrela en el historial y pulsa «Borrador TE 4.4 · consumidor final». Comprueba que no exista `Receptor`, que se mantengan los importes y que aparezca **Sin validez fiscal**. Después abre una venta con cliente identificado: debe poder mostrar FE, pero no convertirla a TE anónimo. El tiquete de caja sigue siendo independiente.

## 6. Instalación y GitHub

Antes de reemplazar una instalación, **crear y verificar un respaldo independiente de la base SQLite**. Luego:

```powershell
npm ci
npm test
npm run qa:fe44-preflight
npm run qa:xsd:selftest
npm run qa:xades-engine
npm run qa:real-server
npm run dist:win
```

Después de comprobar todas las pruebas y el instalador Windows:

```powershell
git add -A
git commit -m "feat: v0.6.87 - borrador de tiquete electronico y prevalidacion FE TE 4.4"
git push origin main
```

---

# FacturaCR v0.6.86 — Prevalidación del borrador FE 4.4 (NO FISCAL)

La versión **0.6.86** incorpora prevalidación local automática del XML de borrador creado en Ventas. **No es validación XSD oficial ni autoriza emitir una factura.** Todos los XML conservan claves y consecutivos de ceros, no tienen firma y no se envían a Hacienda.

## Qué cambia

- `server/fe-xml-preflight.js`: revisa **solo los XML generados por nuestro borrador**, no archivos arbitrarios: espacio de nombres, orden elemental, número de líneas, CAByS (únicamente longitud), multiplicación cantidad × precio dentro de los residuos unitarios de cinco decimales, descuento, IVA, totales por línea y resumen. No divide productos, no redondea bases a colones enteros y no inventa ajustes fiscales.
- `server/fe-xml-draft.js`: incorpora el informe `preflight` a la respuesta existente. Si se detecta una inconsistencia interna del XML, no permite descargar el borrador. La lista de errores indica **campo y número de línea**. No se cambian ventas históricas ni SQLite.
- `src/main.jsx` / `src/style.css`: en la vista previa **Borrador FE 4.4 (prueba)** se muestra la prevalidación con el estado explícito **XSD sin validar / firma sin validar / emisión bloqueada**. No cambia el panel de certificados ni el motor XAdESjs de laboratorio.
- `tests/qa-086-xsd-official.py`: herramienta independiente basada en `lxml` para validar un XML contra **un archivo XSD local suministrado expresamente**. No descarga esquemas de fuentes no verificadas ni los sustituye por uno inventado. Cuando el operador no ha aportado el XSD real, devuelve estado no validado.
- `build/icon.png` se incluye de forma explícita en el ASAR de Electron para evitar el aviso de icono ausente durante el arranque del instalador.
- `npm run qa:fe44-preflight`: pruebas estructurales y de interfaz. En QA Linux con Python se ejecuta `--self-test` del validador usando un esquema de ejemplo **NO OFICIAL**. Ese ensayo comprueba el mecanismo, no certifica el XML 4.4.

## Validación XSD oficial: pendiente y separada

Las estructuras 4.4 han recibido revisiones durante 2026. **Esta entrega NO incluye un XSD oficial verificado**, porque no pudimos obtener y cotejar el archivo vigente desde el portal de Hacienda en el entorno de compilación. El uso del validador exige descargar primero el XSD vigente desde el portal oficial de TRIBU-CR / Hacienda, incluyendo sus importaciones locales cuando las requiera:

```powershell
python -m pip install "lxml>=5,<7"
python tests/qa-086-xsd-official.py --schema "C:\ruta\FacturaElectronica_V4.4.xsd" --xml "C:\ruta\FacturaCR_BORRADOR_FE44_venta_15.xml"
```

**Atención:** el borrador de FacturaCR sigue sin firma y con numeración ficticia; por ello **puede ser rechazado por un XSD completo**, aunque la prevalidación local sea correcta. La salida del script informa los errores y las líneas reales, sin asignar claves fiscales. No conviene manipular el XML para forzar un resultado verde. La validación oficial definitiva, RUT, CAByS, firma con certificado real y envío a Hacienda siguen pendientes.

Fuentes para consultar esquemas vigentes: https://ovitribucr.hacienda.go.cr/comprobantes-electronicos y https://www.hacienda.go.cr/docs/ANEXOS_Y_ESTRUCTURAS_V4.4.pdf . Comprobar fecha y procedencia de cada XSD antes de utilizarlo.

## QA, seguridad e instalación

Se incorporan 10 comprobaciones del servidor, 5 controles de interfaz, 3 controles del icono y 3 ensayos internos del lector XMLSchema. El conjunto `npm test` incluye la regresión de las 74 pruebas SQLite. No se modifica el modelo comercial, inventario, respaldos ni permisos. Solo se añade prevalidación y se conserva el estado de borrador sin validez fiscal.

Antes de reemplazar la aplicación, **crear y comprobar un respaldo independiente de SQLite**. Después ejecutar: `npm ci`, `npm test`, `npm run qa:fe44-preflight`, `npm run qa:real-server`, `npm run dist:win`. Publicar con `git add -A`, `git commit -m "feat: v0.6.86 - prevalidacion XML FE44 y diagnosticos"`, `git push origin main`. Se conservan `.gitignore`, `README.md`, `CHANGELOG.md` y `.github/workflows/`.

---

### Corrección puntual v0.6.85 — módulos PKI requeridos en el instalador Windows

- El diagnóstico `FacturaCR-Electron-Smoke-72` identificó que el ejecutable NSIS no encontraba `pkijs` al cargar `xmldsigjs` (no era un problema de SQLite ni de certificados).
- `pkijs@4.0.1` y `asn1js@4.1.0` ahora son **dependencias directas de producción**, no solamente paquetes instalados por dependencias *peer*. El `package-lock.json` se regeneró con `npm install --package-lock-only --offline` y versiones fijadas.
- Ambos paquetes se incluyen en `build.asarUnpack`. La nueva prueba `npm run qa:packaged-deps` inspecciona `app.asar` y `app.asar.unpacked` en Windows antes de intentar la instalación NSIS.
- Mantener el laboratorio XAdESjs exclusivamente **NO FISCAL** y exigir `3/3` firmas y `6/6` mutaciones rechazadas. No se accede al `.p12`, ni se habilita emisión.
- Verificar en CI con `npm ci`, `npm test`, `npm run qa:xades-engine`, `npm run dist:win` y `npm run qa:packaged-deps`; el ensayo NSIS es obligatorio antes de declarar resuelto el fallo.

## Actualización de diagnóstico Windows v0.6.85 — Laboratorio XAdESjs en NSIS

Se examinó el artefacto `FacturaCR-Electron-Smoke-71`: el ejecutable `win-unpacked` aprobó el laboratorio, mientras que la primera instalación NSIS falló en el ensayo XAdESjs **después de instalarse**. Todavía no se sabe si el origen es la carga ESM/ASAR o una excepción criptográfica específica porque el proceso anterior ocultaba la causa original. **No se debe confundir este error con daño de SQLite.**

Este ajuste prepara los módulos especializados fuera de ASAR, preserva en el QA la etapa y el error original (sin mostrarlos en el renderer comercial) y compara el SHA-256 de ambos archivos `app.asar`. El laboratorio empaquetado permanece obligatorio. Para comprobar el arreglo, ejecutar `npm ci`, `npm test`, `npm run qa:xades-engine`, `npm run qa:real-server`, `npm run dist:win`, hacer respaldo verificado de SQLite y publicar con `git add -A`, `git commit -m "fix: v0.6.85 - acceso ASAR y diagnostico XAdESjs instalado"`, `git push origin main`. En **QA Windows e instalador** comprobar especialmente el paso `Instalar, reinstalar y desinstalar sin perder datos SQLite`. Si vuelve a fallar, descargar el artefacto `FacturaCR-Electron-Smoke-N` y adjuntar `upgrade-primera-instalacion.json`, `upgrade-primera-instalacion-electron.log` y `upgrade-install-report.json`.

Se preservan `README.md`, `.gitignore`, `CHANGELOG.md` y `.github/workflows/`. Este ajuste no habilita emisión ni uso del `.p12` para firmar.

---

## Corrección de QA Windows v0.6.85 — `npm test` con saltos CRLF

**Incidencia:** el workflow «QA Windows e instalador» fallaba en «Ejecutar regresión de cálculos e integración SQLite» con `Falta manejo del error de arranque Electron` (`tests/qa-085-installer-startup-report.cjs`, línea 10). **No había comenzado la compilación ni la instalación NSIS.** La comprobación buscaba un bloque de texto con finales de línea `LF`, mientras el checkout de Windows podía utilizar `CRLF`.

**Ajuste:** la prueba normaliza `LF` y `CRLF` y comprueba ambas variantes sin reducir las aserciones de seguridad. Reproducido el fallo anterior con `CRLF` y verificado el arreglo. `npm test` pasó tanto en el proyecto original como en una copia de 180 archivos de texto convertidos a `CRLF`, con 74/74 verificaciones SQLite. **La ejecución real del instalador Windows continúa pendiente.**

**Qué sigue:** sustituir el código del proyecto por esta corrección (mantener la base SQLite respaldada), ejecutar `npm ci`, `npm test`, `npm run qa:xades-engine`, `npm run qa:real-server`, `npm run dist:win`; después `git add -A`, `git commit -m "fix: v0.6.85 - QA Windows compatible LF y CRLF"`, `git push origin main`. Revisar en Actions la nueva ejecución «QA Windows e instalador». Si falla en el arranque empaquetado, ahora sí estarán disponibles los informes del paso alcanzado, cuando se generen.

---

## Corrección de QA Windows v0.6.85 — informe de arranque al instalar

Si GitHub Actions falla en **«Instalar, reinstalar y desinstalar sin perder datos SQLite»** con `No se generó el informe de arranque: primera-instalacion`, la copia anterior tenía un fallo adicional en el manejo de errores de arranque: ejecutaba el laboratorio XAdESjs desde `catch` y podía impedir la escritura del informe. Se corrigió esta ruta para registrar la excepción original; no se puede afirmar aún que esté corregida la causa inicial de Windows sin ejecutar de nuevo el workflow.

El workflow **QA Windows e instalador** guarda evidencia en el artefacto `FacturaCR-Electron-Smoke-N`. Buscar `release/qa-evidence/upgrade-primera-instalacion.json` cuando exista y `upgrade-primera-instalacion-electron.log` incluso si el proceso termina antes de generar JSON. Si la prueba vuelve a fallar, revisar el error original de ese log. Los ensayos usan directorios SQLite temporales y no abren la base personal del usuario.

**Instalación y GitHub:** verificar respaldo SQLite antes de sustituir la aplicación; ejecutar `npm ci`, `npm test`, `npm run qa:xades-engine`, `npm run qa:real-server`, `npm run dist:win`; después de confirmar QA, `git add -A`, `git commit -m "fix: v0.6.85 - informe de errores y diagnostico instalador Windows"`, `git push origin main`. Se mantienen los workflows, `README.md`, `.gitignore` y `CHANGELOG.md`.

---

## FacturaCR v0.6.85 — Motor XAdESjs integrado SOLO en laboratorio (20/11/2026)

**Novedad real:** se incorporaron las dependencias especializadas al proyecto principal a partir del artefacto auditado de GitHub Actions v0.6.84: `xadesjs@3.1.0`, `xmldsigjs@3.1.0`, `xml-core@3.1.0`, `@xmldom/xmldom@0.9.12` y `xpath@0.0.35`. `package.json` y `package-lock.json` coinciden, y las integridades y direcciones de los paquetes quedaron registradas en el lockfile. El candidato pasó 3 firmas y 6 alteraciones rechazadas en el entorno Node 22 de Actions; su auditoría **solo de dependencias de producción** informó 0 vulnerabilidades en esa ejecución. **Todavía no se ha ejecutado un `npm ci` nuevo con scripts nativos en esta versión ni una auditoría completa con devDependencies desde el entorno de elaboración, debido a `EAI_AGAIN`**. La compatibilidad con la compilación e instalador de Windows **debe comprobarse** en Actions y en la PC antes de usar esta versión para trabajo diario.

**Nueva interfaz:** Empresas → Preparación FE 4.4 → **«Probar motor integrado XAdESjs»**. Ejecuta el adaptador `electron/fe-xades-integrated-lab.mjs`, carga las bibliotecas ESM de forma diferida y firma/verifica **exclusivamente tres XML sintéticos**: sencillo, servicio ficticio y mercadería ficticia. Cada firma usa clave RSA 2048 efímera, `SignedProperties`, política de ejemplo, verificaciones con la propia biblioteca y dos alteraciones rechazadas; muestra 3/3 firmas y 6/6 mutaciones. El IPC no admite argumentos; no recibe ni devuelve XML, certificados, rutas, claves, contraseñas, usuarios o datos fiscales. Solo el frame principal de Electron puede ejecutarlo; las ejecuciones simultáneas se rechazan. Se conserva el selector de `.p12` y los módulos previos, **sin usar el certificado real en este ensayo**.

**Pruebas requeridas:** `npm test` (QA offline y 74 verificaciones SQLite) pasó localmente. Los comandos `npm run qa:xades-engine` (carga de paquetes reales y 3 firmas), `npm run qa:real-server`, `npm run build`, `npm run dist:win`, `npm run qa:packaged` y `npm run qa:security-audit` requieren dependencias instaladas; no fueron comprobados aquí. El workflow QA Linux exige `npm run qa:xades-engine`, `npm audit --omit=dev --audit-level=high` y Vite. El workflow Windows exige el mismo ensayo, servidor Express nativo, instalador NSIS y ejecuta de nuevo el laboratorio integrado **en el ejecutable empaquetado** mediante la API protegida de Electron; ese es el control decisivo para ESM/ASAR y `better-sqlite3`. Una auditoría completa, incluidas dependencias de desarrollo, se ejecuta aparte con `npm run qa:security-audit` y se revisan sus resultados; una auditoría verde de producción no acredita ausencia universal de riesgos.

**Bloqueo fiscal vigente:** el generador de FacturaElectronica 4.4 todavía produce borradores. No se conecta este laboratorio al XML real ni a la clave del contribuyente. No hay firma fiscal, envío, recepción, validación XSD completa, cadena de confianza/revocación ni aceptación Hacienda; `canSignFiscalXml`, `canIssue` y `canSend` siguen en `false`. No hay migración SQLite ni cambios en ventas, cálculo de IVA, inventario, usuarios, impresión, auditoría o respaldos.

**Instalación y GitHub:** verificar antes un respaldo SQLite independiente; después, en PowerShell desde el proyecto, ejecutar `npm ci`, `npm test`, `npm run qa:xades-engine`, `npm run qa:real-server`, `npm run dist:win`. Tras validar el instalador y el laboratorio en Windows, publicar: `git add -A`, `git commit -m "feat: v0.6.85 - integracion XAdESjs laboratorio y QA empaquetado"`, `git push origin main`. Mantener `README.md`, `.gitignore`, `CHANGELOG.md` y `.github/workflows/`. **No sobrescribir la instalación con datos reales si alguno de estos controles falla.**

---

## FacturaCR v0.6.84 — Preparación reproducible de XAdESjs, sin firma fiscal

La evaluación de GitHub Actions de la v0.6.83 se ejecutó con éxito en Node 22 y 24, según las capturas de la ejecución que compartió el usuario. Eso **no equivale** a certificar firmas tributarias. Esta versión incorpora un adaptador aislado `electron/fe-xades-specialized-lab.mjs` que recibirá las bibliotecas especializadas por inyección durante el ensayo. Solo procesa tres XML estrictamente ficticios, genera claves RSA temporales, firma y verifica, y exige el rechazo de modificaciones del monto y la política. No accede al `.p12` real y aún no se conecta a la aplicación para emitir XML.

**Cambio de seguridad:** el workflow de evaluación usa `@xmldom/xmldom@0.9.12` en vez de 0.9.10, y Actions v6 para evitar avisos por runtime Node 20. Revisar `npm audit` al ejecutarlo, porque actualizar un paquete no demuestra que no existan otras vulnerabilidades.

**Tres trabajos manuales:** GitHub → Actions → **Evaluacion aislada XAdESjs (NO FISCAL)** → **Run workflow**. Comprobar los trabajos Node 22, Node 24 y **Candidato de lockfile XAdESjs**. El tercer trabajo generará un paquete `QA-XAdESjs-candidato-lockfile-node-22` con `package.candidato.json`, `package-lock.candidato.json`, `dependencias.txt`, `auditoria-npm.json` y las muestras XML sintéticas cuando los pasos terminen. Estos son **documentos de revisión, no archivos para copiar automáticamente al proyecto**. Solo incorporaremos ese lockfile después de auditarlo y ejecutar `npm ci`, compilación Vite, pruebas nativas y NSIS en Windows.

**Alcance y límites:** la versión de producción conserva exactamente las dependencias anteriores; no se instalaron XAdESjs, XMLDSigjs ni XML Core porque el registro npm sigue devolviendo `EAI_AGAIN` en el entorno de elaboración. Por tanto, el adaptador queda implementado, pero **su ensayo real con los módulos especializados y la creación del candidato de lockfile quedan pendientes de GitHub Actions**. La firma XAdES-EPES de comprobantes reales, las verificaciones de cadena de confianza y XSD 4.4, y la emisión ante Hacienda continúan bloqueadas.

**Instalación y GitHub:** primero crear y verificar un respaldo de SQLite fuera del proyecto. Desde PowerShell ejecutar `npm ci`, `npm test`, `npm run qa:real-server`, `npm run dist:win`; después de comprobar todo, ejecutar `git add -A`, `git commit -m "feat: v0.6.84 - adaptador XAdESjs y candidato de lockfile seguro"`, `git push origin main`. Conservar `README.md`, `.gitignore`, `CHANGELOG.md` y `.github/workflows/`.

---

## v0.6.83 — Evaluación aislada de XAdESjs 3.1.0 con política explícita (NO FISCAL)

Esta versión **no instala XAdESjs en producción** ni habilita firma o envío tributario. Amplía el workflow manual «Evaluacion aislada XAdESjs (NO FISCAL)» para evaluar Node 22 y Node 24 con las versiones controladas de `xadesjs`, `xmldsigjs` y `xml-core` 3.1.0 en un directorio temporal; `package-lock.json` de FacturaCR no recibe dependencias nuevas. La ejecución remota todavía debe confirmarse en GitHub Actions.

El nuevo ensayo `tests/qa-083-xadesjs-epes-evaluation.mjs` solicita una firma XMLDSig de **tres estructuras de laboratorio** con RSA-SHA256 y `SignaturePolicyIdentifier` explícito para la política de ejemplo de Hacienda. La opción `digestValue` del API evita confundir el hash del texto de la URL con la huella binaria del documento de política. Reabre cada XML con la biblioteca y exige que al alterar monto o política se rechace la firma.

El verificador independiente `tests/qa-083-xadesjs-epes-independiente.py` comprobará —si el workflow obtiene dependencias correctamente— canonicalización, dos referencias SHA-256, valor de política y firma RSA usando `lxml` y `cryptography`. Las muestras son sintéticas y **no contienen certificados ni claves reales**; no se valida cadena de confianza, conformidad XAdES-EPES integral, XSD 4.4 ni Hacienda. Un informe JSON y tres XML ficticios se publicarán como artefactos de Actions durante 14 días. **Estos resultados no activan la emisión**, incluso si todo pasa.

**Para ejecutar:** GitHub → Actions → «Evaluacion aislada XAdESjs (NO FISCAL)» → Run workflow. Revisar los jobs Node 22/24 y descargar `QA-XAdESjs-NO-FISCAL-node-22/24`. Antes de reemplazar el proyecto, respaldar y verificar SQLite; ejecutar `npm ci`, `npm test`, `npm run qa:real-server`, `npm run dist:win`, y luego `git add -A`, `git commit -m "feat: v0.6.83 - evaluacion XAdESjs aislada y verificador independiente"`, `git push origin main`. Se conservan `README.md`, `.gitignore`, `CHANGELOG.md` y los workflows.

---

## v0.6.82 — Diagnóstico de motor XMLDSig/XAdESjs y QA aislado (sin emisión)

- Añadido en Empresas → Preparación FE 4.4 el control **Comprobar motor XAdESjs**: evalúa Node.js/Electron, WebCrypto RSA-SHA256 y presencia de las dependencias de firma especializadas, sin pedir certificados, contraseñas ni datos de ventas. Si no están integradas, informa "pendiente"; **no habilita firma fiscal**.
- Incorporado `electron/fe-xades-engine-readiness.cjs` con diagnóstico de solo lectura, inyección verificable en pruebas y resultados limitados al renderer.
- Incorporado un workflow separado y manual de GitHub Actions para instalar temporalmente XAdESjs, XMLDSigjs y XML Core en un entorno de evaluación, sin modificar `package-lock.json` del sistema ni incorporarlo como dependencia de producción. El ensayo comprueba firma y verificación sobre XML ficticio; los resultados remotos todavía deben ejecutarse y evaluarse.
- El acceso a npm desde el entorno de preparación falló con `EAI_AGAIN`: **no se afirma que el motor XAdESjs haya sido integrado ni probado aquí**. No se cambia el motor restringido del laboratorio ni se utiliza la clave privada real.
- Sin migraciones SQLite ni modificaciones de ventas. Firma y envío a Hacienda bloqueados. Antes de actualizar, verificar respaldo y correr `npm ci`, `npm test`, `npm run qa:real-server`, `npm run dist:win` en Windows.

# FacturaCR v0.6.81 — Verificación local del XML ficticio exportado (19/11/2026)

## Qué hay de nuevo

En **Empresas → Preparación FE 4.4**, puedes ejecutar el laboratorio XMLDSig/XAdES-EPES como antes y utilizar **«Guardar XML ficticio»**. La exportación ahora verifica criptográficamente su propia firma y dos referencias **antes de escribir el archivo**. El botón independiente **«Verificar XML ficticio guardado»** está disponible **sin seleccionar el certificado real ni ingresar su contraseña**: abre un selector de Windows y repite la verificación local sobre ese archivo, sin necesitar que compartas el XML.

La pantalla confirma firma RSA-SHA256, las dos referencias SHA-256 (documento `enveloped` y `SignedProperties`), variante, huella del archivo y fecha de vigencia del certificado ficticio. Si una referencia, contenido, firma o política fueron modificados, el diagnóstico muestra **«NO pasó la verificación»**. No devuelve claves ni la ruta completa al navegador. Los certificados de prueba duran una hora; después de ese plazo, una firma histórica correcta sigue siendo comprobable criptográficamente con el aviso de vigencia correspondiente.

**Limitación fundamental:** este verificador solo entiende las **tres plantillas sintéticas exactas** que genera FacturaCR; rechaza cambios incluso de serialización. No es una biblioteca XMLDSig/XAdES general, no valida certificado real, cadena de confianza, revocación, XSD 4.4 ni aceptación de Hacienda. No permite firmar ni emitir facturas electrónicas reales. Nunca elijas un XML con datos tributarios reales en este módulo. La comprobación de política sigue siendo documental y referencial.

**Dependencia especializada pendiente:** se comprobó XAdESjs 3.x (ESM, requiere Node.js compatible). El entorno actual no puede acceder a `registry.npmjs.org` (`EAI_AGAIN`), por lo que no se alteró el lockfile para añadir un paquete sin instalar ni verificar. El objetivo siguiente es integrar y ensayar un motor XMLDSig/XAdES general para comprobantes válidos, con verificador independiente y XSD oficial 4.4.

## Instalación / GitHub

1. **Antes de reemplazar archivos**, crear y verificar una copia independiente de la base SQLite. No sobrescribir ni borrar la base de datos de producción.
2. En PowerShell, desde la carpeta del proyecto, ejecutar:

```powershell
npm ci
npm test
npm run qa:real-server
npm run dist:win
```

3. Comprobar el instalador en Windows, el XML de prueba y los workflows. Luego publicar:

```powershell
git add -A
git commit -m "feat: v0.6.81 - verificacion local de XML ficticio firmado"
git push origin main
```

Se conservan `README.md`, `.gitignore`, `CHANGELOG.md` y `.github/workflows/`. No se generan informes ni notas de versión adicionales en el ZIP.

---

# FacturaCR v0.6.80 — Ensayos de distintas estructuras XML con verificación externa (19/11/2026)

**Nuevo:** en **Empresas → Preparación FE 4.4 → Prototipo XMLDSig**, tras ejecutar la firma XML sintética aparece **«Probar 3 variantes de XML»**. El ensayo genera y firma tres estructuras de laboratorio (monto sencillo, servicio ficticio y mercadería ficticia). La clave RSA de cada prueba es temporal y el certificado es autofirmado, sin ninguna relación con el `.p12` real. React recibe solo un reporte de los resultados, **no** el XML, el certificado ni las claves privadas.

**Verificación independiente:** el nuevo `tests/qa-080-xmlsig-variantes.py` utiliza `lxml` y `cryptography` en el job de GitHub Actions para volver a calcular dos referencias C14N, comprobar firma RSA-SHA256, propiedades XAdES de simulación y rechazar alteraciones. Es una ampliación controlada de la prueba anterior: **NO** acepta XML fiscal como entrada, **NO** valida XSD 4.4 ni reemplaza una implementación XMLDSig/XAdES especializada. Los tres diseños son plantillas predefinidas. En el ambiente de desarrollo se puede ejecutar con Python 3, `lxml` y `cryptography` instalados.

**Dependencia pendiente:** se evaluó XAdESjs como biblioteca especializada; el acceso a `registry.npmjs.org` falló (`EAI_AGAIN`), por lo que no se alteró el `package-lock.json` para añadir paquetes no probados. La implementación de firma y verificación de XML **arbitrario**, la cadena de confianza, la revocación, el XSD oficial 4.4 y las pruebas de Hacienda siguen pendientes. No se permite emitir ni enviar XML a Hacienda. Esta mejora no modifica ventas, impuestos, usuarios ni SQLite.

**Instalación y GitHub:** primero respaldar y verificar SQLite, fuera del proyecto. Ejecutar `npm ci`, `npm test`, `npm run qa:real-server` y `npm run dist:win`; tras comprobar la compilación en Windows: `git add -A`, `git commit -m "feat: v0.6.80 - ensayos XML sintéticos y QA externo"`, `git push origin main`. Se conservan `.gitignore`, `CHANGELOG.md`, `.github/workflows/` y la documentación anterior.

---

# FacturaCR v0.6.79 — Exportación verificable de XMLDSig/XAdES ficticio (19/11/2026)

**Novedad:** en **Empresas → Preparación FE 4.4 → Prototipo XMLDSig**, tras ejecutar «Ensayar firma XML ficticia», aparece el botón «Guardar XML ficticio». Electron abre el diálogo nativo y genera **otra firma sintética nueva** con certificado RSA efímero. Guarda únicamente un XML de demostración `FacturaCRLaboratorio`, NO una factura. La interfaz informa nombre y huella SHA-256, sin mostrar la ruta local. El guardado usa `wx` (no sobrescribe archivos anteriores ni sigue enlaces simbólicos), requiere extensión `.xml`, aplica límite de 100 KB y no recibe XML ni rutas desde React. Si el usuario cancela, no genera la clave. NO guarda la clave privada ni el certificado real `.p12`.

**Verificador externo reforzado:** en GitHub Actions, `tests/qa-078-xmlsig-independiente.py` comprueba C14N, los dos digestos, política de ejemplo y RSA-SHA256; `tests/qa-079-xmlsig-endurecimiento.py` prueba mutaciones de contenido, duplicación de firmas/IDs, DTD y referencias externas. Los scripts necesitan Python 3 con `lxml` y `cryptography`, instalados solamente en el job de CI. Para probar manualmente un archivo ficticio exportado:

```powershell
python -m pip install lxml cryptography
python tests/qa-078-xmlsig-independiente.py "RUTA_AL_XML_FICTICIO.xml"
python tests/qa-079-xmlsig-endurecimiento.py "RUTA_AL_XML_FICTICIO.xml"
```

**Límite:** el prototipo anterior sigue limitado a una sola plantilla fija y a un certificado autofirmado. La comprobación NO es una validación XAdES/PKI para comprobantes reales. Las verificaciones en CI tampoco autorizan emisión. La instalación de la biblioteca especializada XMLDSig/XAdES y el XSD oficial continúan pendientes, al igual que las pruebas con Hacienda. El borrador XML 4.4, las ventas, SQLite, permisos y respaldos no se modifican.

**Instalación y GitHub:** primero crear y verificar copia de la base SQLite fuera del proyecto. Después ejecutar `npm ci`, `npm test`, `npm run qa:real-server` y `npm run dist:win`. Tras comprobar los resultados en Windows: `git add -A`, `git commit -m "feat: v0.6.79 - exportacion XML ficticio y verificacion reforzada"`, `git push origin main`. Se conservan `.gitignore`, `CHANGELOG.md`, workflows de Actions y este README.

---

# FacturaCR v0.6.78 — Prototipo XMLDSig/XAdES-EPES aislado (19/11/2026)

**Alcance real:** en Empresas → Preparación FE 4.4, después de completar el certificado, cotejar la política y ejecutar el laboratorio RSA previo, se muestra un segundo botón **Ensayar firma XML ficticia**. El módulo `electron/fe-xades-xml-lab.cjs` produce únicamente una plantilla de simulación inmutable (`<FacturaCRLaboratorio>`), la firma con una clave RSA 2048 recién generada, añade `ds:SignedInfo`, `ds:SignatureValue`, certificado X.509 temporal AUTO-FIRMADO no confiable, `xades:SignedProperties` y referencia explícita a la política del Anexo 2. Incluye canonicalización C14N-20010315 **solo para la plantilla fija**, dos referencias SHA-256, transform enveloped y controles de alteración.

**Verificación externa:** `tests/qa-078-xmlsig-independiente.py` recomputa ambos digestos con `lxml` mediante C14N y verifica RSA-SHA256 con `cryptography` usando exclusivamente la clave pública del certificado de demostración. Para ensayarla, usar Python con `lxml` y `cryptography`, generar el XML de prueba desde `createXmlProof()` y pasárselo al script. La ejecución normal `npm test` no requiere Python.

**Límites estrictos:** nunca se firma XML fiscal ni se usa el `.p12` real en este prototipo; no se recibe XML externo ni se entrega certificado, clave o XML a React. La clave privada ficticia vive solo durante la función de ensayo. No hay persistencia SQLite, conexión de red, cambio de permisos ni envío a Hacienda. **NO se trata de un motor XAdES de producción:** la canonicalización construida para una plantilla fija no procesa XML arbitrario, y queda pendiente una biblioteca general auditada, validación estructural/criptográfica XAdES independiente, cadena y revocación, XSD oficial 4.4, numeración fiscal y aceptación por Hacienda. Los resultados no habilitan emisión.

Pruebas: `npm test`, `npm run qa:real-server`, `npm run dist:win`; para comprobar XMLDSig con herramientas externas se utiliza el ensayo independiente de CI. Antes de actualizar, crear y verificar un respaldo separado de SQLite.

---

# FacturaCR v0.6.77 — Laboratorio criptográfico local (19/11/2026)

## 1. Alcance implementado

En **Empresas → Preparación FE 4.4**, tras aceptar un certificado y comprobar la huella del PDF oficial del Anexo 2, aparece **Laboratorio de firma RSA-SHA256 → Ejecutar ensayo local**. Esta prueba genera una **clave RSA 2048 ficticia**, firma bytes de un XML de laboratorio (no fiscal), verifica criptográficamente la firma y comprueba que cambiar el contenido o la firma invalida la verificación. Se ejecuta localmente en el proceso principal de Electron y no lee, usa ni almacena el `.p12` real del contribuyente.

**Advertencia esencial:** este laboratorio NO genera `ds:Signature`, XMLDSig ni XAdES-EPES: no hay canonicalización, SignedProperties, política efectivamente firmada, ni firmado de XML fiscal. No guarda un comprobante firmado, no emite, no envía a Hacienda y nunca habilita `canSign` ni `canIssue`. El borrador fiscal continúa con numeración ficticia. Esta versión comprueba **un componente criptográfico** mientras se prepara una integración XMLDSig/XAdES especializada y auditable, que no pudo instalarse en este entorno por falta de acceso a npm.

## 2. Seguridad y persistencia

- Las claves RSA se generan para cada ensayo y se utilizan solo en memoria, con datos de prueba. No se pide ni se expone una contraseña adicional.
- React recibe únicamente resultados booleanos y metadatos del ensayo; no recibe certificados, claves, firma ni XML.
- El IPC solo acepta el marco principal autorizado; no permite archivos ni XML proporcionados por el usuario.
- El ensayo queda disponible después de un certificado técnicamente verificado y una comparación documental exitosa de política; esto **no valida** la autenticidad del emisor fiscal.
- La suite anterior, la base SQLite, las ventas, el IVA, las notas de crédito, el inventario y la impresión permanecen sin cambios.

## 3. QA

- `tests/qa-077-crypto-lab.cjs`: firma RSA-SHA256, rechazo de contenido/firma alterados, política de referencia, no emisión y resultado filtrado; verifica también con **OpenSSL**, si está instalado (en Windows no se requiere OpenSSL para ejecutar la suite).
- `tests/qa-077-crypto-lab-ui.cjs`: nueva interfaz, IPC permitido, limpieza por empresa, diseño responsivo, acceso condicionado y advertencias de no emisión.
- `npm test`: ejecuta unidades, UI estática, integración SQLite y sintaxis. **Resultados de la ejecución actual se documentan en el chat; no se da por ejecutada compilación Windows.**
- Pendientes: `npm run qa:real-server`, `npm run build` y `npm run dist:win` en un entorno con dependencias; verificación visual en Windows.
- Pendiente de firma efectiva: instalar y auditar biblioteca XMLDSig/XAdES con canonicalización, `SignedProperties` y verificador independiente, validar XSD, titular y política, y obtener respuesta del ambiente de Hacienda.

## 4. Instalación y GitHub

**Crear y comprobar un respaldo de SQLite, guardado fuera de la carpeta del proyecto, antes de reemplazar archivos.**

```powershell
npm ci
npm test
npm run qa:real-server
npm run dist:win
```

```bash
git add -A
git commit -m "feat: v0.6.77 - laboratorio local RSA-SHA256 seguro"
git push origin main
```

Se conservan `.gitignore`, `README.md`, `CHANGELOG.md` y `.github/workflows/`.

---

# FacturaCR v0.6.76 — Cotejo referencial de política XAdES-EPES (18/11/2026)

**Corrección puntual del 18/11/2026 — falso negativo de huella PDF:** se corrige una transcripción en `electron/fe-xades-policy.cjs`: el valor Base64 del ejemplo oficial debe contener `WOeI8` (**I mayúscula**), no `WOel8` (ele minúscula). El SHA-256 oficial de referencia decodificado es `0D6C629F5C5639E23C3AE5905DACE1E158CB5806822C003DE787A6EC3321D21F`, exactamente el mostrado en la prueba real del usuario con el PDF de Hacienda. Se añade prueba de regresión que compara **el valor literal Base64 y sus bytes decodificados** con el digest oficial. No requiere seleccionar otro certificado, cambiar PDF, instalar dependencias ni modificar SQLite. La coincidencia sigue siendo **documental/referencial**; no activa firma ni envío a Hacienda.

## 1. Funcionalidad nueva

La prueba anterior de lectura y correspondencia del certificado continúa intacta. **Empresas → Preparación FE 4.4** muestra ahora, después del diagnóstico del `.p12/.pfx`, el bloque «Política oficial XAdES-EPES» con un botón **Examinar PDF y comparar huella**.

La operación abre un selector nativo del sistema operativo, solo acepta archivos PDF regulares de hasta 12 MB y calcula SHA-256 localmente. Compara ese resultado con la huella **de ejemplo** publicada por Hacienda en el **Anexo 2, versión 4.4**. Un PDF diferente no necesariamente es falso: puede ser una revisión posterior. **No se considera la coincidencia como garantía de procedencia, vigencia o aprobación**. El proceso no guarda una copia del PDF, ni la contraseña o la clave privada en SQLite.

**Fuente del PDF de política (indicada en el Anexo 2):**
https://cdn.comprobanteselectronicos.go.cr/xml-schemas/Resoluci%C3%B3n_General_sobre_disposiciones_t%C3%A9cnicas_comprobantes_electr%C3%B3nicos_para_efectos_tributarios.pdf

**Fuente del anexo:**
https://www.hacienda.go.cr/docs/ANEXOS_Y_ESTRUCTURAS_V4.4.pdf

**Referencia histórica de huella de ejemplo (SHA-256, Base64):** `DWxin1xWOeI8OuWQXazh4VjLWAaCLAA954em7DMh0h8=`.

## 2. Estado de seguridad y límites

**Firma XML XAdES-EPES y envío a Hacienda siguen bloqueados.** No se implementó un motor XMLDSig/XAdES ni una validación XSD oficial completa, y los borradores existentes contienen claves y consecutivos sintéticos, por lo que no son comprobantes válidos. Un hash correcto NO desbloquea la firma. Para firmar realmente faltan una biblioteca especializada verificable, canonicalización, referencias XML firmadas, política vigente, verificador independiente, validación XSD, autorización del emisor y pruebas oficiales.

## 3. QA

- `tests/qa-076-xades-policy.cjs`: 12/12 (cálculo SHA-256, cotejo referencial, rechazo de archivos/symlinks/tamaño, preservación de bytes, no fuga de rutas, barrera de firma).
- `tests/qa-076-xades-policy-ui.cjs`: 7/7 (selector nativo, mensajes, controles, limpieza de estado, no activación de firma, diseño adaptable).
- `npm test`: aprobado; incluye las pruebas anteriores y las 74 pruebas locales de integración SQLite.
- `npm run qa:real-server`: pendiente por ausencia de Express en el entorno. `npm run build`: pendiente por ausencia de Vite. Instalador NSIS y prueba visual real de Windows: pendientes.
- `src/FeSignatureReadiness.jsx`: análisis de sintaxis JSX con TypeScript aprobado, sin ejecutar la aplicación visualmente.

## 4. Instalación y GitHub

**Antes de reemplazar el proyecto, crear y verificar un respaldo de la base SQLite** en una carpeta independiente:

```powershell
npm ci
npm test
npm run qa:real-server
npm run dist:win
```

Tras comprobarlo en Windows:

```powershell
git add -A
git commit -m "feat: v0.6.76 - cotejo documental de politica XAdES-EPES"
git push origin main
```

Se mantienen `README.md`, `.gitignore`, `CHANGELOG.md` y `.github/workflows`. Sin cambios de esquema SQLite y sin nuevas dependencias. **Versión: 0.6.76.**

---

# FacturaCR v0.6.75 — Comprobación criptográfica local de clave privada (18/11/2026)

## 1. Funcionalidad nueva en Empresas → Preparación FE 4.4

Se conservan **dos campos independientes** (archivo `.p12/.pfx` y contraseña) y el botón **Aceptar y verificar certificado** de la v0.6.74. Al aceptarlo, cuando el certificado está vigente y utiliza RSA admitido, se realiza adicionalmente **un ensayo local TLS** con el P12 dentro del proceso principal de Electron, únicamente sobre `127.0.0.1`, con un puerto efímero: el handshake prueba que se puede utilizar la clave privada y se coteja la huella SHA-256 del certificado mostrado. No se instala ni llama a ningún servidor remoto. La clave privada no se exporta, copia a SQLite, escribe a disco ni pasa al renderer; la contraseña se elimina del formulario y el búfer del P12 se sobreescribe al salir. El ensayo puede ser *indeterminado* si el certificado no admite uso TLS u ocurre un error local: **eso no equivale a certificar que la clave sea inválida**.

El diagnóstico ahora muestra **Preparación XAdES-EPES**, con dos estados verificables cuando corresponda (P12 legible/vigente y ensayo local de correspondencia), y seis **pendientes explícitos**: cadena de confianza y revocación, titularidad ante Hacienda, política oficial, validación XSD 4.4 y numeración real, motor XMLDSig/XAdES verificado y aceptación en ambiente de pruebas. Esta revisión no genera ni firma ningún XML.

## 2. Motivo del bloqueo de firma y emisión

El XML actual es un **borrador con clave y consecutivo ficticios**. No se debe firmar ni emitir como comprobante tributario. La norma exige una firma **XAdES-EPES v1.3.2 o superior**, tipo **ENVELOPED**, basada en certificado RSA 2048/4096 y digest SHA-256/512. No incorporamos una implementación improvisada de canonicalización o una URL de política inventada: primero se requiere biblioteca XMLDSig/XAdES auditable, política vigente verificable y pruebas criptográficas independientes. **`canSign` y `canIssue` permanecen falsos**, sin endpoint de firma o envío.

Referencias normativas: [Anexo 2 XML 4.4 (PGR)](https://pgrweb.go.cr/DOCS/NORMAS/1/VIGENTE/S/2020-2029/2020-2024/2024/1936C/1701B7.HTML) y [API de comprobantes (Hacienda)](https://www.hacienda.go.cr/docs/ComprobantesElectronicosAPI.html).

## 3. QA de v0.6.75

- `tests/qa-075-private-key-proof.cjs`: 8 casos aprobados (certificados RSA ficticios generados temporalmente con OpenSSL, clave equivocada, bloqueo de firma/emisión, no exposición de material privado, error del ensayo).
- `tests/qa-075-signature-gate-ui.cjs`: 5 casos aprobados (pantalla, IPC, restricciones y adaptación responsiva).
- `npm test`: aprobado; incluye 74 pruebas de integración SQLite y todas las regresiones de versiones anteriores.
- `npm run qa:real-server`: no ejecutable aquí por ausencia de Express (`ERR_MODULE_NOT_FOUND`).
- `npm run build`: no ejecutable aquí porque Vite no está instalado. La instalación completa/NSIS y ensayo con certificado real en Windows quedan pendientes. No se ha probado emisión real.

## 4. Instalación y GitHub

**Respaldar y verificar la base SQLite antes de reemplazar el proyecto**, fuera de la carpeta de actualización. Desde PowerShell:

```powershell
npm ci
npm test
npm run qa:real-server
npm run dist:win
```

Tras comprobar el programa y los tests en Windows:

```powershell
git add -A
git commit -m "feat: v0.6.75 - prueba criptografica local y control XAdES"
git push origin main
```

Se mantienen `.gitignore`, `README.md`, `CHANGELOG.md`, workflows de GitHub Actions, historial de ventas, SQLite, usuarios y respaldos. No hay migraciones ni nuevas dependencias. **Versión actual: 0.6.75.**

---

# FacturaCR v0.6.74 — Selección independiente de certificado y aceptación segura (17/11/2026)

## 1. Cambios en Empresas → Preparación FE 4.4

La sección **Certificado digital de Hacienda** presenta **dos campos independientes**: (1) certificado `.p12` o `.pfx`, con botón **Examinar**; (2) **Contraseña del certificado**, con opción Mostrar/Ocultar. Debajo de ambos aparece el botón separado **Aceptar y verificar certificado**, deshabilitado hasta completar la selección y la clave. La selección del archivo **no** solicita la contraseña ni inicia inspección criptográfica; el resultado solo aparece después de pulsar Aceptar. En pantalla se muestra únicamente el nombre del archivo, nunca su ruta.

La selección nativa se procesa en el proceso principal de Electron mediante un identificador aleatorio efímero vinculado a la empresa. El renderer no puede proporcionar rutas de archivos a la operación de inspección. Antes de leer, se comprueba que el archivo sigue siendo regular, que no es un enlace simbólico y que mantiene tamaño, dispositivo, inodo y fechas; se compara además el descriptor abierto. Tamaño máximo 4 MB. La contraseña se borra del estado del formulario antes de inspeccionar; no se guarda en SQLite, auditoría, configuración, ZIP ni en la API HTTP. El búfer leído se sobrescribe con ceros al terminar.

Se conserva la validación local PKCS#12 de Node/OpenSSL: el contenedor debe incluir certificado y clave privada, fechas verificables y clave pública RSA. Para compatibilidad técnica con el perfil de Hacienda se señalan **RSA 2048 o 4096 bits**. Muestra los datos declarados del titular, emisor, vigencia y huella SHA-256 sin certificar inscripción, revocación ni cadena de confianza. Al cambiar de empresa o cerrar el panel se descarta la selección; aceptar correctamente consume el identificador, y una contraseña errónea puede reintentarse sin volver a seleccionar.

## 2. Alcance fiscal y seguridad

**Esta versión todavía NO genera una firma XML XAdES-EPES real**, NO valida una firma contra Hacienda, NO emite comprobantes y NO transmite datos del certificado. El borrador XML 4.4 sigue identificado como documento de prueba. La implementación de XMLDSig y XAdES-EPES (enveloped, canonicalización C14N, política y referencias/huellas, XSD, revocación y verificación independiente) continúa pendiente antes de habilitar firmas reales. No se añadieron dependencias criptográficas no auditadas ni firma ficticia.

**Referencia normativa:** Anexo 2 del Ministerio de Hacienda/PGR sobre mecanismos de seguridad XML 4.4: https://www.pgrweb.go.cr/DOCS/NORMAS/1/VIGENTE/S/2020-2029/2020-2024/2024/1936C/1701B8.HTML

## 3. Pruebas QA

`npm test` integra `tests/qa-074-certificate-selection.cjs` (selección, aceptación, permisos por empresa, archivo alterado, clave errónea, tamaño, symlinks, lectura P12 de ensayo) y `tests/qa-074-certificate-ui.cjs` (dos campos, botones independientes, IPC, limpieza, interfaz adaptable), además de regresiones anteriores y SQLite. Las pruebas criptográficas generan certificados temporales de ensayo y no utilizan material real del usuario. El entorno de desarrollo utilizado para esta entrega no cuenta con dependencias de Express ni Vite instaladas, por lo que la prueba del servidor real y la compilación requieren ejecutarse después de `npm ci` en Windows. La aceptación final exige verificar la interfaz y el instalador en Windows.

## 4. Instalación y GitHub

**Antes de actualizar, crear y verificar un respaldo independiente de la base SQLite** y conservarlo fuera de la carpeta del proyecto. Ejecutar en PowerShell:

```powershell
npm ci
npm test
npm run qa:real-server
npm run dist:win
```

Tras comprobar la ejecución local:

```powershell
git add -A
git commit -m "feat: v0.6.74 - certificado y clave separados con aceptar seguro"
git push origin main
```

Se conservan `.gitignore`, `README.md`, `CHANGELOG.md` y los workflows de GitHub Actions. No se necesitan cambios de esquema SQLite. La versión actual es **0.6.74**.

---

## Ajuste de catálogos 0.6.72 (17-11-2026)
- Índice CIIU4: se añade la actividad 6619.0, verificada en la tabla de correspondencias ATV–TRIBU-CR publicada por Hacienda. El índice sigue siendo de referencia, NO un padrón completo ni prueba de inscripción; la consulta RUT permanece disponible.
- CAByS: mantiene la API oficial en línea y ahora interpreta respuestas con datos envueltos, sin confundir `code:200` con un CABYS. Verifica el código de 13 dígitos contra lo solicitado.
- Si Hacienda no devuelve el código `2449001000000`, muestra una **referencia publicada**, claramente no verificada en línea, con indicación para confirmarlo en el catálogo actual del BCCR. No se modifica el IVA ni se afirma aceptación fiscal.
- Se agregan pruebas de regresión CIIU4/CABYS y se conservan datos de clientes, productos y ventas sin migraciones.

# FacturaCR v0.6.73 — Revisión segura de certificado para futura firma XAdES-EPES

## Nueva etapa v0.6.73 · Inspección segura de certificados digitales

En **Empresas → Preparación para factura electrónica 4.4 → Revisión local de certificado digital**, el propietario y los administradores autorizados pueden revisar un archivo **PKCS#12 (.p12 / .pfx)** usando el selector nativo de Windows. La contraseña se introduce en la interfaz, se usa una sola vez en el proceso principal de Electron y se elimina del estado del formulario; **no se almacena en SQLite, ni en archivos de configuración, auditoría o reportes**. El archivo se lee en memoria con un límite de 4 MB y su búfer se borra después de procesarlo; nunca se copia al proyecto.

Se muestra el **sujeto**, emisor, vigencia, huella SHA-256 y tipo/longitud de clave pública. La inspección requiere un PKCS#12 legible que contenga clave privada y certificado. Identifica un certificado caducado o aún no vigente y una clave que no sea RSA de al menos 2048 bits. La información es **un diagnóstico técnico, no un veredicto de aceptación fiscal**. Aún falta validar cadena de confianza, revocación, correspondencia con el contribuyente/RUT, política de firma, XSD y pruebas oficiales. La firma XAdES-EPES real permanece DESHABILITADA.

Si abres FacturaCR desde un navegador (Vite) y no desde Electron, el diagnóstico no solicita contraseñas. Tampoco se añade un endpoint HTTP para subir certificados. No se necesita modificar la base SQLite ni recalcular ventas antiguas.

**Pruebas:** `node tests/qa-073-cert-check.cjs` verifica lectura de PKCS#12 de ensayo (si OpenSSL está disponible), error por contraseña incorrecta, fecha fuera de vigencia, contenedor sin clave, límites de tamaño y no divulgación. `node tests/qa-073-signature-ui.cjs` comprueba aislamiento de rutas, Electron y permisos de presentación. Ambas están integradas en `npm test` y GitHub Actions.

**Para actualizar:** primero crea y verifica una copia independiente de la base SQLite y ejecuta en PowerShell:

```powershell
npm ci
npm test
npm run qa:real-server
npm run dist:win
```

**Para GitHub (después de QA local):**

```powershell
git add -A
git commit -m "feat: v0.6.73 - revision segura de certificados FE 4.4"
git push origin main
```

Conserva `.gitignore`, `README.md`, `CHANGELOG.md` y los workflows en `.github/workflows/`.

---


## Ajuste puntual v0.6.72 · Redondeo unitario de XML y estabilidad en GitHub Actions

- **Sin dividir productos en varias líneas:** una venta de 15 Pepsi a ₡700 finales se expresa en un único `LineaDetalle`, `Cantidad=15.000`, `PrecioUnitario=619.46903`, `MontoTotal=9292.03540`, `Impuesto=1207.96460` y `TotalComprobante=10500.00000`.
- **Residuo decimal explícito:** al multiplicar el unitario publicado por 15 aparece ₡0,00005 de diferencia. Este residuo es matemáticamente inevitable cuando la base neta requiere más de cinco decimales por unidad; el XML preserva la base e IVA calculados desde el **total final real**. Un validador nuevo detecta el precio unitario que no corresponde al redondeo exacto y bloquea alteraciones artificiales; una advertencia informa el residuo, sin afirmar aprobación de Hacienda.
- **Sin cambios de dinero ni SQLite:** no se modifican ventas, facturas históricas, inventario, cobros, impuestos ni el motor `BigInt` de precios. No se crean descuentos ni líneas ficticias. **Pendiente:** validación XSD 4.4 y prueba real en ambiente de Hacienda antes de emitir comprobantes.
- **GitHub Actions Windows:** `qa-072-impresion-tras-vuelto.cjs` normaliza `CRLF` y `LF` al leer `src/main.jsx`. Evita un error de coincidencia de texto exclusivo de Windows; no cambia la impresión real.
- **QA nuevo:** `tests/qa-072-precision-xml-unitario.cjs` se ejecuta con `npm test`, y pruebas de sintaxis y regresión de impresión permanecen activas.

## Ajuste puntual de interfaz v0.6.72 · Orden de precios y catálogo de actividades de clientes

- En **Inventario y servicios → Productos y servicios**, **Cómo se ingresa el precio** aparece ahora **antes** de los campos Precio / Costo / Moneda. Continúa seleccionada por defecto la opción **Precio final con IVA incluido**; la etiqueta dinámica, tarifas y la vista previa fiscal conservan su lógica.
- En **Clientes → Registrar / Editar**, al introducir **dos o más caracteres** en el código de actividad económica aparecen sugerencias del **mismo extracto local de Hacienda** que ya usa la ficha de Empresas; también puedes buscar por descripción. Al escoger un resultado solo se copia el código al campo del cliente. Se conserva la escritura manual y los clientes anteriores.
- **Importante:** para un receptor no se muestra el botón **Consultar mis actividades inscritas** de la empresa, porque consulta el RUT del **emisor**, no el del cliente. El catálogo local es un extracto orientativo; no garantiza la inscripción real del receptor ante Hacienda.
- Cambios solo de presentación y reutilización del componente `HaciendaActivityPicker`, **sin migraciones SQLite ni cambios al motor de precisión fiscal, XML 4.4 o al flujo de impresión posterior al vuelto**. El XML continúa siendo un borrador que no se puede emitir ante Hacienda.
- QA añadido: `tests/qa-072-clients-activity-price-order.cjs` incorporado a `npm test` y pruebas de sintaxis.

### Instalación y GitHub

**Antes de reemplazar el proyecto o actualizar la aplicación, crea y comprueba una copia de seguridad de tu archivo SQLite desde Respaldos y consérvala fuera de la carpeta que vas a reemplazar.** Ejecuta en Windows:

```powershell
npm ci
npm test
npm run qa:real-server
npm run dist:win
```

Para publicar en tu rama principal de GitHub **después** de verificar las pruebas:

```powershell
git add -A
git commit -m "fix: v0.6.72 - orden de precios y catalogo de actividades en clientes"
git push origin main
```

Mantener `.gitignore`, `README.md`, `CHANGELOG.md` y `.github/workflows/` en cada entrega. El instalador NSIS debe comprobarse en Windows.


> **ETAPA DE PREPARACIÓN:** FacturaCR sigue generando **borradores XML 4.4 sin validez tributaria**. No firma, asigna clave real, valida formalmente XSD ni envía documentos a Hacienda. Esta versión reestructura el cálculo de las **ventas NUEVAS**; nunca modifica importes históricos.

## Ajuste v0.6.72: perfiles eliminados visibles

En **Usuarios y permisos**, abre **Perfiles eliminados** para consultar perfiles dados de baja. El nombre de inicio de sesión continúa reservado incluso después de eliminar un perfil, porque las ventas y la auditoría conservan su identidad. Un intento de alta con un nombre archivado muestra una explicación y abre el listado. La sección es de solo lectura y respeta los permisos de cada rol. No se eliminan filas ni se reutilizan nombres automáticamente; crea un usuario con un nombre nuevo (por ejemplo, `cajero2`).

## 1. Artículos: dos modalidades de precio

En **Productos y servicios → Crear / Editar**, el campo **Cómo se ingresa el precio** permite:

- **Precio final con IVA incluido (predeterminado)**: introduce el monto que paga el cliente; por ejemplo ₡2.000,00. El motor deriva la base fiscal ₡1.769,91150 y el IVA ₡230,08850 al 13 %.
- **Precio base sin IVA**: introduce ₡1.770,00, se calcula IVA ₡230,10000 y total ₡2.000,10.

Los productos nuevos guardan la modalidad elegida y el **precio original exacto como texto de cinco decimales (`products.price_decimal_5`)** además del campo `price` antiguo para compatibilidad con reportes, catálogos y migraciones. Al editar, el selector se conserva; ya no se fuerza a «IVA incluido». Importaciones históricas sin la columna decimal continúan funcionando mediante el precio numérico anterior. Las actualizaciones masivas mantienen el dato exacto para el nuevo precio.

## 2. Motor fiscal compartido en Ventas, SQLite y XML

- `server/fiscal-precision.js` realiza cálculos monetarios con **BigInt en unidades de 0,00001**, sin `Number` para dividir impuestos o distribuir descuentos. El carrito React y el servidor Express utilizan el mismo motor.
- Los descuentos introducidos como **base imponible sin IVA** se distribuyen mediante restos mayores, de modo que ninguna línea queda negativa ni se asigna de más.
- En `sale_lines` se registra una **fotografía fiscal inmutable** por línea: precio original, modalidad de entrada, unitario neto, subtotal, descuento, base, IVA, total y versión del algoritmo. Todos los importes fiscales se guardan como texto decimal de cinco posiciones; las columnas anteriores de centavos se conservan para caja, reportes y compatibilidad.
- La caja cobra en **centavos de CRC**. En casos de redondeo de cinco decimales a dos, el desglose contable en centavos puede diferir hasta ₡0,01 del redondeo independiente del IVA; el campo fiscal `fiscal_tax_5` **nunca se altera para cuadrarlo**. Las cifras de cinco decimales permanecen exactas en la fotografía y en el borrador XML nuevo.
- El XML de las ventas nuevas utiliza las fotografías fiscales directamente (`BaseImponible`, `Impuesto`, `TotalDesgloseImpuesto`, `TotalComprobante`). Las ventas históricas conservan sus importes originales; si no concilian, el borrador seguirá mostrando el error anterior y no se corregirán silenciosamente.

## 3. Vuelto: confirmación visual después de registrar

En Ventas, cuando se introduce efectivo recibido mayor al importe aplicado, **después de que el servidor confirma la venta** aparece una ventana central destacada **ENTREGAR VUELTO** con el monto en grande, efectivo recibido, importe aplicado y botón **Vuelto entregado · Cerrar**. Si no hay vuelto o la venta no se guarda, no se muestra. El carrito se limpia únicamente tras éxito, como antes. El popup es `alertdialog` y no imprime ni emite un comprobante tributario.

## 4. Enlaces oficiales: funcionan desde Electron

- **Abrir listado de Hacienda** → `https://www.hacienda.go.cr/ClasificacionActividadesEconomicas.html`.
- **Documentación oficial** del buscador CABYS → `https://api.hacienda.go.cr/docs/`.

La ventana Electron sigue impidiendo la navegación externa dentro del proceso protegido. Ahora permite **abrir exclusivamente estos dos destinos HTTPS conocidos en el navegador predeterminado de Windows**, usando `shell.openExternal`. No se habilitan URL arbitrarias ni acceso a archivos locales por vínculos.

## 5. Pruebas y compatibilidad

- Nuevas pruebas: **22 verificaciones de cálculo fiscal**, **11 de interfaz/enlaces** y pruebas reales del flujo API→SQLite→XML para una venta con IVA incluido y otra con precio base.
- La suite `npm test` continúa cubriendo seguridad, compras, inventarios, permisos, históricos, respaldos y comprobantes. No hay migraciones destructivas, solo columnas `NULL` en los históricos.
- **Pendiente de comprobar en Windows:** compilación Vite, instalación NSIS, comportamiento visual final del diálogo y apertura de enlaces en el navegador nativo. Aquí no se dispone del Chromium necesario para ejecutar la comprobación visual.
- **Siguiente etapa:** validación formal contra el XSD oficial de Hacienda, verificación de CABYS y RUT, reglas particulares de exoneraciones, descuentos y otros impuestos; posteriormente firma XAdES-EPES y transmisión. No interpretar esta mejora como precisión tributaria absoluta en todos los escenarios posibles.

**Instalación / QA:** realizar antes un respaldo verificado de SQLite; ejecutar `npm ci`, `npm test`, `npm run qa:real-server` y `npm run dist:win` en Windows. Mantener datos en directorio de usuario, fuera del código del proyecto.

---

## Borrador XML 4.4: estructura corregida, cálculo exacto y avisos fiscales (v0.6.71)

Las versiones anteriores creaban un XML de ensayo a partir de los centavos históricos de Ventas. Ahora la plantilla del borrador incluye encabezado en el orden de los anexos, `BaseImponible`, `ImpuestoAsumidoEmisorFabrica`, `TotalDesgloseImpuesto` y `MedioPago` (de `sale_payments`). Las mercancías y servicios se distinguen por el tipo real del artículo, no por el prefijo de un CAByS de prueba. Se conserva el nombre comercial y la dirección de receptor cuando están disponibles.

**Importante sobre los importes históricos:** Ventas puede haber almacenado redondeos al colón para sostener el precio comercial final con IVA incluido. Esos redondeos no siempre coinciden con `Base imponible × tarifa IVA` a cinco decimales. Por ejemplo, ₡1.770,00 × 13 % = ₡230,10, no ₡230,00. Si una línea presenta esa diferencia, el borrador indica el IVA guardado y el fiscal esperado, y **no permite descargar el XML inconsistente**; no modifica el total del cliente ni los datos históricos. Una etapa posterior deberá almacenar/recuperar también la precisión tributaria del precio bruto y su base, sin estimar arbitrariamente las ventas pasadas.

**Prueba de cuatro mercancías:** bases 1770 + 1770 + 1770 + 3095 = ₡8.405; IVA exacto 230,10 + 230,10 + 230,10 + 402,35 = ₡1.092,65; total de ensayo ₡9.497,65. Si el histórico cobra ₡9.500 con IVA redondeado, la descarga se bloquea y se explica la diferencia. Se debe revisar el precio original y la política IVA incluido/IVA excluido antes de construir una FE real.

**Límites conscientes:** siguen pendientes la validación completa contra el XSD oficial vigente, verificación de la existencia y correspondencia de cada CABYS, numeración real de 20/50 dígitos, firma XAdES-EPES, datos registrales y transmisión a Hacienda. Los ceros fiscales son solamente marcadores de prueba; nadie debe interpretar un XML de esta etapa como comprobante válido. Los códigos de actividad se guardan tal como se ingresaron (`XXXX.X` o seis dígitos) sin inferir inscripción en el RUT. Para obtener documentos oficiales hace falta un proceso nuevo de emisión; no basta con quitar estos avisos.

La operación de borrador es GET y de solo lectura. Los pagos salen de la misma venta/empresa que se está consultando. Ejecutar `npm test` para validar unidad, acceso multiempresa y operación con SQLite.

---

# FacturaCR v0.6.71 — Primer borrador XML de Factura Electrónica 4.4

> **SOLO PRUEBA LOCAL: SIN VALIDEZ FISCAL.** Este generador no asigna claves o consecutivos reales, no consulta el RUT, no valida contra XSD, no firma XML ni envía datos a Hacienda. **Nunca entregar el archivo como factura válida.**

## Seleccionar CABYS desde el catálogo oficial — v0.6.71

En **Productos y servicios → Registrar producto/servicio o Editar**, junto al campo **CABYS (13 dígitos)** encontrarás **Buscar CABYS oficial por descripción o código**.

1. Escribe al menos **3 caracteres** del nombre del bien o servicio (por ejemplo `jugo de tomate`) o introduce **exactamente 13 dígitos** para consultar un código concreto.
2. Tras una pausa de 650 milisegundos, FacturaCR consulta desde el servidor local la API oficial `https://api.hacienda.go.cr/fe/cabys`. La lista muestra código, descripción y, si Hacienda lo informa, impuesto del catálogo. Selecciona el resultado más apropiado; también puedes usar flecha abajo y Enter.
3. El código se copia al campo CABYS del producto que estás creando o editando. **Solo se modifica CABYS**: comprueba manualmente la tarifa IVA, el precio, la unidad y la descripción real de tu producto antes de guardarlo.
4. Si Hacienda no está disponible, aparece un aviso y puedes escribir el CABYS manualmente; la operación no cambia registros de otros productos. Las consultas requieren Internet, pero la información ya guardada funciona sin conexión.
5. Si la búsqueda devuelve varias coincidencias, revisa la clasificación correcta. Un código de 13 dígitos no garantiza por sí solo que esté vigente o sea adecuado al bien: verifica el catálogo al momento de emitir XML 4.4. **Esta versión sigue sin firmar ni transmitir facturas a Hacienda.**

**Protección y rendimiento:** consultas autorizadas con permiso `inventory.manage` y empresa activa; entrada limitada a 80 caracteres, espera de 650 ms, caché temporal de 10 minutos, deduplicación de llamadas idénticas y mensajes para HTTP 429. No requiere modificar SQLite ni añade dependencias. La API pública oficial documenta búsquedas por `q` (mínimo 3 caracteres) y `codigo` (13 dígitos): https://api.hacienda.go.cr/docs/ .

**QA:** ejecutar `npm test`; archivos `tests/qa-071-cabys-catalog.cjs` y `tests/qa-071-cabys-catalog-ui.cjs`. Las pruebas de red usan respuestas simuladas: la API en producción y el ejecutable Windows se validarán separadamente.

---

## v0.6.71 · Ayuda para seleccionar actividad económica CIIU4 (edición de 17/11/2026)

**Empresas → Nueva empresa / Abrir perfil → Actividad económica (RUT)** y la ficha fiscal administrada muestran un buscador por código o descripción.

1. Empieza a escribir el código en **Actividad económica (RUT)** para ver coincidencias del índice de referencia; opcionalmente busca palabras como **programación** en **Buscar actividad por código o descripción**.
2. Selecciona un resultado para copiar exclusivamente el código al campo fiscal; el formato CIIU4 con punto se conserva exactamente, por ejemplo `6201.0`.
3. La búsqueda local es un **EXTRACTO de 221 códigos** de la tabla de correspondencias publicada por el Ministerio de Hacienda, NO el catálogo exhaustivo ni la lista de actividades inscritas del contribuyente. Fuente oficial: https://www.hacienda.go.cr/ClasificacionActividadesEconomicas.html (enlace incluido junto al campo). Un código ausente del extracto no se considera automáticamente inválido.
4. Si la empresa ya está guardada, **Consultar mis actividades inscritas** consulta la API oficial `https://api.hacienda.go.cr/fe/ae?identificacion=...`, usando en el servidor la identificación almacenada para esa empresa. Solo está disponible para el propietario y el administrador con permiso fiscal sobre ella. **No se consulta Hacienda al escribir cada tecla**. Los resultados se almacenan temporalmente en memoria por 10 minutos para respetar los límites oficiales de uso.
5. Si la empresa es nueva, primero guárdala para habilitar la consulta de su inscripción real. Si Hacienda no responde, puedes seguir completando el código manualmente y revisar TRIBU-CR → Mis Datos → Actividades Económicas. Nada de esto autoriza, firma o envía comprobantes.

El índice local no depende de Internet; la consulta a la API de Hacienda sí. El campo conserva cualquier código existente hasta que el usuario lo cambie explícitamente, y **no transforma `4019.0` en un supuesto código nuevo**. Mantener el enlace oficial y verificar la actividad vigente inscrita antes de la emisión final.

**QA adicional:** `tests/qa-071-activity-catalog.cjs` (14 pruebas), `tests/qa-071-activity-catalog-ui.cjs` (10 pruebas) y la copia de módulo para el adaptador de integración; ejecutarlas junto al `npm test` general. Sin cambios de esquema SQLite ni credenciales nuevas.

---

---

## Cómo probar el borrador

1. Configura la ficha fiscal desde **Empresas → Abrir perfil** con tipo y número de identificación, correo, ubicación, dirección exacta y código de actividad RUT exacto **con formato CIIU4 XXXX.X** (por ejemplo `4019.0`; también se conserva formato histórico de seis dígitos).
2. Prepara productos con CAByS de 13 dígitos en el catálogo y un cliente registrado con identificación. La primera etapa admite únicamente **ventas de contado activas en CRC**, con tarifa 0, 1, 2, 4 o 13 por ciento.
3. Entra a **Ventas → Historial → Ver** una venta existente. Pulsa **Borrador FE 4.4 (prueba)**.
4. Si faltan datos, la ventana enumerará por qué no puede crear el XML. No modifica la venta ni inventa los datos fiscales faltantes.
5. Si los datos locales son suficientes, permite revisar y descargar **FacturaCR_BORRADOR_FE44_venta_#.xml**. Contiene clave y consecutivo deliberadamente ficticios de ceros; NO sirven ante Hacienda.

### Alcance y limitaciones

- Los importes se toman de `sales` y `sale_lines` tal como se guardaron, en centavos CRC. No vuelve a calcular el IVA ni modifica el inventario.
- Los CAByS se consultan del catálogo actual; las ventas internas antiguas **no guardan copia histórica del CAByS**, por lo que el XML es solo una demostración.
- La actividad CIIU4 `4019.0` es un código de seis **caracteres** que incluye un punto: se conserva literalmente en `CodigoActividadEmisor`. El programa comprueba el formato, pero todavía **no verifica** que ese código exista o corresponda al emisor en el padrón RUT; no debe utilizarse para emisión real.
- Ventas anuladas, ventas a crédito sin plazo fiscal, clientes no identificados, productos sin CAByS e importes incongruentes se **bloquean con explicación**.
- En 0.6.72 trabajaremos en los XSD oficiales, reglas y catálogos vigentes, sin habilitar emisión real hasta completar firma, clave, consecutivos y API.
- El endpoint `GET /api/companies/:companyId/sales/:saleId/fe/xml-draft` exige el permiso `sales.read_all` de la empresa, utiliza solo consultas de lectura y responde `422` con problemas específicos cuando no puede generar el borrador.

**Fuentes normativas de referencia:**
- Portal oficial, «Anexos y estructuras»: https://atv.hacienda.go.cr/ATV/ComprobanteElectronico/frmAnexosyEstructuras.aspx
- Anexos y estructuras v4.4, Ministerio de Hacienda: https://www.hacienda.go.cr/docs/ANEXOS_Y_ESTRUCTURAS_V4.4.pdf
- Actualización oficial de anexos v4.4 (2026): https://www.hacienda.go.cr/docs/ActualizacionAnexosyEstructurasVersion4.4CEv2.pdf

## Comprobaciones de esta versión

`npm ci` → `npm test` → `npm run qa:real-server` → `npm run dist:win` (compilación Electron/NSIS requiere Windows). QA de XML y UI incorporado a la suite, prueba de integración con base temporal y parseo de XML bien formado.

---

## Corrección v0.6.70 · Errores detallados y formulario fiscal simplificado (13-11-2026)

- En **Empresas → Nueva empresa / Abrir perfil**, las validaciones ahora presentan una lista de **campos concretos con errores**: el texto explica qué corregir, el campo se resalta, y pulsar la indicación lleva el foco directamente a ese campo aun si la ventana requiere desplazarse.
- Los campos de **Sucursal** y **Terminal** se retiran del formulario y de las comprobaciones visibles de preparación. **No se eliminan las columnas SQLite ni se sobrescriben los códigos existentes**: la numeración/sucursal/terminal se abordarán al implementar el generador de comprobantes XML 4.4. La ficha de preparación no significa autorización de Hacienda.
- Se valida tipo de cédula, número, correo, actividad económica RUT (incluye `4019.0`), dirección exacta y consistencia del código postal antes de la confirmación. El servidor devuelve errores específicos y la clave `field` cuando corresponde, incluidos identificaciones duplicadas y fallos de validación.
- El servidor distingue identificación repetida, base ocupada, disco sin espacio y problemas de acceso a SQLite; otros errores técnicos se registran localmente sin revelar SQL al usuario. Guardados transaccionales mantienen datos anteriores en fallos.
- Compatibilidad: no hay cambios de versión ni nuevas migraciones. Se incorporan QA de validación de campos, formulario y pruebas de integración de errores con ambas API de SQLite.

# FacturaCR v0.6.70 — Preparación de Facturación Electrónica 4.4

**Versión vigente: 0.6.70 (13 de noviembre de 2026).** Conserva todas las funciones de 0.6.69 (avisos preventivos de respaldos, monitoreo, restauración segura y operaciones comerciales).

## Ficha fiscal integrada en Nueva empresa y Abrir perfil (corrección de v0.6.70)

Para el **propietario**, la ficha fiscal se completa ahora **dentro de las ventanas Empresas → Nueva empresa y Empresas → Abrir perfil**. Una sola confirmación guarda los datos generales (razón social, identificación, dirección exacta, correo, etc.) y los fiscales (tipo de identificación, actividad económica de hasta seis caracteres, ubicación (sucursal y terminal se conservan internamente)). Se emplea una transacción SQLite: si un dato fiscal es inválido, no se crea ni se modifica parcialmente la empresa.

La ubicación se selecciona **por nombre**: primero provincia, luego cantón y luego distrito. Internamente se conservan códigos de 1, 2 y 2 dígitos para la futura facturación electrónica. El **código postal de cinco dígitos** se calcula automáticamente al seleccionar distrito: provincia + cantón + distrito, por ejemplo `1 + 10 + 01 = 11001`. No se permite guardarlo si contradice la ubicación. El campo **Dirección exacta (otras señas)** admite hasta 160 caracteres, pensado para su futura integración en XML 4.4.

Los nombres de cantones y distritos provienen del catálogo territorial que el sistema ya usa en Clientes: `https://ubicaciones-cr.ryze-cr.workers.dev`. Requiere Internet en la primera consulta de cada ubicación; las respuestas se guardan en caché local para usos posteriores. Si el servicio está inaccesible, los códigos previamente almacenados se conservan y se indica la situación; no se inventan nombres. Corrobora la ubicación con la División Territorial Administrativa vigente antes de emitir.

La sección **Preparación para factura electrónica 4.4**, bajo Empresas, muestra al propietario el **diagnóstico de las 10 comprobaciones**, con un enlace a **Editar perfil y ficha fiscal**, en lugar de duplicar el formulario. El **administrador de empresa** conserva su pantalla independiente para modificar exclusivamente los datos fiscales permitidos por `tax.configure`; no puede editar los datos comerciales ni crear empresas. El cajero y el supervisor no obtienen permisos adicionales.

La nueva columna `postal_code` se agrega de manera **aditiva** a `company_fe_preparation` sin sobrescribir registros históricos. Los datos anteriores de las empresas, las ventas y los respaldos permanecen intactos; las fichas previas recalculan el código postal al guardarse. La creación y edición integradas conservan todos los demás módulos. El sistema aún **no genera ni envía XML a Hacienda**.

### Procedimiento de uso

1. Entra como **Propietario → Empresas → Nueva empresa**, o pulsa **Abrir perfil** en una empresa existente.
2. Completa los datos generales y la **Dirección exacta**.
3. En **Datos fiscales y ubicación de la empresa**, elige el tipo de identificación y la actividad económica inscrita en el RUT.
4. Selecciona **Provincia → Cantón → Distrito** por sus nombres. El **Código postal** aparece automáticamente.
5. Revisa la dirección exacta y el código postal. Sucursal y terminal no se solicitan en esta ventana.
6. Pulsa **Crear empresa** o **Guardar cambios** y confirma. Revisa el diagnóstico de preparación que aparece debajo de las tarjetas.

**Validación:** ejecutar `npm ci`, `npm test`, `npm run qa:real-server` y `npm run dist:win` en Windows; el último paso debe comprobarse en tu instalación. Las pruebas automatizadas incluyen creación, modificación, rollback de validaciones, aislamiento entre empresas, migración, cálculo del código postal y compatibilidad con roles.

## Nueva ficha fiscal por empresa

Desde **Empresas**, el propietario o administrador de empresa autorizado puede completar los datos de preparación para factura electrónica 4.4. Cada empresa conserva sus campos: tipo de identificación, código de actividad inscrito (XXXX.X o histórico de seis dígitos), provincia, cantón y distrito; sucursal y terminal se conservan internamente. Se guardan en SQLite, en la tabla `company_fe_preparation`, sin cambiar las ventas anteriores. Una ficha puede guardarse parcialmente para completar después; se verifican los formatos.

La nueva pantalla muestra **10 comprobaciones locales** que incluyen razón social, identificación, datos fiscales, correo, dirección y cobertura CAByS de los artículos y servicios activos. Indica los artículos cuyo CAByS no tiene 13 dígitos. El acceso **Editar perfil y ficha fiscal** abre el formulario unificado para el propietario; el administrador autorizado conserva su formulario fiscal específico. Los resultados son orientativos: no consultan RUT ni certifican correspondencia de códigos. Las credenciales de Hacienda y el certificado digital **no se solicitan ni se almacenan en esta versión**.

**Importante:** aunque se completen las 10 comprobaciones, FacturaCR **todavía no emite ni valida comprobantes electrónicos ante Hacienda**. En próximas etapas habrá que generar XML 4.4, validarlo con XSD y catálogos, firmarlo con XAdES-EPES, autenticar el envío, consultar su recepción, gestionar estados y notas. Los tiquetes actuales continúan siendo internos.

### Operación y seguridad

- La ficha y su diagnóstico se consultan y guardan en endpoints locales `GET/PUT /api/companies/:id/fe/preparation` con el permiso `tax.configure`, por empresa. Cajeros y supervisores no reciben este permiso.
- Solo cambia el esquema de forma **aditiva**: una nueva tabla vinculada a `companies(id)` y su columna de código postal; no modifica clientes, ventas, movimientos, pagos ni perfiles de acceso. Una restauración de respaldo también migra la tabla como el resto del esquema.
- El catálogo se consulta sin modificar productos ni CAByS. La ficha no genera XML y nunca realiza solicitudes a la API de Hacienda.
- Recomendación: comprobar actividad inscrita, ubicación y códigos oficiales antes de rellenar la ficha. No utilizar números inventados como definitivos.

**Documentación oficial:**
- Anexos y formatos v4.4: https://www.hacienda.go.cr/docs/ANEXOS_Y_ESTRUCTURAS_V4.4.pdf
- API y XSD v4.4: https://atv.hacienda.go.cr/ATV/ComprobanteElectronico/frmAnexosyEstructuras.aspx
- Firma XAdES: https://www.pgrweb.go.cr/DOCS/NORMAS/1/VIGENTE/S/2020-2029/2020-2024/2024/1936C/1701B8.HTML

### QA para Windows / GitHub Actions

```powershell
npm ci
npm test
npm run qa:real-server
npm run dist:win
```

No se reemplaza la información SQLite al instalar. Hacer un respaldo comprobado antes de migrar sigue siendo obligatorio como precaución operativa.

---

# FacturaCR v0.6.69 — Alertas preventivas de respaldos para el propietario

**Versión histórica: 0.6.69 (13 de noviembre de 2026).** Conserva las funciones de v0.6.68, incluido el monitoreo cada 60 segundos **solo dentro de Respaldos**.

## Avisos preventivos en Empresas y Dashboard

- Cuando el propietario entra a **Empresas** o **Dashboard**, FacturaCR consulta **una vez** el diagnóstico ya existente (`GET /api/backups/automatic`) y muestra un aviso discreto únicamente si se detecta una situación que requiere revisión.
- Se avisa cuando la carpeta o unidad no está disponible, el espacio es insuficiente, hubo un error de respaldo, hay una copia programada pendiente o todavía no se creó ninguna copia en el destino activo. Las copias al día y la creación en curso no generan falsas alertas; la desactivación voluntaria de la programación no se trata como error.
- **Revisar respaldos** abre el módulo correspondiente, con acceso al diagnóstico, el historial, «Verificar integridad» y «Ensayar recuperación».
- La consulta **solo ocurre al entrar a Empresas o Dashboard**, sin nuevos intervalos de vigilancia en esos módulos. Al salir, una respuesta tardía no puede actualizar el aviso. Los avisos no incluyen nombres de archivos, ubicaciones privadas ni datos empresariales; el servidor exige sesión propietaria.
- Si falla la consulta, se indica que **no se pudo comprobar** el estado en lugar de mostrar una falsa confirmación de protección. No se modifican SQLite, permisos ni configuraciones de respaldo.

### Validación rápida

1. Inicia sesión como propietario y abre Empresas o Dashboard. Si el destino está en buen estado, no se añade un aviso innecesario.
2. Utiliza una carpeta personalizada en una unidad de pruebas, deja la unidad fuera de línea con FacturaCR en reposo y entra a Empresas: debe aparecer **La carpeta de respaldos no está disponible**. No desconectes nunca unidades durante escritura.
3. Pulsa **Revisar respaldos**, comprueba el diagnóstico y reconecta la unidad. Al regresar a Empresas se consultará de nuevo el estado.
4. Comprueba que supervisores, administradores y cajeros **no ven el aviso** ni realizan consultas al endpoint exclusivo del propietario.
5. Ejecuta `npm ci`, `npm test`, `npm run qa:real-server` y `npm run dist:win` en Windows. GitHub Actions debe validar además NSIS y actualización desde v0.6.34.

---

# FacturaCR v0.6.68 — Monitoreo automático del diagnóstico de respaldos

**Versión vigente: 0.6.68 (13 de noviembre de 2026).** Conserva íntegra la v0.6.67 con historial, integridad, ensayo de recuperación, carpetas personalizadas y programación de día y hora.

## Monitoreo de Respaldos

1. Entra en **Respaldos** desde la cuenta propietaria. FacturaCR comprueba automáticamente la salud de la programación y la unidad de almacenamiento al abrir el módulo.
2. Mientras permanezcas en el módulo, el estado se consulta nuevamente **cada 60 segundos**, siempre que no esté trabajando en otra operación de respaldo y la ventana esté visible. Los intervalos no se ejecutan al navegar a otro módulo. Al volver a la ventana activa se puede efectuar una comprobación inmediata.
3. La pantalla muestra la última hora de consulta. Si falla, conserva el diagnóstico anterior y muestra un aviso, sin declarar falsamente que se actualizó. El botón **Actualizar estado** permite consultar inmediatamente.
4. Si editas el día, la hora o la carpeta y todavía no has pulsado **Guardar configuración**, las consultas automáticas **no borran esos cambios**. La pantalla de diagnóstico refleja siempre la configuración realmente guardada en el servidor.
5. Si acabas de verificar un archivo o ensayar su recuperación, el resultado permanece visible en el historial mientras la lista y la carpeta guardada no hayan cambiado. Los procesos de verificación de integridad, ensayo y restauración no se ejecutan automáticamente.

### Verificación y compilación

```powershell
npm ci
npm test
npm run qa:real-server
npm run dist:win
```

El monitor se implementa en `src/backup-health-monitor.js`, con pruebas en `tests/qa-068-backup-monitor.cjs` y `tests/qa-068-backup-monitor-ui.cjs`. No se modificaron datos SQLite, roles ni cálculos de ventas. (La recuperación SMTP citada históricamente fue retirada en v0.6.88.)

---

# FacturaCR v0.6.67 — Diagnóstico de salud de los respaldos

**Versión vigente: 0.6.67 (13 de noviembre de 2026).** Continúa desde v0.6.66 con el historial de copias simétrico, la verificación de integridad y el ensayo de recuperación. Se conserva SQLite, la configuración por empresa, los permisos y el mecanismo de restauración anterior.

## Novedades de la v0.6.67: diagnóstico y alertas del almacenamiento

En **Respaldos → Copias de seguridad**, arriba de las métricas aparece el panel **Diagnóstico de respaldos**. Consulta la **programación ya guardada** en el servidor y el destino activo; indica si los respaldos están al día, pendientes, desactivados o todavía sin primera copia. También alerta si la carpeta o unidad externa no está disponible, si hay un error reciente o si el espacio libre es inferior al margen estimado para generar una copia segura.

- **Estado y fecha:** calcula la siguiente fecha y hora según frecuencia diaria, día semanal o día mensual. Si se eligió el 29, 30 o 31, aplica el último día de los meses más cortos. Si falta una copia después de la hora programada, la marca como pendiente (la generación automática se realiza cuando FacturaCR está abierto).
- **Última copia y almacenamiento:** muestra tipo de destino (carpeta predeterminada/personalizada), disponibilidad y espacio estimado, sin crear archivos ni cambiar silenciosamente de unidad.
- **Actualizar estado:** vuelve a consultar el servidor, actualiza el espacio y **no descarta cambios aún no guardados** en el formulario de programación.
- **Límites:** el diagnóstico es **solo de programación y disponibilidad**. Que aparezca «al día» **no demuestra que la copia siga íntegra**; utiliza «Verificar integridad» y «Ensayar recuperación» sobre la copia concreta. La comprobación de espacio es una estimación y no sustituye crear un respaldo real.
- **Seguridad y compatibilidad:** el diagnóstico continúa bajo autenticación del propietario, no envía datos a servicios externos, no mueve ni elimina copias y no requiere migración SQLite.

**Cómo comprobarlo en Windows:** abre Respaldos y pulsa «Actualizar estado». Revisa la fecha de la próxima copia, crea una copia manual, verifica que el historial se actualice y prueba una carpeta personalizada disponible. Si utilizas una unidad externa, desconéctala con la aplicación en reposo y confirma que el diagnóstico muestra la indisponibilidad; conéctala de nuevo antes de generar otra copia. **No desconectes unidades durante una escritura.**

**QA nueva:** `tests/qa-067-backup-health.cjs` (17 casos), `tests/qa-067-backup-health-ui.cjs` (8 casos), más tres escenarios en integración HTTP/SQLite temporal. Ejecutar `npm test`, `npm run qa:real-server`, `npm run build` y `npm run dist:win` en Windows. Las últimas dos acciones necesitan dependencias y el instalador de Electron.

---

# FacturaCR v0.6.66 — Ensayo aislado de recuperación de respaldos

**Versión vigente: 0.6.66 (12 de noviembre de 2026).** Continúa desde v0.6.65, sin cambiar las tablas SQLite ni los permisos existentes. Los respaldos automáticos, la selección de carpeta, la verificación de integridad y la restauración con confirmación permanecen disponibles.

### Ajuste de simetría en los botones del historial (v0.6.66)

Los botones **Verificar integridad** y **Ensayar recuperación** comparten ahora el mismo ancho, alto mínimo de 46 px, iconos de 16 px y texto centrado. En filas con espacio suficiente aparecen juntos en una sola línea por botón; cuando la tarjeta es estrecha, ambos se apilan con idénticas dimensiones. Los cambios son exclusivamente visuales y conservan las confirmaciones, permisos, accesibilidad, estado de carga, funciones SQLite y rutas de respaldo. Se incluyeron comprobaciones adicionales en `tests/qa-066-backup-rehearsal-ui.cjs` y pruebas visuales con Chromium en diferentes resoluciones. Es necesario validar finalmente el instalador en Windows.

## Novedades v0.6.66 — Ensayar recuperación sin afectar el negocio

En **Respaldos → Historial de respaldos**, cada copia incluye un nuevo botón **Ensayar recuperación** junto a **Verificar integridad**. Es una comprobación voluntaria reservada al propietario, especialmente útil para copias alojadas en unidades externas o carpetas personalizadas.

1. Abre **Respaldos** y selecciona una copia del historial.
2. Pulsa **Ensayar recuperación**. La aplicación crea una copia temporal en el directorio de datos de FacturaCR, *sin reemplazar* `facturacr.sqlite`.
3. Comprueba íntegramente el clon SQLite, la existencia y compatibilidad de tablas centrales, la apertura en modo lectura/escritura, la activación de WAL y la posibilidad de iniciar y revertir una transacción.
4. Muestra los totales presentes en el respaldo: **empresas, clientes, productos, ventas y proformas**, además de hasta seis nombres de empresas.
5. Cierra SQLite y elimina la carpeta temporal al finalizar o si se produce un error. Si no hay espacio libre suficiente para crear el clon, informa el problema antes de empezar.

**Diferencias importantes:** **Verificar integridad** examina el archivo original en lectura; **Ensayar recuperación** comprueba la apertura y lectura de una copia temporal compatible con la versión instalada. **Ninguna acción garantiza una restauración completa ni prueba reinicio, permisos de Windows, cuentas o funcionamiento comercial posterior**; para ello hace falta una restauración controlada en un entorno de pruebas. Nunca seleccionar un respaldo como si fuera un archivo para migración automática sin revisar las empresas que contiene.

**Seguridad:** el navegador solo envía un nombre de archivo con formato permitido. El servidor resuelve la copia dentro de la carpeta activa, rechaza enlaces simbólicos y rutas arbitrarias, exige una sesión propietaria y bloquea operaciones concurrentes de respaldo mientras dura el ensayo. No se envía información a la nube. Los respaldos originales y la base activa no se modifican.

**Pruebas:** `node --no-warnings tests/qa-066-backup-rehearsal.cjs`, `node tests/qa-066-backup-rehearsal-ui.cjs`, `npm test`. QA local utiliza SQLite temporal mediante Node.js; es necesario validar el instalador con `npm run qa:real-server`, `npm run dist:win` y GitHub Actions Windows.

---

# FacturaCR v0.6.65 — Verificación de respaldos históricos y gestión segura

**Versión vigente: 0.6.65 (11 de noviembre de 2026).** Basada en el ZIP completo de v0.6.64 corregido, con respaldos en carpetas personalizadas, controles de seguridad, correcciones visuales y QA. Se conserva la arquitectura React, Electron, Express y SQLite, sin migraciones de tablas.

## Novedades v0.6.65 — Comprobar respaldos históricos

En **Respaldos → Historial de respaldos**, el propietario puede pulsar **Verificar integridad** en cualquiera de las copias guardadas en la carpeta activa. FacturaCR abre ese archivo **solo para lectura**, ejecuta la prueba completa de integridad de SQLite y confirma que existan las tablas básicas del sistema. Muestra tamaño y fecha de verificación si pasa, o una advertencia si está corrupto/no accesible. No restaura datos, no edita SQLite y no elimina ninguna copia. Al actualizar el historial o cambiar de carpeta se descartan los resultados viejos.

No confundas **integridad SQLite** con restauración completa: se recomienda ensayar una restauración únicamente en un ambiente de prueba y mantener copias adicionales fuera del mismo equipo. Una unidad externa desconectada aparecerá como no disponible. La verificación está reservada al propietario por el control de autorizaciones vigente; no se aceptan rutas libres enviadas desde el navegador.

## Novedades v0.6.64 — Elegir dónde guardar los respaldos

En **Respaldos → Programación automática → Ubicación de los respaldos**:

1. **Carpeta predeterminada:** marcada inicialmente. Las copias se crean donde siempre, dentro de los datos locales de FacturaCR, en `automatic-backups`. Las instalaciones anteriores permanecen en esta opción automáticamente.
2. **Carpeta personalizada:** selecciona la opción y pulsa **Elegir carpeta…**. Windows abrirá el explorador nativo para escoger una carpeta existente o crear una nueva. Es útil para un disco externo, una carpeta en Documentos o una unidad adicional. La ruta se muestra antes de confirmar.
3. Pulsa **Guardar configuración**. **Hasta guardar, la carpeta actualmente en uso no cambia.** La configuración se persiste en `automatic-backup-settings.json`, no en la base comercial SQLite.
4. **Crear respaldo ahora** y la programación diaria/semanal/mensual utilizan el directorio activo. Los respaldos se generan con el respaldo en línea de SQLite y se verifica la integridad de cada copia.
5. **Abrir carpeta actual** abre el destino activo (no el destino pendiente). El historial muestra solo los archivos del destino activo. La retención elimina únicamente archivos antiguos de FacturaCR en ese destino y según el límite establecido.
6. Para **volver a la ruta original**, marca **Carpeta predeterminada** y pulsa **Guardar configuración**. Las copias existentes en la ubicación anterior **no se mueven ni se borran**.

**Seguridad y comportamiento ante errores:** solo el propietario puede cambiar esta configuración, por la autorización vigente de la API. El destino personalizado debe ser una carpeta absoluta, existente y escribible; el servidor prueba la escritura antes de aceptar el cambio. No permite seleccionar el directorio de la base SQLite ni sus carpetas superiores o inferiores. Si una unidad externa se desconecta, **no guarda silenciosamente en otro sitio**: reporta el problema y sigue mostrando la ruta configurada. Conecta la unidad o vuelve a escoger la ruta predeterminada. Consulta el espacio libre en el destino desde el panel.

**Importante:** el botón **Descargar copia SQLite** sigue ofreciendo una descarga manual independiente; la opción de ubicación configurable corresponde a **Crear respaldo ahora** y los **respaldos automáticos**. No sustituye una estrategia de copias externas ni garantiza que un disco USB esté conectado. Las carpetas escogidas deben poder escribirse desde la cuenta Windows que ejecuta FacturaCR.

## Novedades v0.6.64 — Empresas sin acción duplicada

En las tarjetas de **Empresas** queda un solo botón **Abrir perfil**; se quitó **Editar**, que abría exactamente el mismo formulario. El propietario sigue pudiendo modificar y guardar los datos desde **Abrir perfil**. La administración de usuarios, empresas y sus permisos no cambió. El botón de eliminar empresas permanece deshabilitado, como en v0.6.63.

## Verificación de la versión

```powershell
npm ci
npm test
npm run qa:real-server
npm run dist:win
```

`npm test` contiene pruebas de ruta personalizada, escritura y validación en archivos temporales, persistencia de configuración, copia SQLite y retorno al directorio predeterminado. Las pruebas de integración usan un adaptador de SQLite exclusivamente para QA; hay que validar de nuevo el instalador y el cuadro nativo de selección de carpetas en Windows/GitHub Actions. Antes de actualizar, crea un respaldo verificable de la base activa. Los archivos de datos del usuario no deben sobrescribirse con el ZIP de código. (El SMTP fue retirado en v0.6.88.)

## Manual de capacitación

Existe una **edición piloto de 46 páginas**, cuyo diseño se conservará para ampliarla más adelante, cuando se estabilicen próximas funcionalidades. No forma parte de esta entrega técnica del código.

---

## Estilo unificado de menús y ventanas emergentes — actualización v0.6.63

**Corrección de flechas (v0.6.63):** los desplegables de Seguridad, usuarios y los otros módulos usan una sola flecha verde SVG fijada al borde derecho, sin la flecha interna de `base-select` que podía quedar debajo del texto en Electron. La lista abierta conserva el estilo y la navegación por teclado. Verificar con `node tests/qa-063-estilos-interactivos.cjs` y, al actualizar en Windows, abrir los selectores de «Tiempo para todos los usuarios», «Cuenta que deseas recuperar» y los filtros de Kardex.

Todos los módulos comparten la identidad visual de FacturaCR en **selectores, menús de usuario y empresas, opciones avanzadas y ventanas de confirmación**: verde institucional, bordes suaves, sombreado, espaciado, hover, foco visible y adaptación a ventanas estrechas.

- Las confirmaciones de **retirar un acceso, registrar un movimiento de inventario, recuperar otra cuenta, reemplazar el código de emergencia y eliminar el SMTP (opción histórica retirada en v0.6.88)** ya no utilizan `window.confirm`. Ahora usan un diálogo React reutilizable con **Cancelar** y una acción explícita; presionar Escape o cancelar **no ejecuta** la operación.
- Los `<select>` existentes conservan sus opciones, validación, selección por teclado y llamadas `onChange`; en Chromium/Electron compatible, las listas abiertas muestran colores, selección y sombras de FacturaCR mediante `appearance: base-select`. Otros motores mantienen un menú nativo accesible.
- Los formularios emergentes de empresas, eliminación de cuentas, eliminación de proformas, vista previa de tiquetes y menús propios comparten el mismo estilo. Los controles del sistema operativo como el explorador de archivos o el diálogo de impresora **conservan la interfaz de Windows**, ya que no se pueden rediseñar completamente mediante CSS de React.
- Pruebas: `node tests/qa-063-estilos-interactivos.cjs` y `npm test`. La prueba visual independiente en Chromium verificó un selector abierto y cerrado, navegación por teclado, opciones avanzadas y adaptación a 480 y 1440 px. **Aún se debe validar el ejecutable Electron/Windows y GitHub Actions.** No se modificó SQLite ni la lógica de ventas, respaldos o permisos.

## Ventas y respaldos automáticos — mejora v0.6.63

**Ventas → Cobro:** los campos *Efectivo recibido* y *Montos de pagos combinados* ya no cambian cuando se desplaza la rueda del mouse sobre un campo enfocado. La interfaz quita el foco en ese instante para permitir el desplazamiento normal; los centavos escritos voluntariamente siguen admitidos y el cálculo se mantiene inalterado.

**Respaldos → Programación automática:**
- **Diario:** elegir la hora local.
- **Semanal:** elegir un día de lunes a domingo y la hora local.
- **Mensual:** elegir el día del 1 al 31 y la hora local. Para fechas inexistentes, como el 31 de febrero, se utiliza el último día del mes.
- **Conservar últimas copias:** sigue limitando la cantidad de archivos guardados (1–365). El botón **Crear respaldo ahora**, con icono de respaldo, genera una copia inmediata incluso si los respaldos automáticos están desactivados.

Selecciona el día y pulsa **Guardar configuración**. Los nuevos ajustes se guardan en `automatic-backup-settings.json`, fuera de SQLite y del repositorio. La API comprueba rangos y mantiene compatibilidad con configuraciones antiguas (lunes/día 1). La ejecución automática requiere FacturaCR abierto y, si el programa se cerró después de la hora programada, al reabrirlo se comprueba si corresponde una copia pendiente. No se crean tareas de Windows. **La programación guardada se ejecuta según la hora local del equipo.**

Pruebas del calendario: `node tests/qa-backup-schedule.cjs`; suite completa: `npm test`; comprobación real de Express/SQLite: `npm run qa:real-server`; instalador: `npm run dist:win`. Antes de actualizar, respalda los datos. La actualización no modifica el esquema SQLite ni las tablas comerciales.

## Corrección del QA estático para GitHub Actions Windows — v0.6.63

- Si el job `npm test` muestra `ENOENT` con una ruta como `D:\D:\a\...\src\main.jsx`, el fallo proviene del uso anterior de una URL `file://` para leer archivos fuente en `tests/qa-063-layout.cjs`; no significa que falte `src/main.jsx`.
- La prueba usa ahora `path.resolve(__dirname, '..', 'src', 'main.jsx')` y la misma estrategia para `src/style.css`, sin duplicar la letra de unidad de Windows. Incluye validaciones para rutas Windows y Linux.
- Compruébalo con `npm run qa:static` y `npm test`. Tras subir los cambios, confirma que el workflow de GitHub Actions Windows finalice correctamente. No hay migración SQLite ni cambios funcionales en la interfaz.

## Distribución general y simetría visual — corrección v0.6.63

- Seguridad y bloqueo: los cinco apartados comparten márgenes y proporciones de columnas, se expanden para aprovechar el ancho real de pantalla y se apilan cuando no hay espacio suficiente.
- Todos los módulos (Dashboard, Auditoría, Usuarios, Inventario, Kardex, Caja, Empresas, Ventas y Cotizaciones) emplean un área principal fluida y centrada. El ancho máximo de lectura es 2200 px en monitores ultrapanorámicos; en resoluciones normales se aprovecha el espacio disponible.
- En escritorio, la barra de sesión se mantiene arriba y el menú lateral está anclado **dentro del área de trabajo**. Al desplegar Seguridad, el menú ya no tapa sus formularios. Tablas extensas conservan su desplazamiento horizontal independiente.
- Las columnas de los módulos principales dependen del ancho **útil** disponible, no solo del ancho total de la ventana. No cambia ningún permiso, registro, operación o tabla SQLite.
- Verificación visual de referencia: Chromium a 375, 480, 768, 1024, 1366, 1600, 1920 y 2560 píxeles. La validación final del ejecutable real corresponde a Windows y GitHub Actions.

## Corrección de inventario y auditoría de v0.6.63

- **Cajeros:** utilizar **Kardex · Movimientos** (no «Ingresos / Tomas físicas»). Elegir empresa, artículo, entrada o ajuste de existencias, cantidad y motivo; revisar la variación y confirmar. Después, comprobar la tabla de historial. **Actualizar inventario y movimientos** realiza una consulta real de los dos datos y muestra una confirmación. El cajero puede filtrar el historial y exportarlo a CSV/Guardar PDF, siempre **sin costos ni valoración**. Las salidas arbitrarias y los precios/costos siguen bloqueados. Supervisores/administradores autorizados conservan el Kardex completo.
- **Propietario:** entrar en **Auditoría del propietario** y aplicar filtros por evento, usuario, empresa y fecha. La tabla muestra descripciones entendibles. **Exportar página CSV** genera UTF-16 LE BOM para Excel Windows; **Guardar página PDF** utiliza Electron y produce un informe A4 horizontal con cabecera, filtros, totales y hasta 50 eventos de la página actual. Para exportar páginas adicionales, cambiar de página y repetir. La exportación PDF requiere abrir FacturaCR en su aplicación de escritorio.
- **Codificación:** el CSV tiene BOM UTF-16 LE y la indicación `sep=;`. Al abrirlo directamente en Microsoft Excel de Windows deben visualizarse `Café`, `Inicio de sesión`, `Conteo físico`, `Ñandú` y los demás caracteres sin `Ã` ni `â€`.
- **QA:** `npm test` incorpora 12 comprobaciones para reportes sin costos, CSV Excel, interpretación de eventos, sanitización del PDF y presencia del botón funcional. El PDF de ejemplo se verificó visualmente en A4 horizontal mediante un motor alternativo; debe comprobarse el guardado real con Electron en Windows y GitHub Actions.
- **Compatibilidad:** es una corrección de v0.6.63, sin cambio de esquema SQLite. Respaldar la base antes de actualizar. Se conservaron entonces la autenticación y permisos anteriores, ventas, caja, inventario, respaldos y QA Windows; la recuperación SMTP fue retirada más adelante en v0.6.88.

## Historial v0.6.61–v0.6.63 — Correo/SMTP (retirado en v0.6.88)

Esta sección se conserva solamente para explicar el origen histórico del sistema. **Desde v0.6.88 no existen la configuración SMTP, la verificación individual de correo ni el restablecimiento por email.** No seguir los procedimientos antiguos de Gmail/SMTP: fueron reemplazados por los códigos FCR2 y el kit de dos partes del propietario descritos al comienzo del documento. Las modificaciones históricas de estas versiones se mantienen en `CHANGELOG.md`.

## Comprobaciones de la versión

```powershell
npm ci
npm test
npm run qa:real-server
npm run dist:win
```

GitHub Actions ejecuta las pruebas automáticas y la migración histórica **v0.6.34 → v0.6.61**. El SMTP remoto y el instalador real de esta versión quedan sujetos a validación posterior: no se consideran aprobados hasta ejecutarlos con un correo emisor y un runner Windows, respectivamente.

---

## Historial consolidado

# FacturaCR v0.6.60 — Recuperación segura del propietario y consolidación de permisos

**Versión vigente: 0.6.60 (9 de noviembre de 2026).** Esta actualización parte de la v0.6.59 con QA Windows aprobado según el resultado reportado y conserva módulos comerciales, SQLite e instalador NSIS.

## Nuevo en v0.6.60 — Código de recuperación del propietario

- **Instalación nueva:** al configurar la cuenta propietaria se entrega un código aleatorio de recuperación `FCR1-...` de **192 bits**. La interfaz muestra el código una sola vez; cópialo o transcríbelo en un lugar privado **fuera del equipo**. La aplicación solo guarda su **hash SHA-256**, nunca el código visible.
- **Instalación que se actualiza desde v0.6.59:** no se genera silenciosamente un código. El propietario debe iniciar sesión y entrar en **Mi sesión → Seguridad y bloqueo → Recuperación del propietario**, introducir su contraseña vigente y pulsar **Crear código de recuperación**. También puede reemplazar un código anterior; el anterior deja de servir de inmediato.
- **Si olvida la contraseña:** desde la pantalla de acceso puede abrir **¿Olvidaste la contraseña del propietario?**, introducir el usuario propietario, el código privado y una contraseña nueva de al menos 12 caracteres con letras y números. El servidor verifica el hash, cambia la contraseña en transacción SQLite, invalida todas las sesiones antiguas, consume el código y entrega **uno nuevo que debe guardarse**. El proceso queda en la auditoría sin registrar el código.
- **Seguridad:** recuperación restringida a la cuenta propietaria, intentos fallidos limitados, respuestas genéricas para códigos/usuarios incorrectos, rutas protegidas por validación de origen local y sin cuentas universales ni contraseñas maestras. Los cajeros y administradores de empresa **no pueden recuperar la cuenta propietaria**; sus contraseñas temporales siguen gestionándose mediante usuarios autorizados.
- **Límite importante:** si el propietario pierde **la contraseña y el código**, no existe recuperación automática o clave secreta de soporte. Los respaldos de SQLite tampoco revelan el código. Guarda el código en un lugar seguro y restringe su acceso.
- **Migración de SQLite:** se incorpora exclusivamente la tabla `access_owner_recovery`; es una migración aditiva y repetible. No se cambian ni eliminan registros de empresas, ventas, carritos, caja o usuarios anteriores. Respaldar SQLite antes de actualizar.
- **QA:** 16 casos nuevos de recuperación en `tests/qa-recuperacion-propietario.cjs` incorporados a `npm test`, prueba de migración del esquema y casos adicionales para HTTP real cuando se instalan Express y `better-sqlite3`. Las 45 pruebas de integración local se conservan.
- **Validación:** `npm test` y comprobación sintáctica de los siete componentes JSX pasaron en este entorno. La compilación Vite y la ejecución nativa Windows deben verificarse de nuevo en GitHub Actions para **v0.6.60**.

### Flujo recomendado en un negocio ya instalado

1. Crear y verificar un respaldo de la base de datos SQLite de FacturaCR v0.6.59.
2. Actualizar a v0.6.60 e iniciar sesión como propietario.
3. Ir a **Mi sesión → Seguridad y bloqueo**, generar el código confirmando la contraseña vigente.
4. Guardar el código de recuperación en un lugar privado distinto del equipo donde funciona FacturaCR.
5. Continuar las operaciones normalmente. No es necesario modificar las cuentas del personal ni reconfigurar el bloqueo global de 15 minutos (o el valor ya guardado).

---

## Archivo histórico: v0.6.59

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


## v0.6.63 — Delegación, perfiles, inventario de caja y auditoría

- **Perfiles:** propietario y administradores de empresa pueden dar de baja cuentas subordinadas. La eliminación es lógica (conserva identificadores, ventas y auditoría), exige nombre de usuario y contraseña actual; nunca permite eliminar al propietario. El nombre de acceso permanece reservado para preservar trazabilidad.
- **Supervisores:** solo si el propietario activa «Permitir administrar cajeros» para una empresa, pueden crear, suspender y reactivar cajeros de esa empresa. El permiso se revoca sin cambiar otros roles, y se invalidan sesiones del supervisor tras modificar la delegación.
- **Inventario del cajero:** nueva sección «Ingresos / Tomas físicas», basada en las operaciones del Kardex. Solo se permiten entradas y ajustes a saldo físico; no salidas manuales, costos o cambio de precios. El servidor valida empresa, tipo, existencias y registra los movimientos.
- **Auditoría del propietario:** consulta paginada con filtros por usuario, empresa, categoría y fecha, más exportación CSV de la página visible. Registra login, logout, cambios de usuarios y operaciones comerciales exitosas. No incluye contraseñas ni tokens. Historial anterior a esta versión solo contiene los eventos que ya se registraban; no se reconstruyen actividades inexistentes.
- **Interfaz:** barra de sesión anclada arriba y navegación lateral independiente en escritorio, sin desplazamiento al abrir Seguridad o mostrar errores del correo. La configuración «Seguridad y bloqueo» ahora es parte del contenido de `<main>`; al desplegarla no desplaza la barra lateral ni ocupa una franja superior que empuje la navegación. El cambio es de interfaz y no modifica SQLite.
- **Correo futuro:** evaluar un proveedor transaccional HTTPS con dominio verificado (p. ej., Resend) frente a OAuth 2.0 Gmail para reemplazar el uso de contraseñas de aplicación, manteniendo secretos cifrados y envío local. No está integrado en esta versión.

Las pruebas locales y workflows se ejecutan como antes: `npm test`, `npm run qa:real-server`, `npm run dist:win`. Hacer respaldo antes de actualizar. La migración agrega `access_users.is_deleted` y un índice de auditoría sin borrar registros.


### Ajuste visual de las opciones de ubicación de respaldos

Las tarjetas «Carpeta predeterminada» y «Carpeta personalizada» se adaptan al ancho disponible sin salirse ni desplazar el radio. El cambio es únicamente visual; el destino seleccionado se guarda con «Guardar configuración», y el botón «Elegir carpeta…» sigue usando el explorador nativo de Windows.


### v0.6.70 — Corrección de identificación y actividad económica en Empresas

La ventana **Nueva empresa / Abrir perfil** reúne **Tipo de identificación** y **Número de identificación** en una misma sección, con ambos campos obligatorios para perfiles que registran su ficha fiscal. El formulario adapta el patrón de entrada, longitud máxima, texto orientativo y validación de HTML al tipo elegido. En el servidor también se valida, para impedir que una solicitud directa omita las reglas o altere parcialmente una empresa.

| Tipo | Validación local de formato |
| --- | --- |
| 01 · Cédula física | 9 dígitos sin cero inicial ni guiones |
| 02 · Cédula jurídica | 10 dígitos, sin guiones |
| 03 · DIMEX | 11 o 12 dígitos, sin cero inicial ni guiones |
| 04 · NITE | 10 dígitos, sin guiones |
| 05 · Extranjero no domiciliado | Hasta 20 caracteres alfanuméricos; aplicabilidad restringida según el comprobante |

**Actividad económica (RUT):** se admite el formato `4019.0` y, por compatibilidad, códigos de seis dígitos. El generador conserva el texto `4019.0` exactamente, sin quitar el punto ni convertirlo a `401900`. Este formato no certifica que la actividad corresponda a la empresa: el XML 4.4 utiliza `CodigoActividadEmisor` de hasta seis caracteres, incluido el punto de códigos CIIU4, y requiere validar el padrón real antes de emitir. La ficha sigue siendo preparatoria y no firma, genera ni envía comprobantes.

**Compatibilidad:** las empresas históricas conservan sus datos en SQLite; al editar una ficha anterior sin tipo de identificación, se deberá seleccionar uno válido. La API sin ficha fiscal mantiene la compatibilidad de solicitudes comerciales antiguas con identificaciones numéricas de 9 a 12 dígitos. Las solicitudes que incluyen tipo fiscal se validan estrictamente. Las rutas de crear/editar siguen siendo transaccionales y el administrador de empresa no puede asignar un tipo incompatible con el número existente.

QA añadido: 11 pruebas de identificación por tipo, cinco controles nuevos de interfaz, cuatro pruebas de integración para alta/edición y restricción del administrador. `npm test` y 66/66 pruebas de integración superadas. Comprobación visual en Chromium a 375, 480, 768, 1100 y 1440 px. La ejecución del instalador Electron/Windows sigue pendiente.

Fuente normativa: Anexo técnico de comprobantes electrónicos 4.4, Ministerio de Hacienda / PGR, `https://www.hacienda.go.cr/docs/ANEXOS_Y_ESTRUCTURAS_V4.4.pdf`.


### Ajuste visual de dirección en Empresas (v0.6.70)

En **Nueva empresa** y **Abrir perfil / Editar empresa**, el campo **Dirección exacta (otras señas)** ahora aparece inmediatamente después de los selectores territoriales de **Provincia, Cantón y Distrito**, junto al **Código postal** calculado. Queda dentro del mismo bloque **Datos fiscales y ubicación de la empresa**. La validación de 160 caracteres, los errores vinculados al campo y el almacenamiento `address` se mantienen sin cambios. No es necesario modificar SQLite.


### Ajuste puntual de impresión tras entregar vuelto (v0.6.72, sin nueva versión)

Al registrar una venta con vuelto, se muestra primero **ENTREGAR VUELTO**. Si la empresa tiene activada **Imprimir automáticamente**, la impresión se inicia únicamente después de pulsar **Vuelto entregado · Cerrar** y de que React retire la ventana. El cierre consume la solicitud pendiente una sola vez. Si no hay vuelto y la impresión automática está activa, el tiquete se imprime al registrar la venta como antes. Si la impresión automática está desactivada, cerrar la ventana no imprime.

La venta y el inventario quedan guardados antes de esta acción; un error o cancelación de impresión no anula la venta. Se mantiene la vista previa, la reimpresión del historial, la configuración de impresoras y las opciones de impresión. Prueba QA: `node tests/qa-072-impresion-tras-vuelto.cjs` (incluida en `npm run qa:static`).


### Ajuste visual v0.6.72 — Usuarios y fuentes CABYS

Los accesos de empresa se muestran como un grupo de botones alineados; el cambio de rol y las acciones de cuenta se presentan en una barra adaptable para pantallas pequeñas. En el buscador CABYS, **Buscar en Hacienda** abre el buscador oficial y **Catálogo BCCR (Excel)** abre/descarga el archivo publicado por el Banco Central. Si la descarga externa no se encuentra disponible, se puede consultar CABYS directamente desde Hacienda. Ninguno de estos vínculos valida por sí mismo la tarifa fiscal. No hay migración SQLite.

La aplicación Electron abre únicamente las direcciones oficiales de CABYS permitidas explícitamente en el navegador externo, sin habilitar otras ventanas o enlaces arbitrarios.


### v0.6.88 — Recuperación local implementada

El sistema ahora utiliza exclusivamente tres códigos FCR2 de un solo uso por persona y un kit extraordinario de dos partes para el propietario. Consulta el procedimiento actualizado al **inicio del README**. La recuperación mediante correo y SMTP fue retirada de la aplicación. **Próxima prioridad:** XSD oficiales FE/TE 4.4 y las validaciones de Hacienda.


### Corrección v0.6.93 · Cotejo CPF en certificado

El certificado de persona física puede identificar al titular como `CPF-0P-XXXX-XXXX`, mientras que la ficha fiscal de FacturaCR guarda la cédula física con 9 dígitos (`PXXXXXXXX`). El cotejo local ahora convierte **exclusivamente** ese formato CPF para evitar diferencias falsas por el cero de relleno de la provincia. El cotejo no equipara automáticamente una persona física con una empresa jurídica, ni verifica representación, revocación, cadena de confianza o permisos para emitir.

**Cómo probar:** `npm run qa:certificate-company`. Con un certificado propio, revisar en **Empresas → Preparación FE 4.4 → Certificado digital** el resultado después de confirmar la identificación de la empresa; nunca compartir archivo `.p12` ni contraseña para diagnóstico. Si persiste «Identificaciones diferentes», revisar el tipo y número fiscal real de la empresa, y si el firmante representa a una persona jurídica.
