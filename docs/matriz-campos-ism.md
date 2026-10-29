# Registros ISM · Inventario de funciones y matriz de campos de R-14, R-16, R-23 y R-28

Treasure of Galápagos · Compañía "Terán & Sevilla Turismo TESETURIS Cía. Ltda." · App "Registros ISM" (https://registros.teseturis.app)

Entregable 1 de la "Solicitud de rediseño del prototipo existente" (27-oct-2026), punto 13: inventario de funciones actuales y matriz de campos, validaciones, firmas y PDF de R-14, R-16, R-23 y R-28, con los formatos vigentes y las decisiones pendientes con el responsable del SGS.

Fecha del documento: 29-oct-2026.

Fuentes usadas:

- Definiciones de campos extraídas de los PDF oficiales: `treasure-backapp/assets/ism/defs/R-14.json`, `R-16.json`, `R-23.json`, `R-28.json` (nombre del campo PDF, página, posición normalizada, tipo, valor precargado y etapa de firma).
- Imágenes de las hojas oficiales: `treasure-registros-frontapp/public/forms/R-14-1.jpg`, `R-16-1.jpg`, `R-23-1.jpg`, `R-28-1.jpg` a `R-28-4.jpg`. Cada campo se ubicó cruzando su coordenada `y` (multiplicada por el alto de la imagen) con la fila impresa y su coordenada `x` con la columna.
- Esquema guiado de R-14: `treasure-backapp/assets/ism/schemas/R-14.v1.json`.
- Código del backend (`treasure-backapp/src`) y del frontend (`treasure-registros-frontapp/src`) al 29-oct-2026.

## Formatos vigentes revisados

Los cuatro formatos tienen el mismo encabezado del Manual de Gestión de Seguridad. Datos leídos en las imágenes de la plantilla que usa el sistema:

| Código | Título oficial (tal como aparece en la hoja) | Edición | Vigencia | Elaborado / Aprobado | Páginas y orientación | Campos PDF |
|---|---|---|---|---|---|---|
| R-14 | R-14 Lista de chequeo previo al zarpe y rondas de seguridad | 00 | 01-05-2025 | P.J.P / J.T.O | 1 página vertical | 65: 3 de texto, 60 casillas, 2 firmas |
| R-16 | R-16 Registro de mantenimiento preventivo de cubierta y máquinas | 00 | 01-05-2025 | P.J.P / J.T.O | 1 página horizontal | 139: 45 de texto, 91 casillas, 3 firmas |
| R-23 | R-23 Registro de horas de descanso de la tripulación | 00 | 01-05-2025 | P.J.P / J.T.O | 1 página horizontal | 850: 125 de texto, 722 casillas, 3 firmas |
| R-28 | R-28 Control mensual de equipos de seguridad y contra incendio | 00 | 01/05/2025 | P.J.P / J.T.O | 4 páginas verticales | 348: 231 de texto, 114 casillas, 3 firmas |

El responsable del SGS debe confirmar que estas ediciones son las vigentes (ver decisión D-00). Si alguna cambió, se cambia la plantilla PDF en `assets/ism/templates`, se regeneran las definiciones con `tools/ism/extract.py` y `build.py`, y se sube la versión del esquema. Los registros ya archivados conservan la versión con la que se hicieron.

---

## 1. Inventario de funciones actuales del prototipo

Rutas de archivo: los del backend están en `treasure-backapp/` y los del frontend en `treasure-registros-frontapp/`.

Estados usados en la tabla:

- **Operativo**: funciona y se conserva.
- **Operativo con limitaciones**: funciona, pero tiene una falla o un hueco conocido (se describe).
- **En cambio**: se está modificando en esta entrega (ver 1.1).

| # | Función | Qué hace hoy | Dónde vive | Estado |
|---|---|---|---|---|
| F-01 | Inicio de sesión | Correo y contraseña, token JWT guardado en la tablet. `GET /auth/me` restaura la sesión al abrir la app | Front: `src/views/LoginView.vue`, `src/stores/user.ts`, `src/services/httpBase.ts`, `src/main.ts`. Back: `src/controllers/auth.controller.ts`, `src/middlewares/auth.middleware.ts` | En cambio. Hoy `restore()` borra el token ante **cualquier** error de `/auth/me` (también sin señal o con un error 500). Eso explica lo observado en la revisión: al abrir un registro existente, la plataforma volvió al acceso |
| F-02 | Roles | `tripulante`, `capitan`, `designada` (Persona Designada), `admin`; los roles del bar (`direccion`, `bartender`, `bodega`) también pueden llenar registros. Ven todos los registros `admin`, `capitan` y `designada`; los demás solo ven los suyos (los que crearon o firmaron) | Back: `src/utils/roles.ts`, `src/routes/index.ts` (constante `CREW`), `src/controllers/ism.controller.ts` (`canSignStage`, `canEdit`, `assertCanView`). Front: `src/stores/user.ts` | Operativo con limitaciones. Las firmas se asignan por rol, no por persona ni por formato. El rol `duena` está en cambio (1.1) |
| F-03 | Catálogo y buscador | Lista los 29 formatos agrupados por categoría (Tripulación, Operación, Seguridad, Mantenimiento, Comités y gestión) con su código. El buscador ignora tildes y busca en código, título y grupo. Texto visible: "Elige el formato oficial. Se abre igual que el papel, listo para llenar y firmar." | Front: `src/views/NewRecordView.vue`, `src/stores/catalog.ts`. Back: `GET /ism/catalog` (`catalog.json`, `equipment.json`, cargos) | Operativo. Se conserva para quien ya conoce los códigos |
| F-04 | Creación por formato | Ventana previa con fecha del registro (hoy en Galápagos por defecto), equipo (solo R-16, 73 equipos de `equipment.json`) y cargo (formatos "por cargo": R-07, R-22 y R-23). Crea el borrador, copia los valores precargados de la definición, llena los datos del equipo y asocia el crucero que está a bordo. Nombre de archivo `R-xx_AAAAMMDD_HHMM_<cargo o equipo>.pdf` | Front: `src/views/NewRecordView.vue`. Back: `POST /ism/records` (`createRecord`), `buildFileName` en `src/services/ism.service.ts` | En cambio: clave de idempotencia y quitar valores precargados indebidos (1.1) |
| F-05 | Llenado sobre la hoja oficial | Muestra la imagen de la hoja y superpone cada campo (texto, casilla, firma, foto) en su posición exacta, con zoom | Front: `src/components/registros/FormCanvas.vue`, `src/views/RecordView.vue`, `public/forms/*.jpg`. Back: `GET /ism/forms/:code` | Operativo. Es el enfoque que la solicitud pide sustituir por captura guiada. Se mantiene para los formatos que todavía no tienen flujo guiado |
| F-06 | Autoguardado | Guarda los cambios 0,9 s después de la última edición (`PATCH /ism/records/:id`). Sin señal, guarda en la tablet (`localStorage`) y reintenta cada 15 s o al volver la conexión. Muestra "Guardando…", "Guardado HH:MM", "Sin conexión: guardado en la tablet" o "No se pudo guardar". El servidor solo acepta nombres de campo de la definición, convierte casillas a verdadero o falso, limita el texto a 5000 caracteres y detecta ediciones simultáneas (respuesta 409) | Front: `src/composables/useAutosave.ts`. Back: `saveData` en `ism.controller.ts`, `optimisticConcurrency` en `src/models/ismRecord.model.ts` | En cambio. Si el servidor responde con error (no por falta de red), el lote pendiente se descarta sin guardarse en la tablet |
| F-07 | Firmas con el dedo por etapa | Recuadro de firma por etapa: `tripulacion`, `capitan` y `oficina`. Guarda la imagen PNG, el nombre de quien firma (en la etapa de tripulación se puede escribir otro nombre, por ejemplo un asistente sin cuenta), el usuario con sesión iniciada, su rol, la hora y una huella del contenido. Solo el rol `capitan` firma como Capitán y solo `designada` firma en oficina. Quien capturó una firma la puede quitar mientras la etapa siga abierta | Front: `src/components/registros/SignaturePad.vue`, `src/views/RecordView.vue`. Back: `POST /ism/records/:id/signatures` (`sign`), `DELETE /ism/records/:id/signatures/:field` | En cambio. La huella se calcula pero no se verifica: si los datos cambian después de firmar, la firma sigue valiendo. La imagen va dentro del registro y hace pesada cada respuesta |
| F-08 | Circuito de estados | `borrador` → `por_capitan` → `por_oficina` → `archivado`. "Listo para enviar" es explícito: guardar nunca envía. Al archivar se calcula `contentHash`, el registro ya no se puede editar y el PDF se aplana | Back: `ISM_STATUSES` en `ismRecord.model.ts`; `submit`, `approve` en `ism.controller.ts`. Front: `src/views/RecordView.vue` | Operativo con limitaciones. Si el Capitán ya firmó en borrador, el envío salta a oficina y registra como `captainApprovedBy` a quien envió, no al Capitán (en cambio). La secuencia es igual para todos los formatos |
| F-09 | Devolución con motivo | El Capitán (en `por_capitan`) o la Persona Designada (en `por_oficina`) devuelven con motivo obligatorio (sugerencias: "Falta información", "Dato incorrecto", "Falta una firma"). Vuelve a borrador, se retiran las firmas de Capitán y oficina y queda en el historial | Back: `POST /ism/records/:id/return` (`giveBack`). Front: `giveBack` en `RecordView.vue`, `src/stores/confirm.ts` | En cambio: falta la sección afectada (1.1) |
| F-10 | PDF oficial | Rellena el formulario PDF oficial con los datos, dibuja cada firma en su recuadro con el sello "nombre · dd/mm/aaaa hh:mm (hora Galápagos)" y agrega fotos de soporte (R-18). Sin archivar lleva la marca "BORRADOR · REGISTRO AUN NO ARCHIVADO"; archivado se aplana | Back: `renderRecordPdf` en `src/services/ism.service.ts`, `GET /ism/records/:id/pdf`. Plantillas: `assets/ism/templates/*.pdf` | Operativo con limitaciones. No verifica si un texto se corta en su recuadro. No genera página anexa. Los caracteres fuera de la fuente estándar se cambian por "?" |
| F-11 | Bandejas "Por firmar" | Pestañas "Por firmar · Capitán", "Por firmar · Oficina" y "Mis borradores" (todos los borradores para `admin`), con acceso directo al PDF | Front: `src/views/InboxView.vue`, `src/components/registros/RecordRow.vue`. Back: `GET /ism/records?status=…` | Operativo |
| F-12 | Archivo con búsqueda | Filtros por formato, estado, rango de fechas del registro, cargo, equipo y texto (nombre de archivo o título), con carga progresiva | Front: `src/views/ArchiveView.vue`, `src/composables/useInfiniteScroll.ts`. Back: `listRecords` | Operativo con limitaciones. No busca por persona |
| F-13 | Inicio y "Obligatorios del mes" | Tarjetas con conteos (mis borradores, por firmar Capitán, por firmar oficina, archivados), lista de obligatorios del mes (R-25 Alcohol, R-25 Drogas, R-28; R-16 por equipo, x de 73; R-23 por cargo, x de 10) y registros recientes | Front: `src/views/HomeView.vue`. Back: `GET /ism/summary` | En cambio: se agrega "Mis tareas" (1.1). Hoy un registro cuenta como hecho cuando ya fue enviado, no cuando está archivado |
| F-14 | Historial y auditoría | Cada registro guarda su historial (creado, firmas, enviado, aprobado, devuelto con motivo, archivado). Además hay una bitácora general de eventos | Back: `history` en `ismRecord.model.ts`, `logEvent` en `src/services/audit.service.ts` | Operativo |
| F-15 | Descartar borrador | Solo quien lo creó (o `admin`) descarta un borrador. Un registro enviado o archivado no se puede descartar | Back: `DELETE /ism/records/:id` (`discard`). Front: `RecordView.vue` | Operativo |
| F-16 | Fotos de soporte | Carga de fotos a la nube para los recuadros de foto (anexo del R-18) | Back: `POST /uploads`, `src/services/cloudinary.service.ts`. Front: `apiUploadPhoto` | Operativo. Se reutiliza para la evidencia del R-14 |
| F-17 | Control de acceso al registro | `getRecord` y `pdf` comprueban que el usuario pueda ver el registro | Back: `assertCanView` en `ism.controller.ts` | Operativo con limitaciones. `saveData`, `sign` y `submit` no llaman a `assertCanView`: un usuario con rol de tripulación que conozca el identificador de un borrador ajeno podría modificarlo. Se recomienda corregirlo en esta entrega |

### 1.1 Cambios de esta entrega

Se implementan en paralelo a este documento. Esta tabla describe el comportamiento esperado al terminar la entrega.

| Cambio | Qué cambia | Dónde | Función afectada |
|---|---|---|---|
| Sesión robusta | El token solo se borra cuando el servidor responde 401 (sin señal o con error del servidor, la sesión se mantiene). Tras iniciar sesión, la persona vuelve a la ruta donde estaba. Aviso visible de "sesión caducada". Casilla "Mantener sesión en esta tableta" con token de 30 días. Renovación deslizante con `POST /auth/refresh`. Tiempo máximo de espera en las llamadas | `src/stores/user.ts`, `src/services/httpBase.ts`, `src/main.ts`, `src/views/LoginView.vue`; `auth.controller.ts` (`refresh`, `JWT_REMEMBER_EXPIRES_IN`) | F-01 |
| Autoguardado sin pérdidas | Ningún lote se pierde: si falla el envío por cualquier motivo, queda guardado en la tablet y se reintenta. Nuevo estado "Pendiente de sincronizar", que se muestra mientras exista algo sin confirmar por el servidor | `src/composables/useAutosave.ts`, `RecordView.vue` | F-06 |
| Error con "Reintentar" | Si el registro no carga, la pantalla muestra el error con un botón "Reintentar" en lugar de volver al inicio | `RecordView.vue` | F-05 |
| Imágenes de firma aparte | El registro deja de incluir las imágenes de firma; se sirven con `GET /ism/records/:id/signatures/:field/image` | `ism.controller.ts`, `src/routes/index.ts`, `FormCanvas.vue` | F-07 |
| Corrección de `captainApprovedBy` | Si el Capitán firmó antes del envío, la aprobación queda a nombre del Capitán que firmó, con la hora de su firma | `submit` en `ism.controller.ts` | F-08 |
| Sin valores precargados indebidos | Ninguna casilla viene marcada. Se quitan los nombres de personas precargados (R-06, R-10, R-13, R-18 Cubierta y Máquinas, R-26) y los textos de conclusión precargados del R-19. Las caducidades del R-28 pasan de "respuesta" (`default`) a "referencia" (`reference`): se muestran como dato conocido y la persona confirma lo que ve. El servidor ignora cualquier valor por defecto en casillas | `tools/ism/defaults.py` (ya aplicado a `assets/ism/defs`), `createRecord` | F-04 |
| Clave de idempotencia | La creación envía una clave única. Un reintento o un doble toque devuelve el mismo registro y no crea otro | `idempotencyKey` en `ismRecord.model.ts` (índice único por usuario y clave), `createRecord`, `NewRecordView.vue` | F-04 |
| Firma invalidada al cambiar datos | La huella de la firma cubre solo el contenido (datos, respuestas y contexto). Si el contenido cambia después de firmar, la firma deja de valer y hay que volver a firmar. Las firmas antiguas, sin versión de huella, se respetan | `hashV` en `ismRecord.model.ts`, `hashRecord`, `saveData` | F-07 |
| Rol `duena` | Perfil de la dueña, con acceso a todo | `src/utils/roles.ts`, `auth.middleware.ts`, `src/stores/user.ts` | F-02 |
| "Mis tareas" en el inicio | El inicio muestra primero lo que le toca a la persona: pendientes, vencidos y registros que puede continuar, con accesos por actividad ("Preparar el zarpe"…). El código R queda como dato secundario | `HomeView.vue`, `GET /ism/summary` | F-13 |
| R-14 guiado | Flujo "Preparar el zarpe": confirmar contexto, recorrer las 4 secciones en bloques cortos, respuesta explícita en los 30 puntos, novedades, resumen con faltantes señalados y PDF con página anexa. Detalle en la sección 2.1 | `assets/ism/schemas/R-14.v1.json`; `schemaVersion`, `context`, `answers`, `flags` en `ismRecord.model.ts`; vista guiada en el frontend | F-05, F-10 |
| Devolución con sección afectada | La devolución pide motivo **y** sección afectada. Queda en `history[].section` y en `returnInfo` (la devolución vigente, que se limpia al reenviar) para mostrarla a quien corrige | `giveBack`, `returnInfo` en `ismRecord.model.ts`, `RecordView.vue` | F-09 |

---

## 2. Matriz de campos

### 2.0 Convenciones para todas las tablas

- **Campo PDF**: nombre exacto del campo en el formulario PDF oficial, copiado de `assets/ism/defs/<R>.json`. "(no está en el PDF)" indica un dato que guarda el sistema y que se imprime en la página anexa o en ningún lado.
- **Id semántico**: nombre estable del dato en el registro. En R-14 es el id del esquema `R-14.v1.json`. En R-16, R-23 y R-28 es una **propuesta**, porque estos formatos todavía no tienen flujo guiado y hoy guardan los datos por nombre de campo PDF (`record.data["Text Field 41"]`).
- **Destino en el PDF**: la página se cuenta desde 1. Las posiciones se verificaron contra las imágenes de las hojas.
- **Obligatorio**, en R-16, R-23 y R-28: "Hoy" es lo que valida el sistema. Hoy **solo se validan firmas** al enviar: la firma de tripulación si el formato la tiene (`submit`), la del Capitán para aprobar y la de la Persona Designada para archivar (`approve`). Ningún campo de datos se valida. "Propuesta" es lo que se recomienda programar en su flujo guiado.
- **Quién edita hoy** (`canEdit` en `ism.controller.ts`, igual para todos los formatos): en `borrador`, cualquier usuario con rol de tripulación; en `por_capitan`, el Capitán; en `por_oficina`, la Persona Designada; en `archivado`, nadie. `admin` puede siempre, salvo en archivado.
- **Por decidir (SGS)**: depende de una regla que no está confirmada. Cada caso remite a la sección 3.

### 2.1 R-14 · Lista de chequeo previo al zarpe y rondas de seguridad (flujo guiado "Preparar el zarpe")

**Hoja oficial.** Una página. Encabezado "Fecha / Hora / Lugar" y cuatro listas con columnas SI y NO:

- Ronda de seguridad de cubierta: 8 ítems.
- Lista de chequeo de cubierta previo al zarpe: 9 ítems.
- Lista de chequeo previo al arribo: 8 ítems.
- Lista de chequeo buque fondeado: 5 ítems.

Al pie hay firmas de Capitán y Persona Designada. Debajo de la ronda hay una fila "OBS:" sin campo en el PDF. El "OBS:" final es una instrucción impresa: la lista la realiza el tripulante de cubierta de guardia; la ronda se hace cada 2 horas en navegación y cada 4 en puerto, y se registra en la bitácora.

**Modelo de datos guiado (decidido).**

- `schemaVersion = 1` (esquema `R-14.v1.json`, plantilla `R-14.pdf`, edición 00, vigencia 01-05-2025).
- `context`:
  - `vessel`: fijo "Y/P Treasure of Galápagos I"; no está en el PDF.
  - `activityDate`: Text Field 1069, `dd/mm/aaaa`.
  - `activityTime`: Text Field 1070, `HH:MM`.
  - `place`: Text Field 1071.
  - `filledBy`: usuario autenticado, con nombre y cargo.
- `answers[id] = { value, problem, descripcion, accion, motivo, evidencia, at }`:
  - `value`: `si` | `no` | `na`. Ninguno viene marcado y SI y NO son exclusivos.
  - `problem`: "Hay un problema", posible aunque la respuesta sea SI.
  - `descripcion` y `accion`: qué se encontró y qué se hizo.
  - `motivo`: por qué no aplica.
  - `evidencia`: fotos opcionales.
  - `at`: momento de captura.

**Reglas comunes de cada punto.** Se validan al enviar, en el cliente y en el servidor:

- **C1.** Hay que responder `si`, `no` o `na`. Nada viene marcado por defecto. SI y NO se excluyen entre sí; en el PDF nunca se marcan las dos casillas.
- **C2.** Si `value = no` o `problem = true`, `descripcion` y `accion` son obligatorias. Con `problem = true` el punto se imprime con SI marcado y la novedad aparece en el anexo.
- **C3.** Si `value = na`, el `motivo` es obligatorio. Hoy todos los puntos tienen `allowNa: true` (Por decidir (SGS), D-02).
- **C4.** La evidencia (fotos) es opcional en todos los puntos.
- **C5.** Para enviar hacen falta el contexto completo (fecha, hora y lugar), los 30 puntos respondidos y C2 y C3 cumplidas. Los faltantes se muestran en la pregunta concreta.

**Aviso fijo.** "Completar este chequeo no autoriza el zarpe. La decisión de zarpar es del Capitán, que revisa y firma este registro." (Por decidir (SGS), D-04.)

| Campo PDF | Id semántico | Sección | Texto de la pregunta | Tipo | Obligatorio | Condiciones | Quién edita / firma | Destino en el PDF |
|---|---|---|---|---|---|---|---|---|
| (no está en el PDF) | `context.vessel` | Contexto | Embarcación | Texto fijo | Sí (automático) | Valor fijo "Y/P Treasure of Galápagos I"; no se edita | Sistema | Página anexa (encabezado). La hoja oficial ya lo imprime en el pie |
| Text Field 1069 | `context.activityDate` | Contexto | Fecha de la actividad | Fecha `dd/mm/aaaa` | Sí | Fecha válida. Es la fecha de la actividad, no la de captura ni la de firma | Tripulante de guardia (borrador) | Pág. 1, recuadro "Fecha:" del encabezado |
| Text Field 1070 | `context.activityTime` | Contexto | Hora de la actividad | Hora `HH:MM` (24 h, hora Galápagos) | Sí | Hora válida 00:00 a 23:59 | Tripulante de guardia (borrador) | Pág. 1, recuadro "Hora:" del encabezado |
| Text Field 1071 | `context.place` | Contexto | Lugar | Texto con sugerencias (Baltra, Puerto Ayora, San Cristóbal, Navegando) | Sí | Texto libre no vacío | Tripulante de guardia (borrador) | Pág. 1, recuadro "Lugar:" del encabezado |
| (no está en el PDF) | `context.filledBy` | Contexto | Quién llena (nombre y cargo) | Identidad autenticada | Sí (automático) | Se toma de la sesión; con cuenta compartida se pide el nombre de quien hace la guardia | Sistema | Página anexa: nombre, cargo, fecha y hora de envío, versión de esquema |
| Check Box 63 (SI) · Check Box 64 (NO) | `ronda.drizas` | Ronda de seguridad de cubierta, ítem 01 | ¿Las drizas y tiras están estibadas en la cubierta principal y en la cubierta 01?<br>Hoja: «Estiba de drizas y tiras sobre la cubierta principal y cubierta 01» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «RONDA DE SEGURIDAD DE CUBIERTA», fila 01: `si` → Check Box 63; `no` → Check Box 64; `na` → ninguna casilla y va al anexo |
| Check Box 99 (SI) · Check Box 100 (NO) | `ronda.balsas` | Ronda de seguridad de cubierta, ítem 02 | ¿Las balsas salvavidas de la cubierta 02 están aseguradas?<br>Hoja: «Verificar que se encuentren aseguradas las balsas salvavidas en la cubierta 02» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «RONDA DE SEGURIDAD DE CUBIERTA», fila 02: `si` → Check Box 99; `no` → Check Box 100; `na` → ninguna casilla y va al anexo |
| Check Box 101 (SI) · Check Box 102 (NO) | `ronda.pangas` | Ronda de seguridad de cubierta, ítem 03 | ¿Las pangas están trincadas y aseguradas?<br>Hoja: «Chequeo que las pangas se encuentren trincadas y aseguradas» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «RONDA DE SEGURIDAD DE CUBIERTA», fila 03: `si` → Check Box 101; `no` → Check Box 102; `na` → ninguna casilla y va al anexo |
| Check Box 103 (SI) · Check Box 104 (NO) | `ronda.fondeo` | Ronda de seguridad de cubierta, ítem 04 | ¿El sistema de fondeo y el ancla están en buen estado?<br>Hoja: «Chequeo del Sistema de Fondeo y ancla.» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «RONDA DE SEGURIDAD DE CUBIERTA», fila 04: `si` → Check Box 103; `no` → Check Box 104; `na` → ninguna casilla y va al anexo |
| Check Box 105 (SI) · Check Box 106 (NO) | `ronda.interiores` | Ronda de seguridad de cubierta, ítem 05 | ¿Las áreas interiores (bar, comedor, salón y cocina) están verificadas y estibadas?<br>Hoja: «Verificación y estiba de áreas interiores, bar, comedor, salón y cocina.» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «RONDA DE SEGURIDAD DE CUBIERTA», fila 05: `si` → Check Box 105; `no` → Check Box 106; `na` → ninguna casilla y va al anexo |
| Check Box 107 (SI) · Check Box 108 (NO) | `ronda.popa_puente` | Ronda de seguridad de cubierta, ítem 06 | ¿El área de popa y el puente de gobierno están revisados y en orden?<br>Hoja: «Chequeo de área de popa y puente de gobierno» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «RONDA DE SEGURIDAD DE CUBIERTA», fila 06: `si` → Check Box 107; `no` → Check Box 108; `na` → ninguna casilla y va al anexo |
| Check Box 109 (SI) · Check Box 1010 (NO) | `ronda.escotillas` | Ronda de seguridad de cubierta, ítem 07 | ¿Las escotillas, puertas estancas y claraboyas están cerradas para navegar?<br>Hoja: «Chequeo de escotillas, puertas estancas y claraboyas, cerradas en navegación» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «RONDA DE SEGURIDAD DE CUBIERTA», fila 07: `si` → Check Box 109; `no` → Check Box 1010; `na` → ninguna casilla y va al anexo |
| Check Box 1011 (SI) · Check Box 1012 (NO) | `ronda.equipos` | Ronda de seguridad de cubierta, ítem 08 | ¿Los equipos funcionan bien en todas las áreas de la embarcación?<br>Hoja: «Chequeo de equipos en funcionamiento en todas las áreas de la embarcación.» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «RONDA DE SEGURIDAD DE CUBIERTA», fila 08: `si` → Check Box 1011; `no` → Check Box 1012; `na` → ninguna casilla y va al anexo |
| Check Box 1013 (SI) · Check Box 1014 (NO) | `zarpe.personal` | Previo al zarpe, ítem 01 | ¿Todo el personal está a bordo y sin novedad?<br>Hoja: «Se verifica que todo el personal este abordo y sin novedad.» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO DE CUBIERTA PREVIO AL ZARPE», fila 01: `si` → Check Box 1013; `no` → Check Box 1014; `na` → ninguna casilla y va al anexo |
| Check Box 1015 (SI) · Check Box 1016 (NO) | `zarpe.pangas` | Previo al zarpe, ítem 02 | ¿Las pangas están trincadas y aseguradas (o, si van a remolque, con el seguro de los motores puesto y amarradas a la nave)?<br>Hoja: «Pangas trincadas y aseguradas sobre cubierta en caso de remolque, verificar que los motores se encuentren con el seguro puesto y amarradas a la nave» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO DE CUBIERTA PREVIO AL ZARPE», fila 02: `si` → Check Box 1015; `no` → Check Box 1016; `na` → ninguna casilla y va al anexo |
| Check Box 1017 (SI) · Check Box 1018 (NO) | `zarpe.navegacion` | Previo al zarpe, ítem 03 | ¿Los equipos de navegación funcionan bien (radar, GPS, Navtex, sonda, indicador de ángulo de caña, AIS y VDR)?<br>Hoja: «Equipos de navegación en correcto funcionamiento (Radar, GPS, Navtex, Sonda, Indicador de ángulo de caña, AIS, VDR)» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO DE CUBIERTA PREVIO AL ZARPE», fila 03: `si` → Check Box 1017; `no` → Check Box 1018; `na` → ninguna casilla y va al anexo |
| Check Box 1019 (SI) · Check Box 1020 (NO) | `zarpe.comunicaciones` | Previo al zarpe, ítem 04 | ¿Los equipos de comunicaciones están operativos?<br>Hoja: «Chequeo del estado operativo de los equipos de comunicaciones.» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO DE CUBIERTA PREVIO AL ZARPE», fila 04: `si` → Check Box 1019; `no` → Check Box 1020; `na` → ninguna casilla y va al anexo |
| Check Box 1021 (SI) · Check Box 1022 (NO) | `zarpe.maquinas` | Previo al zarpe, ítem 05 | ¿Las máquinas están en funcionamiento y sus controles operativos?<br>Hoja: «Maquinas en funcionamiento, chequeo de controles de máquinas operativos» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO DE CUBIERTA PREVIO AL ZARPE», fila 05: `si` → Check Box 1021; `no` → Check Box 1022; `na` → ninguna casilla y va al anexo |
| Check Box 1023 (SI) · Check Box 1024 (NO) | `zarpe.gobierno` | Previo al zarpe, ítem 06 | ¿El sistema de gobierno principal y el auxiliar están operativos?<br>Hoja: «Sistema de gobierno principal y auxiliar operativos» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO DE CUBIERTA PREVIO AL ZARPE», fila 06: `si` → Check Box 1023; `no` → Check Box 1024; `na` → ninguna casilla y va al anexo |
| Check Box 1025 (SI) · Check Box 1026 (NO) | `zarpe.luces` | Previo al zarpe, ítem 07 | ¿Las luces de navegación están en servicio y las de emergencia operativas?<br>Hoja: «Luces de navegación en servicio y luces de emergencia operativos» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO DE CUBIERTA PREVIO AL ZARPE», fila 07: `si` → Check Box 1025; `no` → Check Box 1026; `na` → ninguna casilla y va al anexo |
| Check Box 1027 (SI) · Check Box 1028 (NO) | `zarpe.cartas` | Previo al zarpe, ítem 08 | ¿Las cartas náuticas están listas según el plan de viaje?<br>Hoja: «Cartas Náuticas listas de acuerdo al plan de viaje» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO DE CUBIERTA PREVIO AL ZARPE», fila 08: `si` → Check Box 1027; `no` → Check Box 1028; `na` → ninguna casilla y va al anexo |
| Check Box 1029 (SI) · Check Box 1030 (NO) | `zarpe.capitania` | Previo al zarpe, ítem 09 | ¿Se reportó a la Capitanía del puerto y se solicitó el zarpe?<br>Hoja: «Reporte a la Capitanía del puerto respectivo y solicitud de zarpe» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO DE CUBIERTA PREVIO AL ZARPE», fila 09: `si` → Check Box 1029; `no` → Check Box 1030; `na` → ninguna casilla y va al anexo |
| Check Box 1031 (SI) · Check Box 1032 (NO) | `arribo.punto_fondeo` | Previo al arribo, ítem 01 | ¿El punto de fondeo coincide con el plan de viaje?<br>Hoja: «Verificar que el punto de fondeo sea de acuerdo con el Plan de Viaje» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO PREVIO AL ARRIBO», fila 01: `si` → Check Box 1031; `no` → Check Box 1032; `na` → ninguna casilla y va al anexo |
| Check Box 1033 (SI) · Check Box 1034 (NO) | `arribo.llamar_capitan` | Previo al arribo, ítem 02 | ¿Se llamó al Capitán con anticipación para la recalada?<br>Hoja: «Llamar al Capitán con la debida anticipación para la recalada al puerto o bahía.» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO PREVIO AL ARRIBO», fila 02: `si` → Check Box 1033; `no` → Check Box 1034; `na` → ninguna casilla y va al anexo |
| Check Box 1035 (SI) · Check Box 1036 (NO) | `arribo.equipos` | Previo al arribo, ítem 03 | ¿Los equipos de navegación y comunicaciones están operativos?<br>Hoja: «Verificación de estado operativo de equipos de navegación y comunicaciones» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO PREVIO AL ARRIBO», fila 03: `si` → Check Box 1035; `no` → Check Box 1036; `na` → ninguna casilla y va al anexo |
| Check Box 1037 (SI) · Check Box 1038 (NO) | `arribo.clima` | Previo al arribo, ítem 04 | ¿Se revisaron el clima, el viento, la corriente y la marea?<br>Hoja: «Chequeo de condiciones climáticas y estados de viento, corriente y marea» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO PREVIO AL ARRIBO», fila 04: `si` → Check Box 1037; `no` → Check Box 1038; `na` → ninguna casilla y va al anexo |
| Check Box 1039 (SI) · Check Box 1040 (NO) | `arribo.radar` | Previo al arribo, ítem 05 | ¿El radar está en la escala adecuada para la recalada?<br>Hoja: «Radar en la escala adecuada para realizar la recalada.» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO PREVIO AL ARRIBO», fila 05: `si` → Check Box 1039; `no` → Check Box 1040; `na` → ninguna casilla y va al anexo |
| Check Box 1041 (SI) · Check Box 1042 (NO) | `arribo.fondeo` | Previo al arribo, ítem 06 | ¿El sistema de fondeo, el ancla y la cadena están listos para fondear?<br>Hoja: «Verificar el estado del sistema de fondeo, ancla y cadena lista para el fondeo» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO PREVIO AL ARRIBO», fila 06: `si` → Check Box 1041; `no` → Check Box 1042; `na` → ninguna casilla y va al anexo |
| Check Box 1043 (SI) · Check Box 1044 (NO) | `arribo.comunicacion_maniobra` | Previo al arribo, ítem 07 | ¿Hay comunicación con el personal de la maniobra de fondeo y con máquinas?<br>Hoja: «Chequeo de comunicaciones con personal encargado de maniobra de fondeo y con el personal de máquinas.» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO PREVIO AL ARRIBO», fila 07: `si` → Check Box 1043; `no` → Check Box 1044; `na` → ninguna casilla y va al anexo |
| Check Box 1045 (SI) · Check Box 1046 (NO) | `arribo.orden_fondeo` | Previo al arribo, ítem 08 | ¿Se dio la orden de fondeo, con las máquinas alistadas y el ancla lista para cobrar?<br>Hoja: «Orden de fondeo, alistamiento de máquinas y ancla lista para cobrar.» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO PREVIO AL ARRIBO», fila 08: `si` → Check Box 1045; `no` → Check Box 1046; `na` → ninguna casilla y va al anexo |
| Check Box 1047 (SI) · Check Box 1048 (NO) | `fondeado.maquinas` | Buque fondeado, ítem 01 | ¿Las máquinas están listas para operar en cualquier circunstancia?<br>Hoja: «Chequeo de máquinas listas para operar en cualquier circunstancia» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO BUQUE FONDEADO», fila 01: `si` → Check Box 1047; `no` → Check Box 1048; `na` → ninguna casilla y va al anexo |
| Check Box 1049 (SI) · Check Box 1050 (NO) | `fondeado.posicion` | Buque fondeado, ítem 02 | ¿Se revisaron la posición, la marcación y la distancia para asegurar que la nave no garree?<br>Hoja: «Chequeo de la posición, marcación y distancia para asegurarse que no garree la nave.» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO BUQUE FONDEADO», fila 02: `si` → Check Box 1049; `no` → Check Box 1050; `na` → ninguna casilla y va al anexo |
| Check Box 1051 (SI) · Check Box 1052 (NO) | `fondeado.radar` | Buque fondeado, ítem 03 | ¿El radar está en stand by (o en vigilancia, si hace falta)?<br>Hoja: «Radar en stand by, en caso de ser necesario, mantener vigilancia por radar.» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO BUQUE FONDEADO», fila 03: `si` → Check Box 1051; `no` → Check Box 1052; `na` → ninguna casilla y va al anexo |
| Check Box 1053 (SI) · Check Box 1054 (NO) | `fondeado.marcas_luces` | Buque fondeado, ítem 04 | ¿Están puestas las marcas diurnas o las luces de fondeo, según corresponda?<br>Hoja: «Chequeo de marcas diurnas y luces de fondeo, respectivamente» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO BUQUE FONDEADO», fila 04: `si` → Check Box 1053; `no` → Check Box 1054; `na` → ninguna casilla y va al anexo |
| Check Box 1055 (SI) · Check Box 1056 (NO) | `fondeado.supervision` | Buque fondeado, ítem 05 | ¿Se supervisan las operaciones normales de la nave?<br>Hoja: «Supervisión de las operaciones normales de la nave.» | si / no / na | Sí | C1 a C4 | Tripulante de guardia (borrador) | Pág. 1, sección «LISTA DE CHEQUEO BUQUE FONDEADO», fila 05: `si` → Check Box 1055; `no` → Check Box 1056; `na` → ninguna casilla y va al anexo |
| (no está en el PDF) | `answers[id].problem` | Cada punto | ¿Hay un problema? (también con SI) | Booleano | No (por defecto falso) | Si es verdadero exige `descripcion` y `accion` (C2) | Quien responde el punto | No marca casilla; la novedad va al anexo |
| (no está en el PDF) | `answers[id].descripcion` | Cada punto | ¿Qué se encontró? | Texto | Condicional | Obligatoria si `value = no` o `problem = true` | Quien responde el punto | Página anexa, fila del punto |
| (no está en el PDF) | `answers[id].accion` | Cada punto | ¿Qué se hizo? (acción tomada) | Texto | Condicional | Obligatoria si `value = no` o `problem = true` | Quien responde el punto | Página anexa, fila del punto |
| (no está en el PDF) | `answers[id].motivo` | Cada punto | ¿Por qué no aplica? | Texto | Condicional | Obligatorio si `value = na` (C3) | Quien responde el punto | Página anexa, fila del punto |
| (no está en el PDF) | `answers[id].evidencia` | Cada punto | Fotos de evidencia | Lista de URL de fotos | No | Opcional (C4) | Quien responde el punto | Página anexa: se indica cuántas fotos hay; las fotos quedan en el registro |
| (no está en el PDF) | `answers[id].at` | Cada punto | Momento de captura | Fecha y hora (automático) | Sí (automático) | Se fija al responder y se actualiza si se cambia la respuesta | Sistema | Página anexa (para novedades y "no aplica") |
| Firma_Capitan | `signatures.Firma_Capitan` | Firmas | Firma del Capitán | Firma con el dedo + identidad autenticada | Sí, para pasar a oficina | Solo rol `capitan`; se invalida si cambian los datos después de firmar | Capitán (etapa `capitan`) | Pág. 1, recuadro "CAPITÁN" del pie, con sello de nombre, fecha y hora Galápagos |
| Firma_Persona_Designada | `signatures.Firma_Persona_Designada` | Firmas | Firma de la Persona Designada | Firma con el dedo + identidad autenticada | Sí, para archivar | Solo rol `designada`; al archivar el registro queda inmutable | Persona Designada (etapa `oficina`) | Pág. 1, recuadro "PERSONA DESIGNADA" del pie, con sello |

**Página anexa del PDF.** No existe en la hoja oficial; la agrega el sistema.

- **Encabezado**: el del formato (MGS, compañía, ID R-14, edición 00, vigencia 01-05-2025), con fecha, hora y lugar de la actividad y la embarcación.
- **Quién llenó**: nombre de la identidad autenticada (y de quien hizo la guardia, si la cuenta es compartida), cargo, fecha y hora del envío (hora Galápagos) y versión del esquema (`R-14.v1`).
- **Novedades**: una fila por cada punto con `value = no` o `problem = true`, con sección, número, texto oficial, respuesta, descripción, acción, cantidad de fotos y momento de captura.
- **No aplica**: una fila por cada punto con `value = na`, con su motivo.
- Si no hay novedades ni "no aplica", el anexo lo dice en una línea. Así siempre se imprime quién llenó.
- Propuesta: escribir "Ver anexo" en la fila "OBS:" de la hoja cuando haya novedades de la ronda. Hoy esa fila no tiene campo PDF y habría que dibujar el texto (Por decidir (SGS), D-01).

**Firmas y circuito R-14.** Hoy `stages = { tripulacion: 0, capitan: 1, oficina: 1 }`. El tripulante de guardia no firma porque el formato no tiene recuadro para él (D-03); su identidad queda en el anexo. Al enviar pasa a `por_capitan`. El Capitán revisa las novedades (deben aparecerle destacadas) y firma `Firma_Capitan`; luego pasa a `por_oficina`, donde la Persona Designada firma `Firma_Persona_Designada` y archiva.

Filas documentadas en la tabla: 43. Son 5 de contexto, 30 puntos (60 casillas), 6 subcampos comunes y 2 firmas. Los 65 campos del PDF quedan cubiertos.

### 2.2 R-16 · Registro de mantenimiento preventivo de cubierta y máquinas

**Hoja oficial.** Una página horizontal:

- **Encabezado**: EQUIPO/MAQUINARIA, MARCA, MODELO, SERIE y NOMBRE DEL ENCARGADO.
- **Tabla de 13 filas** con estas columnas: FECHA; MANTENIMIENTO, dividida en PREV. (marcar) y CORR. (marcar); CHEQUEO DEL EQUIPO, dividida en S, M, SM, A y B; DESCRIPCIÓN DEL TRABAJO REALIZADO; y HORAS DE TRABAJO DEL EQUIPO (Observaciones). Bajo el título de CHEQUEO DEL EQUIPO la hoja imprime "(Semanal, Mensual, Semestral, Anual, Bianual)", así que S = semanal, M = mensual, SM = semestral, A = anual y B = "bianual". "Bianual" puede leerse como dos veces al año o cada dos años; como semestral ya cubre dos veces al año, lo más probable es cada dos años (bienal). Por decidir (SGS), D-08.
- **Pie**: firmas CAPITÁN, ENCARGADO EQUIPO y PERSONA DESIGNADA, en ese orden de izquierda a derecha.

**Hoy.** Un registro por equipo (`frequency = por_equipo`), elegido al crear de los 73 equipos de `equipment.json`. Al crear, el sistema llena solo el encabezado desde el equipo (`equipmentFields`):

| Dato del equipo (`equipment.json`) | Campo PDF que se llena solo | Observación |
|---|---|---|
| `name` | Text Field 41 | Nombre visible del equipo |
| `brand` | Marca | 57 de los 73 equipos no tienen marca cargada |
| `model` | Text Field 42 | Hoy se escribe `model` o, si está vacío, **la marca** (`eq.model \|\| eq.brand` en `createRecord`); en el recuadro MODELO puede aparecer la marca. 34 equipos sin modelo |
| `serial` | Text Field 43 | 47 equipos sin serie |
| `owner` | Text Field 44 | Guarda un **cargo** ("Jefe de Máquinas", "Capitán"), no el nombre de una persona, aunque la columna dice "NOMBRE DEL ENCARGADO" (D-13) |

**Ids propuestos.** La hoja es una bitácora cronológica de hasta 13 intervenciones, no una cuadrícula de tareas por semana. Por eso se propone `r16.intervencion_NN.<dato>` (NN = fila 01 a 13) en vez de `r16.tarea_NN.semana_N`. El plan S/M/SM/A/B es un dato de cada intervención. Si el SGS define tareas planificadas por equipo (por ejemplo "cambio de aceite, mensual"), cada intervención puede llevar además `tareaId`, sin cambiar la hoja.

| Campo PDF | Id semántico (propuesto) | Sección | Texto de la pregunta | Tipo | Obligatorio | Condiciones | Quién edita / firma | Destino en el PDF |
|---|---|---|---|---|---|---|---|---|
| Text Field 41 | `r16.equipo.nombre` | Encabezado | Equipo / maquinaria | Texto, se llena solo desde el equipo | Hoy: no. Propuesta: sí (automático) | Se elige el equipo por nombre o ubicación (QR opcional); no se edita a mano | Sistema; corrige la oficina (permiso por definir) | Pág. 1, recuadro "EQUIPO/MAQUINARIA" |
| Marca | `r16.equipo.marca` | Encabezado | Marca | Texto, se llena solo | Hoy: no. Propuesta: no (si falta en el inventario se muestra "sin dato") | Viene de `equipment.json` | Sistema; corrige la oficina | Pág. 1, recuadro "MARCA" |
| Text Field 40 | `r16.equipo.marca_duplicado` | Encabezado | (campo duplicado dentro del recuadro MARCA) | Texto | No | Está casi encima de "Marca" (x 0,246 frente a 0,238, misma fila). Hoy nadie lo llena; si se escribe, se superpone. Propuesta: dejarlo siempre vacío | Nadie | Pág. 1, recuadro "MARCA" (superpuesto) |
| Text Field 42 | `r16.equipo.modelo` | Encabezado | Modelo | Texto, se llena solo | Hoy: no. Propuesta: no | Corregir el relleno con la marca cuando falta el modelo | Sistema; corrige la oficina | Pág. 1, recuadro "MODELO" |
| Text Field 43 | `r16.equipo.serie` | Encabezado | Serie | Texto, se llena solo | Hoy: no. Propuesta: no | Viene de `equipment.json` | Sistema; corrige la oficina | Pág. 1, recuadro "SERIE:" |
| Text Field 44 | `r16.equipo.encargado` | Encabezado | Nombre del encargado | Texto, se llena solo (hoy, el cargo) | Hoy: no. Propuesta: sí | Por decidir (SGS), D-13: nombre de la persona encargada o cargo | Sistema | Pág. 1, recuadro "NOMBRE DEL ENCARGADO:" |
| Text Field 1, 4, 7 … 37 (ver tabla de filas) | `r16.intervencion_NN.fecha` | Intervención NN | ¿Qué día se hizo el trabajo? | Fecha `dd/mm/aaaa` | Hoy: no. Propuesta: sí en cada intervención registrada | Dentro del período del registro (Por decidir (SGS), D-14: mes o sin período). No posterior a hoy | Quien registra la intervención (borrador) | Pág. 1, columna "FECHA", fila NN |
| PREV. y CORR. de la fila (ver tabla) | `r16.intervencion_NN.tipo` | Intervención NN | ¿Fue mantenimiento preventivo o correctivo? | Opción única: `prev` / `corr` | Hoy: no. Propuesta: sí | Exclusivas; ninguna marcada por defecto. Hoy son dos casillas independientes y se pueden marcar las dos | Quien registra la intervención | Pág. 1, columna "PREV. (MARCAR)" o "CORR. (MARCAR)", fila NN |
| S, M, SM, A, B de la fila (ver tabla) | `r16.intervencion_NN.plan` | Intervención NN | ¿Qué chequeo del plan corresponde? | Opción única: `S` semanal / `M` mensual / `SM` semestral / `A` anual / `B` bianual | Hoy: no. Propuesta: sí si `tipo = prev`; opcional si `corr` (Por decidir (SGS), D-08) | Una sola; ninguna por defecto. Hoy son cinco casillas independientes | Quien registra la intervención | Pág. 1, columnas "S", "M", "SM", "A", "B", fila NN |
| Text Field 2, 5, 8 … 38 | `r16.intervencion_NN.descripcion` | Intervención NN | ¿Qué trabajo se realizó? | Texto | Hoy: no. Propuesta: sí | Máximo para que quepa en una línea del recuadro (unos 80 a 90 caracteres con la letra automática; a verificar al generar el PDF); si es más largo, el texto completo va al anexo y en la hoja queda el inicio y "(ver anexo)" | Quien registra la intervención | Pág. 1, columna "DESCRIPCIÓN DEL TRABAJO REALIZADO", fila NN |
| Text Field 3, 6, 9 … 39 | `r16.intervencion_NN.horas` | Intervención NN | Horas de trabajo del equipo (horómetro) u observación | Texto corto (número o nota) | Hoy: no. Propuesta: Por decidir (SGS), D-14 (obligatorio en equipos con horómetro) | Recuadro estrecho: unos 14 caracteres | Quien registra la intervención | Pág. 1, columna "HORAS DE TRABAJO DEL EQUIPO (Observaciones)", fila NN |
| (no está en el PDF) | `r16.intervencion_NN.responsable` | Intervención NN | Quién hizo el trabajo | Identidad autenticada (automático) | Propuesta: sí (automático) | Una intervención guardada no cierra ni envía el registro mensual | Sistema | Página anexa: responsable y momento de captura por intervención |
| (no está en el PDF) | `r16.intervencion_NN.novedad` | Intervención NN | ¿Hubo una novedad? Descripción, evidencia y acción | Booleano + texto + fotos | Propuesta: condicional (si hay novedad, descripción y acción obligatorias) | Igual que C2 del R-14 | Quien registra la intervención | Página anexa |
| Signature Field 1 | `signatures.capitan` | Firmas | Firma del Capitán | Firma | Hoy: obligatoria para aprobar. Propuesta: igual | Solo rol `capitan` | Capitán (etapa `capitan`) | Pág. 1, recuadro "CAPITAN" (izquierda del pie) |
| Signature Field 2 | `signatures.encargado` | Firmas | Firma del encargado del equipo | Firma | Hoy: obligatoria para enviar (`stages.tripulacion = 1`). Propuesta: igual | Hoy firma cualquier usuario de tripulación y puede escribir otro nombre. Por decidir (SGS), D-09 y D-13 | Encargado del equipo (etapa `tripulacion`, etiqueta "Encargado") | Pág. 1, recuadro "ENCARGADO EQUIPO" (centro del pie) |
| Signature Field 3 | `signatures.persona_designada` | Firmas | Firma de la Persona Designada | Firma | Hoy: obligatoria para archivar. Propuesta: igual | Solo rol `designada` | Persona Designada (etapa `oficina`) | Pág. 1, recuadro "PERSONA DESIGNADA" (derecha del pie) |

**Correspondencia por fila (para reconstruir el campo PDF de cada id).** `r16.intervencion_NN.fecha` es la columna "Fecha" de la fila NN; `tipo = prev` marca la casilla PREV. y `tipo = corr` la CORR.; `plan = S` marca la casilla S, y así con las demás.

| Fila | Fecha | PREV. | CORR. | S | M | SM | A | B | Descripción del trabajo | Horas del equipo (Obs.) |
|---|---|---|---|---|---|---|---|---|---|---|
| 01 | Text Field 1 | Check Box 2 | Check Box 1 | Check Box 3 | Check Box 4 | Check Box 5 | Check Box 6 | Check Box 7 | Text Field 2 | Text Field 3 |
| 02 | Text Field 4 | Check Box 8 | Check Box 9 | Check Box 10 | Check Box 11 | Check Box 12 | Check Box 13 | Check Box 14 | Text Field 5 | Text Field 6 |
| 03 | Text Field 7 | Check Box 15 | Check Box 16 | Check Box 17 | Check Box 18 | Check Box 19 | Check Box 20 | Check Box 21 | Text Field 8 | Text Field 9 |
| 04 | Text Field 10 | Check Box 22 | Check Box 23 | Check Box 24 | Check Box 25 | Check Box 26 | Check Box 27 | Check Box 28 | Text Field 11 | Text Field 12 |
| 05 | Text Field 13 | Check Box 29 | Check Box 30 | Check Box 31 | Check Box 32 | Check Box 33 | Check Box 34 | Check Box 35 | Text Field 14 | Text Field 15 |
| 06 | Text Field 16 | Check Box 36 | Check Box 37 | Check Box 38 | Check Box 39 | Check Box 40 | Check Box 41 | Check Box 42 | Text Field 17 | Text Field 18 |
| 07 | Text Field 19 | Check Box 43 | Check Box 44 | Check Box 45 | Check Box 46 | Check Box 47 | Check Box 48 | Check Box 49 | Text Field 20 | Text Field 21 |
| 08 | Text Field 22 | Check Box 50 | Check Box 51 | Check Box 52 | Check Box 53 | Check Box 54 | Check Box 55 | Check Box 56 | Text Field 23 | Text Field 24 |
| 09 | Text Field 25 | Check Box 57 | Check Box 58 | Check Box 59 | Check Box 60 | Check Box 61 | Check Box 62 | Check Box 63 | Text Field 26 | Text Field 27 |
| 10 | Text Field 28 | Check Box 64 | Check Box 65 | Check Box 66 | Check Box 67 | Check Box 68 | Check Box 69 | Check Box 70 | Text Field 29 | Text Field 30 |
| 11 | Text Field 31 | Check Box 71 | Check Box 72 | Check Box 73 | Check Box 74 | Check Box 75 | Check Box 76 | Check Box 77 | Text Field 32 | Text Field 33 |
| 12 | Text Field 34 | Check Box 78 | Check Box 79 | Check Box 80 | Check Box 81 | Check Box 82 | Check Box 83 | Check Box 84 | Text Field 35 | Text Field 36 |
| 13 | Text Field 37 | Check Box 85 | Check Box 86 | Check Box 87 | Check Box 88 | Check Box 89 | Check Box 90 | Check Box 91 | Text Field 38 | Text Field 39 |

Regla: la fila NN (1 a 13) usa los campos de texto `3·NN − 2` (fecha), `3·NN − 1` (descripción) y `3·NN` (horas). Las casillas son `7·(NN − 1) + 1` a `7·NN`, en el orden PREV, CORR, S, M, SM, A, B. La excepción es la fila 01: en ella PREV es **Check Box 2** y CORR es **Check Box 1** (invertidas respecto de la regla, verificado por la coordenada x).

**Validación propuesta al enviar el R-16 mensual.** Al menos una intervención registrada (o una declaración expresa "sin intervenciones este mes", con motivo; Por decidir (SGS), D-14). Cada intervención con fecha, tipo, plan (si es preventivo) y descripción. Encabezado completo desde el inventario. Firma del encargado. Si hay más de 13 intervenciones en el período, se agrega una segunda hoja R-16 con el mismo encabezado.

Filas documentadas: 16 en la matriz (6 de encabezado, 5 patrones por intervención, 2 datos sin campo PDF y 3 firmas) y 13 en la tabla de correspondencia. Los 139 campos del PDF quedan cubiertos.

### 2.3 R-23 · Registro de horas de descanso de la tripulación

**Hoja oficial.** Una página horizontal:

- **Encabezado**: EMBARCACIÓN; PERSONAL DE GUARDIA, con casillas SI y NO; NÚMERO IMO; MARINO (NOMBRE COMPLETO); PUESTO Y GRADO; MES Y AÑO.
- **Instrucción**: "Sírvase indicar los periodos de descanso, según proceda, mediante una x". La casilla marcada significa **descanso**.
- **Cuadrícula**: días **01 a 30** (filas) por horas 0 a 23 (columnas); cada casilla es una hora completa (la columna "0" es de 00:00 a 01:00).
- **Columnas a la derecha**: "Hora de descanso en cada periodo de 24h" y "Observaciones". Después vienen dos columnas bajo el rótulo en rojo "NO PARA USO DEL TRIPULANTE": "Hora de **trabajo** o descanso, según proceda, en cada periodo de 24h" y "Hora de trabajo o **descanso**, según proceda, en cada periodo de 7 días" (las palabras en negrita están en rojo en la hoja).
- **Notas al pie**: citan el Convenio 180 de la OIT y el Convenio de Formación (STCW 1978, enmendado).
- **Pie**: firmas TRIPULANTE, CAPITÁN y PERSONA DESIGNADA.

**La cuadrícula tiene 30 días, no 31.** Se verificó en la imagen (filas 01 a 30) y en los campos: hay 30 filas de 24 casillas, 720 en total, más 2 casillas de guardia. Para los meses de 31 días, ver D-05.

**Hoy.** Un registro por cargo y mes (`frequency = por_cargo_mensual`; "Obligatorios del mes" cuenta 10 cargos). La embarcación viene precargada ("Y/P Treasure of Galápagos I" en Text Field 1014). Nada más se valida.

**Ids propuestos.**

- Encabezado: `r23.<dato>`.
- Cuadrícula: `r23.dia_DD.h_HH`, con DD = 01 a 30 y HH = 00 a 23. Cada id es un booleano: verdadero = descanso en la hora HH:00 a HH+1:00.
- Columnas por día: `r23.dia_DD.<columna>`.
- La cuadrícula es horaria, así que no existe un id de media hora como `h_0130`. Los tramos reales que pide la solicitud (con minutos y cruce de medianoche) se guardan aparte en `r23.tramos[]` y la cuadrícula se **deriva** de ellos (regla de redondeo: D-06).

| Campo PDF | Id semántico (propuesto) | Sección | Texto de la pregunta | Tipo | Obligatorio | Condiciones | Quién edita / firma | Destino en el PDF |
|---|---|---|---|---|---|---|---|---|
| Text Field 1014 | `r23.embarcacion` | Encabezado | Embarcación | Texto fijo (hoy precargado "Y/P Treasure of Galápagos I") | Hoy: no. Propuesta: sí (automático) | No editable | Sistema | Pág. 1, "EMBARCACION:" |
| Check Box 1018 (SI) · Check Box 1019 (NO) | `r23.guardia` | Encabezado | ¿Esta persona hace guardia? | Opción única `si` / `no` | Hoy: no. Propuesta: sí | Exclusivas; ninguna por defecto. Hoy se pueden marcar las dos | Tripulante (borrador) | Pág. 1, "PERSONAL DE GUARDIA: SI □ NO □" |
| Text Field 1011 | `r23.imo` | Encabezado | Número IMO | Texto fijo de la embarcación | Hoy: no. Propuesta: sí (automático) | Por decidir (SGS), D-15: número IMO a configurar | Sistema | Pág. 1, "NUMERO IMO:" |
| Text Field 1013 | `r23.marino` | Encabezado | Nombre completo del marino | Texto, precargado desde la identidad | Hoy: no. Propuesta: sí | Debe corresponder a una persona, no a una cuenta compartida (D-10) | Tripulante; corrige la oficina | Pág. 1, "MARINO (NOMBRE COMPLETO):" |
| Text Field 1012 | `r23.puesto_grado` | Encabezado | Puesto y grado | Texto, precargado desde el cargo | Hoy: no. Propuesta: sí | Viene del cargo elegido al crear | Tripulante; corrige la oficina | Pág. 1, "PUESTO Y GRADO:" |
| Text Field 1010 | `r23.mes_anio` | Encabezado | Mes y año | Texto `mm/aaaa`, se llena solo desde la fecha del registro | Hoy: no. Propuesta: sí (automático) | Igual al período del registro | Sistema | Pág. 1, "MES Y AÑO:" |
| 720 casillas (ver tabla por día) | `r23.dia_DD.h_HH` | Cuadrícula, día DD | ¿Descansó de HH:00 a HH+1:00? (se captura como tramos, no casilla por casilla) | Booleano derivado de `r23.tramos[]` | Hoy: no. Propuesta: cada día del mes transcurrido debe tener tramos registrados o una observación (por ejemplo "desembarcado") | Ninguna casilla marcada por defecto (no se completa descanso de oficio). Regla de redondeo: D-06 | Tripulante (borrador) | Pág. 1, fila del día DD, columna de la hora HH |
| (no está en el PDF) | `r23.tramos[]` = `{ inicio, fin, tipo }` | Captura | ¿Desde qué hora y hasta qué hora descansaste? | Lista de tramos con fecha y hora | Propuesta: sí | Sin solapamientos; `fin` posterior a `inicio`; un tramo puede cruzar la medianoche y se reparte entre los dos días; sin huecos sin explicar (Por decidir (SGS), D-05 y D-06) | Tripulante | Se convierte en la cuadrícula; el detalle con minutos va a una página anexa |
| Text Field 106, 1016 … (ver tabla) | `r23.dia_DD.descanso_24h` | Columnas del día | Horas de descanso del día | Número (calculado) | Propuesta: automático | Suma de las horas de descanso del día. Recuadro estrecho: máximo 4 caracteres | Sistema | Pág. 1, columna "Hora de descanso en cada periodo de 24h", fila DD |
| Text Field 107, 1017 … | `r23.dia_DD.observaciones` | Columnas del día | Observaciones del día | Texto | Hoy: no. Propuesta: condicional (obligatoria si el día no cumple la regla de descanso o no tiene tramos) | Por decidir (SGS), D-05 | Tripulante | Pág. 1, columna "Observaciones", fila DD |
| Text Field 108, 1018 … | `r23.dia_DD.oficina_24h` | Columnas del día (no para uso del tripulante) | Horas de trabajo (o descanso) en el período de 24 h | Número | Propuesta: automático o lo llena el Capitán u oficina | El tripulante no lo edita. Si se calcula: trabajo = 24 − descanso. Por decidir (SGS), D-05 | Capitán u oficina | Pág. 1, columna "Hora de trabajo o descanso… cada periodo de 24h", fila DD |
| Text Field 109, 1019 … | `r23.dia_DD.oficina_7d` | Columnas del día (no para uso del tripulante) | Horas de descanso en los últimos 7 días | Número | Propuesta: automático o lo llena el Capitán u oficina | Ventana móvil de 7 días, que incluye días del mes anterior. Por decidir (SGS), D-05 | Capitán u oficina | Pág. 1, columna "Hora de trabajo o descanso… cada periodo de 7 días", fila DD |
| Firma_Tripulante | `signatures.tripulante` | Firmas | Firma del tripulante | Firma | Hoy: obligatoria para enviar. Propuesta: igual, ligada a la persona del registro | Debe firmar el marino del encabezado (D-10) | Tripulante (etapa `tripulacion`) | Pág. 1, recuadro "TRIPULANTE" |
| Firma_Capitan | `signatures.capitan` | Firmas | Firma del Capitán | Firma | Hoy: obligatoria para aprobar | Solo rol `capitan` | Capitán | Pág. 1, recuadro "CAPITÁN" |
| Firma_Persona_Designada | `signatures.persona_designada` | Firmas | Firma de la Persona Designada | Firma | Hoy: obligatoria para archivar | Solo rol `designada` | Persona Designada | Pág. 1, recuadro "PERSONA DESIGNADA" |

**Tabla por día (reconstrucción de cada campo PDF).** La casilla de `r23.dia_DD.h_HH` es el elemento número HH (contando desde 00) de la lista del día DD. Los nombres no siguen una secuencia aritmética (el PDF los numeró concatenando sufijos), por eso se listan completos.

| Día | Casillas de hora en orden h00 → h23 (nombre del campo PDF) | Descanso 24 h | Observaciones | Oficina: trabajo/descanso 24 h | Oficina: trabajo/descanso 7 días |
|---|---|---|---|---|---|
| 01 | Check Box 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 1010, 1011, 1012, 1013, 1014, 1015, 1016, 1017 | Text Field 106 | Text Field 107 | Text Field 108 | Text Field 109 |
| 02 | Check Box 110, 111, 112, 113, 114, 115, 1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029, 1030, 1031, 1032, 1033, 1034, 1035, 1036, 1037 | Text Field 1016 | Text Field 1017 | Text Field 1018 | Text Field 1019 |
| 03 | Check Box 116, 117, 118, 119, 120, 121, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054, 1055 | Text Field 1021 | Text Field 1022 | Text Field 1023 | Text Field 1024 |
| 04 | Check Box 122, 123, 124, 125, 126, 127, 1056, 1057, 1058, 1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072, 1073 | Text Field 1026 | Text Field 1027 | Text Field 1028 | Text Field 1029 |
| 05 | Check Box 128, 129, 130, 131, 132, 133, 1074, 1075, 1076, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 1089, 1090, 1091 | Text Field 1031 | Text Field 1032 | Text Field 1033 | Text Field 1034 |
| 06 | Check Box 134, 135, 136, 137, 138, 139, 1092, 1093, 1094, 1095, 1096, 1097, 1098, 1099, 10100, 10101, 10102, 10103, 10104, 10105, 10106, 10107, 10108, 10109 | Text Field 1036 | Text Field 1037 | Text Field 1038 | Text Field 1039 |
| 07 | Check Box 140, 141, 142, 143, 144, 145, 10110, 10111, 10112, 10113, 10114, 10115, 10116, 10117, 101010, 101011, 101012, 101013, 101014, 101015, 101016, 101017, 101018, 101019 | Text Field 1041 | Text Field 1042 | Text Field 1043 | Text Field 1044 |
| 08 | Check Box 146, 147, 148, 149, 150, 151, 10118, 10119, 10120, 10121, 10122, 10123, 10124, 10125, 101020, 101021, 101022, 101023, 101024, 101025, 101026, 101027, 101028, 101029 | Text Field 1046 | Text Field 1047 | Text Field 1048 | Text Field 1049 |
| 09 | Check Box 152, 153, 154, 155, 156, 157, 10126, 10127, 10128, 10129, 10130, 10131, 10132, 10133, 101030, 101031, 101032, 101033, 101034, 101035, 101036, 101037, 101038, 101039 | Text Field 1051 | Text Field 1052 | Text Field 1053 | Text Field 1054 |
| 10 | Check Box 158, 159, 160, 161, 162, 163, 10134, 10135, 10136, 10137, 10138, 10139, 10140, 10141, 101040, 101041, 101042, 101043, 101044, 101045, 101046, 101047, 101048, 101049 | Text Field 1056 | Text Field 1057 | Text Field 1058 | Text Field 1059 |
| 11 | Check Box 164, 165, 166, 167, 168, 169, 10142, 10143, 10144, 10145, 10146, 10147, 10148, 10149, 101050, 101051, 101052, 101053, 101054, 101055, 101056, 101057, 101058, 101059 | Text Field 1061 | Text Field 1062 | Text Field 1063 | Text Field 1064 |
| 12 | Check Box 170, 171, 172, 173, 174, 175, 10150, 10151, 10152, 10153, 10154, 10155, 10156, 10157, 101060, 101061, 101062, 101063, 101064, 101065, 101066, 101067, 101068, 101069 | Text Field 1066 | Text Field 1067 | Text Field 1068 | Text Field 1069 |
| 13 | Check Box 176, 177, 178, 179, 180, 181, 10158, 10159, 10160, 10161, 10162, 10163, 10164, 10165, 101070, 101071, 101072, 101073, 101074, 101075, 101076, 101077, 101078, 101079 | Text Field 1071 | Text Field 1072 | Text Field 1073 | Text Field 1074 |
| 14 | Check Box 182, 183, 184, 185, 186, 187, 10166, 10167, 10168, 10169, 10170, 10171, 10172, 10173, 101080, 101081, 101082, 101083, 101084, 101085, 101086, 101087, 101088, 101089 | Text Field 1076 | Text Field 1077 | Text Field 1078 | Text Field 1079 |
| 15 | Check Box 188, 189, 190, 191, 192, 193, 10174, 10175, 10176, 10177, 10178, 10179, 10180, 10181, 101090, 101091, 101092, 101093, 101094, 101095, 101096, 101097, 101098, 101099 | Text Field 1081 | Text Field 1082 | Text Field 1083 | Text Field 1084 |
| 16 | Check Box 194, 195, 196, 197, 198, 199, 10182, 10183, 10184, 10185, 10186, 10187, 10188, 10189, 1010100, 1010101, 1010102, 1010103, 1010104, 1010105, 1010106, 1010107, 1010108, 1010109 | Text Field 1086 | Text Field 1087 | Text Field 1088 | Text Field 1089 |
| 17 | Check Box 200, 201, 202, 203, 204, 205, 10190, 10191, 10192, 10193, 10194, 10195, 10196, 10197, 10101010, 10101011, 10101012, 10101013, 10101014, 10101015, 10101016, 10101017, 10101018, 10101019 | Text Field 1091 | Text Field 1092 | Text Field 1093 | Text Field 1094 |
| 18 | Check Box 206, 207, 208, 209, 2010, 2011, 10198, 10199, 10200, 10201, 10202, 10203, 10204, 10205, 10101020, 10101021, 10101022, 10101023, 10101024, 10101025, 10101026, 10101027, 10101028, 10101029 | Text Field 1096 | Text Field 1097 | Text Field 1098 | Text Field 1099 |
| 19 | Check Box 2012, 2013, 2014, 2015, 2016, 2017, 10206, 10207, 10208, 10209, 102010, 102011, 102012, 102013, 10101030, 10101031, 10101032, 10101033, 10101034, 10101035, 10101036, 10101037, 10101038, 10101039 | Text Field 10101 | Text Field 10102 | Text Field 10103 | Text Field 10104 |
| 20 | Check Box 2018, 2019, 2020, 2021, 2022, 2023, 102014, 102015, 102016, 102017, 102018, 102019, 102020, 102021, 10101040, 10101041, 10101042, 10101043, 10101044, 10101045, 10101046, 10101047, 10101048, 10101049 | Text Field 10106 | Text Field 10107 | Text Field 10108 | Text Field 10109 |
| 21 | Check Box 2024, 2025, 2026, 2027, 2028, 2029, 102022, 102023, 102024, 102025, 102026, 102027, 102028, 102029, 10101050, 10101051, 10101052, 10101053, 10101054, 10101055, 10101056, 10101057, 10101058, 10101059 | Text Field 101011 | Text Field 101012 | Text Field 101013 | Text Field 101014 |
| 22 | Check Box 2030, 2031, 2032, 2033, 2034, 2035, 102030, 102031, 102032, 102033, 102034, 102035, 102036, 102037, 10101060, 10101061, 10101062, 10101063, 10101064, 10101065, 10101066, 10101067, 10101068, 10101069 | Text Field 101016 | Text Field 101017 | Text Field 101018 | Text Field 101019 |
| 23 | Check Box 2036, 2037, 2038, 2039, 2040, 2041, 102038, 102039, 102040, 102041, 102042, 102043, 102044, 102045, 10101070, 10101071, 10101072, 10101073, 10101074, 10101075, 10101076, 10101077, 10101078, 10101079 | Text Field 101021 | Text Field 101022 | Text Field 101023 | Text Field 101024 |
| 24 | Check Box 2042, 2043, 2044, 2045, 2046, 2047, 102046, 102047, 102048, 102049, 102050, 102051, 102052, 102053, 10101080, 10101081, 10101082, 10101083, 10101084, 10101085, 10101086, 10101087, 10101088, 10101089 | Text Field 101026 | Text Field 101027 | Text Field 101028 | Text Field 101029 |
| 25 | Check Box 2048, 2049, 2050, 2051, 2052, 2053, 102054, 102055, 102056, 102057, 102058, 102059, 102060, 102061, 10101090, 10101091, 10101092, 10101093, 10101094, 10101095, 10101096, 10101097, 10101098, 10101099 | Text Field 101031 | Text Field 101032 | Text Field 101033 | Text Field 101034 |
| 26 | Check Box 2054, 2055, 2056, 2057, 2058, 2059, 102062, 102063, 102064, 102065, 102066, 102067, 102068, 102069, 101010100, 101010101, 101010102, 101010103, 101010104, 101010105, 101010106, 101010107, 101010108, 101010109 | Text Field 101036 | Text Field 101037 | Text Field 101038 | Text Field 101039 |
| 27 | Check Box 2060, 2061, 2062, 2063, 2064, 2065, 102070, 102071, 102072, 102073, 102074, 102075, 102076, 102077, 1010101010, 1010101011, 1010101012, 1010101013, 1010101014, 1010101015, 1010101016, 1010101017, 1010101018, 1010101019 | Text Field 101041 | Text Field 101042 | Text Field 101043 | Text Field 101044 |
| 28 | Check Box 2066, 2067, 2068, 2069, 2070, 2071, 102078, 102079, 102080, 102081, 102082, 102083, 102084, 102085, 1010101020, 1010101021, 1010101022, 1010101023, 1010101024, 1010101025, 1010101026, 1010101027, 1010101028, 1010101029 | Text Field 101046 | Text Field 101047 | Text Field 101048 | Text Field 101049 |
| 29 | Check Box 2072, 2073, 2074, 2075, 2076, 2077, 102086, 102087, 102088, 102089, 102090, 102091, 102092, 102093, 1010101030, 1010101031, 1010101032, 1010101033, 1010101034, 1010101035, 1010101036, 1010101037, 1010101038, 1010101039 | Text Field 101051 | Text Field 101052 | Text Field 101053 | Text Field 101054 |
| 30 | Check Box 2078, 2079, 2080, 2081, 2082, 2083, 102094, 102095, 102096, 102097, 102098, 102099, 1020100, 1020101, 1010101040, 1010101041, 1010101042, 1010101043, 1010101044, 1010101045, 1010101046, 1010101047, 1010101048, 1010101049 | Text Field 101056 | Text Field 101057 | Text Field 101058 | Text Field 101059 |

**Validaciones propuestas del R-23** (las reglas de cumplimiento deben confirmarse antes de programarlas, D-05):

- Ninguna hora de descanso se marca por defecto.
- Los tramos no se solapan.
- Un turno que cruza la medianoche se reparte entre los dos días; si cruza el fin de mes, la parte del día siguiente va al registro del mes siguiente.
- Todo día del período transcurrido tiene tramos o una observación.
- Alerta (no bloqueo, hasta que el SGS lo confirme) cuando un día o una ventana de 7 días no cumple la regla de descanso.

Filas documentadas: 15 en la matriz (6 de encabezado y guardia, 1 patrón de cuadrícula, 1 de tramos sin campo PDF, 4 patrones de columnas por día y 3 firmas) y 30 en la tabla por día. Los 850 campos del PDF quedan cubiertos.

### 2.4 R-28 · Control mensual de equipos de seguridad y contra incendio

**Hoja oficial.** Cuatro páginas verticales:

- **Página 1, encabezado**: MES, FECHA y RESPONSABLE.
- **Tabla de 114 ítems** con columnas ÍTEM, DESCRIPCIÓN DEL EQUIPO, CANT., UBICACIÓN, PRUEBA, CADUCIDAD y OBSERVACIÓN. Está dividida en "CUBIERTA PRINCIPAL" (ítems 01 a 39), "CUBIERTA 200" (40 a 107) y "CUBIERTA 300 (CUBIERA DE SOL)" (108 a 114; "CUBIERA" figura así en la hoja).
- **Página 4, pie**: firmas MARINERO PRIMERA DE PUENTE, CAPITÁN y PERSONA DESIGNADA.

Las columnas ÍTEM, DESCRIPCIÓN, CANT. y UBICACIÓN están impresas y no son campos. Cada ítem tiene **una** casilla (PRUEBA) y dos textos (CADUCIDAD y OBSERVACIÓN), aunque la cantidad sea mayor que 1 (por ejemplo, 18 chalecos de desembarco en una sola casilla).

**"PRUEBA".** La hoja no define qué significa marcar esa casilla: no hay leyenda ni nota en ninguna de las cuatro páginas (verificado en las imágenes). Ver D-07.

**Hoy.** Un registro por mes (`frequency = mensual`; figura en "Obligatorios del mes"). Las caducidades que traía el PDF se precargaban como respuesta; ahora (`tools/ism/defaults.py`, ya aplicado) están en la clave `reference` de la definición y **no** se copian al registro. Se muestran como dato conocido, y la persona confirma o corrige lo que ve en el equipo. Distribución de las referencias actuales de los 114 ítems: "s/f": 73, "sept 2026": 31, "Oct 2026": 3, "(vacío)": 2, "caduco": 1, "9/2025": 1, "Recargable": 1, "10 / 2027": 1, "nov 2025": 1. Sin referencia: ítems 009, 016.

| Campo PDF | Id semántico (propuesto) | Sección | Texto de la pregunta | Tipo | Obligatorio | Condiciones | Quién edita / firma | Destino en el PDF |
|---|---|---|---|---|---|---|---|---|
| Text Field 1090 | `r28.mes` | Encabezado | Mes | Texto, se llena solo desde la fecha del registro | Hoy: no. Propuesta: sí (automático) | Igual al período del registro | Sistema | Pág. 1, "MES:" |
| Text Field 1091 | `r28.fecha` | Encabezado | Fecha del recorrido | Fecha `dd/mm/aaaa` | Hoy: no. Propuesta: sí | Dentro del mes. Si el recorrido se hace en varias sesiones, va la fecha en que se completó (Por decidir (SGS), D-16) | Responsable del recorrido | Pág. 1, "FECHA:" |
| Text Field 1092 | `r28.responsable` | Encabezado | Responsable | Texto, precargado desde la identidad | Hoy: no. Propuesta: sí | Persona, no cuenta compartida (D-10) | Responsable del recorrido | Pág. 1, "RESPONSABLE:" |
| Casilla PRUEBA del ítem (ver tabla) | `r28.item_NNN.estado` | Ítem NNN (cubierta según la tabla) | ¿Revisaste el equipo? ¿Está conforme? | Opción única: `conforme` / `novedad` / `no_revisado` (sin respuesta por defecto) | Hoy: no. Propuesta: sí, todos los ítems con `conforme` o `novedad` para enviar; `no_revisado` solo con motivo (Por decidir (SGS), D-07) | `conforme` → casilla PRUEBA marcada; `novedad` → casilla marcada o no según D-07, y la novedad va a OBSERVACIÓN y al anexo; `no_revisado` → sin marcar | Responsable del recorrido (borrador) | Casilla de la columna "PRUEBA" en la fila del ítem |
| Campo CADUCIDAD del ítem | `r28.item_NNN.caducidad` | Ítem NNN | ¿Qué fecha de caducidad tiene la etiqueta del equipo? | Texto con formato `mm/aaaa`, o "s/f" (sin fecha), o "recargable" | Propuesta: sí en los ítems que tienen caducidad; Por decidir (SGS), D-16 | Se muestra la referencia (`reference`) como pista, nunca como respuesta. Si la fecha confirmada ya pasó o vence en el mes, alerta y novedad obligatoria | Responsable del recorrido | Campo de la columna "CADUCIDAD" en la fila del ítem |
| Campo OBSERVACIÓN del ítem | `r28.item_NNN.observacion` | Ítem NNN | ¿Qué encontraste y qué se hizo? | Texto | Propuesta: condicional, obligatoria si `estado = novedad`, si `no_revisado` (motivo) o si la caducidad está vencida | Recuadro estrecho (unos 15 caracteres). El texto completo va al anexo y en la hoja queda el inicio y "(ver anexo)" | Responsable del recorrido | Campo de la columna "OBSERVACIÓN" en la fila del ítem |
| (no está en el PDF) | `r28.item_NNN.evidencia`, `r28.item_NNN.at` | Ítem NNN | Fotos y momento de revisión | Fotos (opcional) y fecha y hora automática | Propuesta: opcional / automático | Permite continuar el recorrido en otra sesión: cada ítem guarda cuándo se revisó | Responsable del recorrido | Página anexa (novedades) |
| Signature Field 40 | `signatures.marinero_puente` | Firmas | Firma del marinero de primera de puente | Firma | Hoy: obligatoria para enviar | Por decidir (SGS), D-09: si firma el marinero de primera o quien hizo el recorrido | Marinero de primera de puente (etapa `tripulacion`, etiqueta "Marinero de Primera Puente") | Pág. 4, recuadro "MARINERO PRIMERA DE PUENTE" |
| Signature Field 43 | `signatures.capitan` | Firmas | Firma del Capitán | Firma | Hoy: obligatoria para aprobar | Solo rol `capitan` | Capitán | Pág. 4, recuadro "CAPITÁN" |
| Signature Field 44 | `signatures.persona_designada` | Firmas | Firma de la Persona Designada | Firma | Hoy: obligatoria para archivar | Solo rol `designada` | Persona Designada | Pág. 4, recuadro "PERSONA DESIGNADA" |

**Tabla de ítems.** Para reconstruir cada campo PDF: el id `r28.item_NNN.estado` corresponde a la casilla de la columna PRUEBA, `.caducidad` al campo CADUCIDAD y `.observacion` al campo OBSERVACIÓN de la fila NNN. La columna "Caducidad precargada hoy → referencia" muestra el valor que antes se escribía como respuesta y que desde esta entrega solo se muestra como referencia. Los textos de equipo y ubicación se transcribieron de la hoja (con mayúsculas normalizadas).

| N° | Sección | Equipo | Cant. | Ubicación | Pág. | PRUEBA (casilla) | CADUCIDAD (campo) | Caducidad precargada hoy → referencia | OBSERVACIÓN (campo) | Id base |
|---|---|---|---|---|---|---|---|---|---|---|
| 001 | Cubierta principal | Extintor de PQS 10 lbs | 02 | Salón principal | 1 | Check Box 120 | Text Field 1094 | sept 2026 | Text Field 1095 | `r28.item_001` |
| 002 | Cubierta principal | Extintor de PQS 10 lbs | 02 | Cub. principal popa | 1 | Check Box 121 | Text Field 1096 | sept 2026 | Text Field 1097 | `r28.item_002` |
| 003 | Cubierta principal | Extintor de PQS 5 lbs | 01 | Cabina 1 | 1 | Check Box 122 | Text Field 1098 | sept 2026 | Text Field 1099 | `r28.item_003` |
| 004 | Cubierta principal | Extintor de PQS 5 lbs | 01 | Cabina 2 | 1 | Check Box 123 | Text Field 10100 | sept 2026 | Text Field 10101 | `r28.item_004` |
| 005 | Cubierta principal | Extintor de PQS 5 lbs | 01 | Cabina 3 | 1 | Check Box 124 | Text Field 10102 | sept 2026 | Text Field 10103 | `r28.item_005` |
| 006 | Cubierta principal | Extintor de PQS 5 lbs | 01 | Cabina 4 | 1 | Check Box 125 | Text Field 10104 | sept 2026 | Text Field 10105 | `r28.item_006` |
| 007 | Cubierta principal | Extintor de PQS 5 lbs | 01 | Cabina 5 | 1 | Check Box 126 | Text Field 10106 | sept 2026 | Text Field 10107 | `r28.item_007` |
| 008 | Cubierta principal | Botellas fijas CO2 50 lbs | 02 | Entrada máq. BB | 1 | Check Box 127 | Text Field 10108 | sept 2026 | Text Field 10109 | `r28.item_008` |
| 009 | Cubierta principal | Botellas fijas CO2 50 lbs | 02 | Entrada máq. EB | 1 | Check Box 128 | Text Field 101010 | (vacío) | Text Field 101011 | `r28.item_009` |
| 010 | Cubierta principal | Estación C/I proa | 01 | Proa EB | 1 | Check Box 129 | Text Field 101012 | s/f | Text Field 101013 | `r28.item_010` |
| 011 | Cubierta principal | Manguera C/I y pitón | 01 | Proa BB | 1 | Check Box 130 | Text Field 101014 | s/f | Text Field 101015 | `r28.item_011` |
| 012 | Cubierta principal | Estación C/I popa | 01 | Popa EB | 1 | Check Box 131 | Text Field 101016 | s/f | Text Field 101017 | `r28.item_012` |
| 013 | Cubierta principal | Manguera C/I y pitón (hoja: "PINTON") | 01 | Popa EB | 1 | Check Box 132 | Text Field 101018 | s/f | Text Field 101019 | `r28.item_013` |
| 014 | Cubierta principal | Bomba C/I portátil | 01 | Popa BB | 1 | Check Box 133 | Text Field 101020 | s/f | Text Field 101021 | `r28.item_014` |
| 015 | Cubierta principal | Detector de humo | 02 | Cabina 1 | 1 | Check Box 134 | Text Field 101022 | s/f | Text Field 101023 | `r28.item_015` |
| 016 | Cubierta principal | Detector de humo | 01 | Cabina 2 | 1 | Check Box 135 | Text Field 101024 | (vacío) | Text Field 101025 | `r28.item_016` |
| 017 | Cubierta principal | Detector de humo | 01 | Cabina 3 | 1 | Check Box 136 | Text Field 101026 | s/f | Text Field 101027 | `r28.item_017` |
| 018 | Cubierta principal | Detector de humo | 01 | Cabina 4 | 1 | Check Box 137 | Text Field 101028 | s/f | Text Field 101029 | `r28.item_018` |
| 019 | Cubierta principal | Detector de humo | 01 | Cabina 5 | 1 | Check Box 138 | Text Field 101030 | s/f | Text Field 101031 | `r28.item_019` |
| 020 | Cubierta principal | Detector de humo | 01 | Salón principal | 1 | Check Box 139 | Text Field 101032 | s/f | Text Field 101033 | `r28.item_020` |
| 021 | Cubierta principal | Detector de humo | 01 | Comedor pax | 1 | Check Box 140 | Text Field 101034 | s/f | Text Field 101035 | `r28.item_021` |
| 022 | Cubierta principal | Rociador | 02 | Cabina 1 | 1 | Check Box 141 | Text Field 101036 | s/f | Text Field 101037 | `r28.item_022` |
| 023 | Cubierta principal | Rociador | 02 | Cabina 2 | 1 | Check Box 142 | Text Field 101038 | s/f | Text Field 101039 | `r28.item_023` |
| 024 | Cubierta principal | Rociador | 01 | Cabina 3 | 1 | Check Box 143 | Text Field 101040 | s/f | Text Field 101041 | `r28.item_024` |
| 025 | Cubierta principal | Rociador | 01 | Cabina 4 | 1 | Check Box 144 | Text Field 101042 | s/f | Text Field 101043 | `r28.item_025` |
| 026 | Cubierta principal | Rociador | 01 | Cabina 5 | 1 | Check Box 145 | Text Field 101044 | s/f | Text Field 101045 | `r28.item_026` |
| 027 | Cubierta principal | Rociador | 02 | Pasillo cabinas | 1 | Check Box 146 | Text Field 101046 | s/f | Text Field 101047 | `r28.item_027` |
| 028 | Cubierta principal | Rociador | 03 | Salón comedor | 1 | Check Box 147 | Text Field 101048 | s/f | Text Field 101049 | `r28.item_028` |
| 029 | Cubierta principal | Chaleco salvavidas luz y pito | 02 | Cabina 1 | 1 | Check Box 148 | Text Field 101050 | s/f | Text Field 101051 | `r28.item_029` |
| 030 | Cubierta principal | Chaleco salvavidas luz y pito | 02 | Cabina 2 | 1 | Check Box 149 | Text Field 101052 | s/f | Text Field 101053 | `r28.item_030` |
| 031 | Cubierta principal | Chaleco salvavidas luz y pito | 02 | Cabina 3 | 1 | Check Box 150 | Text Field 101054 | s/f | Text Field 101055 | `r28.item_031` |
| 032 | Cubierta principal | Chaleco salvavidas luz y pito | 02 | Cabina 4 | 1 | Check Box 151 | Text Field 101056 | s/f | Text Field 101057 | `r28.item_032` |
| 033 | Cubierta principal | Chaleco salvavidas luz y pito | 02 | Cabina 5 | 1 | Check Box 152 | Text Field 101058 | s/f | Text Field 101059 | `r28.item_033` |
| 034 | Cubierta principal | Hacha contra incendio | 01 | Proa | 1 | Check Box 153 | Text Field 101060 | s/f | Text Field 101061 | `r28.item_034` |
| 035 | Cubierta principal | Chalecos salvavidas desembarco | 18 | Popa | 2 | Check Box 223 | Text Field 101066 | s/f | Text Field 101067 | `r28.item_035` |
| 036 | Cubierta principal | Aro salvavidas con luz y rabiza | 01 | Popa Bb | 2 | Check Box 155 | Text Field 101064 | s/f | Text Field 101065 | `r28.item_036` |
| 037 | Cubierta principal | Aro salvavidas con luz y rabiza | 01 | Popa Eb | 2 | Check Box 224 | Text Field 101068 | s/f | Text Field 101069 | `r28.item_037` |
| 038 | Cubierta principal | Aro salvavidas con rabiza | 01 | Proa Bb | 2 | Check Box 225 | Text Field 101070 | s/f | Text Field 101071 | `r28.item_038` |
| 039 | Cubierta principal | Aro salvavidas con rabiza | 01 | Proa Eb | 2 | Check Box 226 | Text Field 101072 | s/f | Text Field 101073 | `r28.item_039` |
| 040 | Cubierta 200 | Extintor de CO2 10 lbs | 01 | Cocina | 2 | Check Box 227 | Text Field 101074 | sept 2026 | Text Field 101075 | `r28.item_040` |
| 041 | Cubierta 200 | Extintor de PQS 10 lbs | 01 | Comedor tripulación | 2 | Check Box 228 | Text Field 101076 | sept 2026 | Text Field 101077 | `r28.item_041` |
| 042 | Cubierta 200 | Extintor CO2 10 lbs | 01 | Cabinas tripulación EB (lavandería) | 2 | Check Box 229 | Text Field 101078 | sept 2026 | Text Field 101079 | `r28.item_042` |
| 043 | Cubierta 200 | Extintor CO2 10 lbs | 01 | Sala máquinas BB | 2 | Check Box 230 | Text Field 101080 | sept 2026 | Text Field 101081 | `r28.item_043` |
| 044 | Cubierta 200 | Extintor foam 10 lbs | 01 | Sala máquinas BB | 2 | Check Box 231 | Text Field 101082 | sept 2026 | Text Field 101083 | `r28.item_044` |
| 045 | Cubierta 200 | Extintor CO2 10 lbs | 01 | Sala máquinas EB | 2 | Check Box 232 | Text Field 101084 | sept 2026 | Text Field 101085 | `r28.item_045` |
| 046 | Cubierta 200 | Extintor foam 10 lbs | 01 | Sala máquinas EB | 2 | Check Box 233 | Text Field 101086 | sept 2026 | Text Field 101087 | `r28.item_046` |
| 047 | Cubierta 200 | Bomba C/I fija | 01 | Sala máquinas EB | 2 | Check Box 234 | Text Field 101088 | s/f | Text Field 101089 | `r28.item_047` |
| 048 | Cubierta 200 | Sirenas /licuadoras (así en la hoja) | 02 | Salas de máquinas | 2 | Check Box 235 | Text Field 101090 | s/f | Text Field 101091 | `r28.item_048` |
| 049 | Cubierta 200 | Equipo EEBD | 01 | Sala máquinas BB | 2 | Check Box 236 | Text Field 101092 | sept 2026 | Text Field 101093 | `r28.item_049` |
| 050 | Cubierta 200 | Equipo EEBD | 01 | Sala máquinas Eb | 2 | Check Box 237 | Text Field 101094 | sept 2026 | Text Field 101095 | `r28.item_050` |
| 051 | Cubierta 200 | Manta antifuego | 01 | Cocina Eb | 2 | Check Box 238 | Text Field 101096 | s/f | Text Field 101097 | `r28.item_051` |
| 052 | Cubierta 200 | Detector de humo | 01 | Cabina tripulación cuadra Eb | 2 | Check Box 239 | Text Field 101098 | s/f | Text Field 101099 | `r28.item_052` |
| 053 | Cubierta 200 | Detector de humo | 01 | Sala tableros eléctricos | 2 | Check Box 240 | Text Field 1010100 | s/f | Text Field 1010101 | `r28.item_053` |
| 054 | Cubierta 200 | Rociador | 02 | Cocina | 2 | Check Box 241 | Text Field 1010102 | s/f | Text Field 1010103 | `r28.item_054` |
| 055 | Cubierta 200 | Rociador | 01 | Comedor tripulación | 2 | Check Box 242 | Text Field 1010104 | s/f | Text Field 1010105 | `r28.item_055` |
| 056 | Cubierta 200 | Rociador | 01 | Cabinas tripulación proa Eb | 2 | Check Box 243 | Text Field 1010106 | s/f | Text Field 1010107 | `r28.item_056` |
| 057 | Cubierta 200 | Rociador | 01 | Cabinas tripulación cuadra Eb | 2 | Check Box 244 | Text Field 1010108 | s/f | Text Field 1010109 | `r28.item_057` |
| 058 | Cubierta 200 | Chaleco salvavidas luz y pito | 02 | Cabinas tripulación BB | 2 | Check Box 245 | Text Field 10101010 | s/f | Text Field 10101011 | `r28.item_058` |
| 059 | Cubierta 200 | Chalecos salvavidas luz y pito | 01 | Cabinas tripulación proa EB | 2 | Check Box 246 | Text Field 10101012 | s/f | Text Field 10101013 | `r28.item_059` |
| 060 | Cubierta 200 | Chalecos salvavidas luz y pito | 02 | Cabinas tripulación máquinas | 2 | Check Box 247 | Text Field 10101014 | s/f | Text Field 10101015 | `r28.item_060` |
| 061 | Cubierta 200 | Traje de bombero | 01 | Puente de gobierno | 2 | Check Box 248 | Text Field 10101016 | s/f | Text Field 10101017 | `r28.item_061` |
| 062 | Cubierta 200 | Línea de vida y arnés | 01 | Puente de gobierno | 2 | Check Box 249 | Text Field 10101018 | s/f | Text Field 10101019 | `r28.item_062` |
| 063 | Cubierta 200 | Equipo de respiración autónoma | 01 | Puente de gobierno | 2 | Check Box 250 | Text Field 10101020 | sept 2026 | Text Field 10101021 | `r28.item_063` |
| 064 | Cubierta 200 | Máscara y cilindro principal | 01 | Puente de gobierno | 2 | Check Box 251 | Text Field 10101022 | sept 2026 | Text Field 10101023 | `r28.item_064` |
| 065 | Cubierta 200 | Cilindro de respeto | 01 | Puente de gobierno | 2 | Check Box 252 | Text Field 10101024 | sept 2026 | Text Field 10101025 | `r28.item_065` |
| 066 | Cubierta 200 | Luces de bengala tipo paracaídas | 06 | Puente de gobierno | 2 | Check Box 253 | Text Field 10101026 | caduco | Text Field 10101027 | `r28.item_066` |
| 067 | Cubierta 200 | Señales fumígenas | 06 | Puente de gobierno | 3 | Check Box 254 | Text Field 10101028 | s/f | Text Field 10101030 | `r28.item_067` |
| 068 | Cubierta 200 | Extintor CO2 10 lbs | 01 | Puente de gobierno | 3 | Check Box 255 | Text Field 10101029 | sept 2026 | Text Field 10101031 | `r28.item_068` |
| 069 | Cubierta 200 | Extintor PQS 10 lbs | 01 | Puente de gobierno | 3 | Check Box 256 | Text Field 10101032 | sept 2026 | Text Field 10101034 | `r28.item_069` |
| 070 | Cubierta 200 | Extintor de PQS 10 lbs | 01 | Cubierta 01 popa | 3 | Check Box 257 | Text Field 10101033 | sept 2026 | Text Field 10101035 | `r28.item_070` |
| 071 | Cubierta 200 | Extintor PQS 5 lbs | 01 | Cabina 6 | 3 | Check Box 258 | Text Field 10101036 | sept 2026 | Text Field 10101038 | `r28.item_071` |
| 072 | Cubierta 200 | Extintor PQS 5 lbs | 01 | Cabina 7 | 3 | Check Box 259 | Text Field 10101037 | sept 2026 | Text Field 10101039 | `r28.item_072` |
| 073 | Cubierta 200 | Extintor PQS 5 lbs | 01 | Cabina 8 | 3 | Check Box 260 | Text Field 10101040 | sept 2026 | Text Field 10101041 | `r28.item_073` |
| 074 | Cubierta 200 | Extintor PQS 5 lbs | 01 | Cabina 9 | 3 | Check Box 261 | Text Field 10101042 | sept 2026 | Text Field 10101043 | `r28.item_074` |
| 075 | Cubierta 200 | Detector de humo | 01 | Cabina 6 | 3 | Check Box 262 | Text Field 10101044 | s/f | Text Field 10101045 | `r28.item_075` |
| 076 | Cubierta 200 | Detector de humo | 01 | Cabina 7 | 3 | Check Box 263 | Text Field 10101046 | s/f | Text Field 10101047 | `r28.item_076` |
| 077 | Cubierta 200 | Detector de humo | 01 | Cabina 8 | 3 | Check Box 264 | Text Field 10101048 | s/f | Text Field 10101049 | `r28.item_077` |
| 078 | Cubierta 200 | Detector de humo | 01 | Cabina 9 | 3 | Check Box 265 | Text Field 10101050 | s/f | Text Field 10101051 | `r28.item_078` |
| 079 | Cubierta 200 | Detector de humo | 01 | Puente de gobierno | 3 | Check Box 266 | Text Field 10101052 | s/f | Text Field 10101053 | `r28.item_079` |
| 080 | Cubierta 200 | Detector de humo | 01 | Cabina Capitán | 3 | Check Box 267 | Text Field 10101054 | s/f | Text Field 10101055 | `r28.item_080` |
| 081 | Cubierta 200 | Detector de humo | 01 | Cabina guía | 3 | Check Box 268 | Text Field 10101056 | s/f | Text Field 10101057 | `r28.item_081` |
| 082 | Cubierta 200 | Rociador | 01 | Cabina 6 | 3 | Check Box 269 | Text Field 10101058 | s/f | Text Field 10101059 | `r28.item_082` |
| 083 | Cubierta 200 | Rociador | 01 | Cabina 7 | 3 | Check Box 270 | Text Field 10101060 | s/f | Text Field 10101061 | `r28.item_083` |
| 084 | Cubierta 200 | Rociador | 01 | Cabina 8 | 3 | Check Box 271 | Text Field 10101062 | s/f | Text Field 10101063 | `r28.item_084` |
| 085 | Cubierta 200 | Rociador | 01 | Cabina 9 | 3 | Check Box 272 | Text Field 10101064 | s/f | Text Field 10101065 | `r28.item_085` |
| 086 | Cubierta 200 | Rociador | 02 | Puente de gobierno | 3 | Check Box 273 | Text Field 10101066 | s/f | Text Field 10101067 | `r28.item_086` |
| 087 | Cubierta 200 | Rociador | 01 | Cabina Capitán | 3 | Check Box 274 | Text Field 10101068 | s/f | Text Field 10101069 | `r28.item_087` |
| 088 | Cubierta 200 | Rociador | 01 | Cabina guía | 3 | Check Box 275 | Text Field 10101070 | s/f | Text Field 10101071 | `r28.item_088` |
| 089 | Cubierta 200 | Rociador | 02 | Pasillo cabinas | 3 | Check Box 276 | Text Field 10101072 | s/f | Text Field 10101073 | `r28.item_089` |
| 090 | Cubierta 200 | Parlamenta bote de rescate (así en la hoja) | 01 | Cubierta 01 popa | 3 | Check Box 277 | Text Field 10101074 | sept 2026 | Text Field 10101075 | `r28.item_090` |
| 091 | Cubierta 200 | Chalecos salvavidas luz y pito | 02 | Cabina 6 | 3 | Check Box 278 | Text Field 10101076 | s/f | Text Field 10101077 | `r28.item_091` |
| 092 | Cubierta 200 | Chalecos salvavidas luz y pito | 02 | Cabina 7 | 3 | Check Box 279 | Text Field 10101078 | s/f | Text Field 10101079 | `r28.item_092` |
| 093 | Cubierta 200 | Chalecos salvavidas luz y pito | 2 | Cabina 8 | 3 | Check Box 280 | Text Field 10101080 | s/f | Text Field 10101081 | `r28.item_093` |
| 094 | Cubierta 200 | Chalecos salvavidas luz y pito | 02 | Cabina 9 | 3 | Check Box 281 | Text Field 10101082 | s/f | Text Field 10101083 | `r28.item_094` |
| 095 | Cubierta 200 | Chalecos salvavidas luz y pito | 02 | Puente de gobierno | 3 | Check Box 282 | Text Field 10101084 | s/f | Text Field 10101085 | `r28.item_095` |
| 096 | Cubierta 200 | Chalecos salvavidas luz y pito para niños | 04 | Puente de gobierno | 3 | Check Box 283 | Text Field 10101086 | s/f | Text Field 10101087 | `r28.item_096` |
| 097 | Cubierta 200 | Chalecos salvavidas luz y pito | 01 | Cabina Capitán | 3 | Check Box 284 | Text Field 10101088 | s/f | Text Field 10101089 | `r28.item_097` |
| 098 | Cubierta 200 | Chalecos salvavidas luz y pito | 01 | Cabina guía | 3 | Check Box 285 | Text Field 10101090 | s/f | Text Field 10101091 | `r28.item_098` |
| 099 | Cubierta 200 | Hacha contra incendio | 01 | Cubierta 01 popa | 3 | Check Box 286 | Text Field 10101092 | s/f | Text Field 10101093 | `r28.item_099` |
| 100 | Cubierta 200 | Aro salvavidas simple | 01 | Cubierta 01 popa | 3 | Check Box 287 | Text Field 10101094 | s/f | Text Field 10101095 | `r28.item_100` |
| 101 | Cubierta 200 | Aro salvavidas simple | 01 | Cubierta 01 popa | 3 | Check Box 288 | Text Field 10101096 | s/f | Text Field 10101097 | `r28.item_101` |
| 102 | Cubierta 200 | Aro salvavidas con luz y rabiza | 01 | Puente de gobierno Bb | 3 | Check Box 289 | Text Field 10101098 | s/f | Text Field 10101099 | `r28.item_102` |
| 103 | Cubierta 200 | Aro salvavidas con luz y rabiza | 01 | Puente de gobierno Eb | 3 | Check Box 290 | Text Field 101010100 | s/f | Text Field 101010101 | `r28.item_103` |
| 104 | Cubierta 200 | SART batería | 01 | Puente de gobierno | 4 | Check Box 291 | Text Field 101010102 | 9/2025 | Text Field 101010103 | `r28.item_104` |
| 105 | Cubierta 200 | Radio bidireccional #1 batería | 01 | Puente de gobierno | 4 | Check Box 292 | Text Field 101010104 | Recargable | Text Field 101010105 | `r28.item_105` |
| 106 | Cubierta 200 | Radio bidireccional #2 batería | 01 | Puente de gobierno | 4 | Check Box 293 | Text Field 101010106 | 10 / 2027 | Text Field 101010107 | `r28.item_106` |
| 107 | Cubierta 200 | Lámpara Aldis | 1 | Puente de gobierno | 4 | Check Box 294 | Text Field 101010108 | s/f | Text Field 101010109 | `r28.item_107` |
| 108 | Cubierta 300 (sol) | EPIRB batería | 01 | Cubierta de sol | 4 | Check Box 295 | Text Field 1010101010 | nov 2025 | Text Field 1010101011 | `r28.item_108` |
| 109 | Cubierta 300 (sol) | Candado hidrostático EPIRB | 01 | Cubierta de sol | 4 | Check Box 296 | Text Field 1010101012 | Oct 2026 | Text Field 1010101013 | `r28.item_109` |
| 110 | Cubierta 300 (sol) | Balsa salvavidas 01 | 01 | Cubierta de sol Eb | 4 | Check Box 297 | Text Field 1010101014 | sept 2026 | Text Field 1010101015 | `r28.item_110` |
| 111 | Cubierta 300 (sol) | Candado hidrostático | 01 | Cubierta de sol Eb | 4 | Check Box 298 | Text Field 1010101016 | Oct 2026 | Text Field 1010101017 | `r28.item_111` |
| 112 | Cubierta 300 (sol) | Balsa salvavidas 02 | 01 | Cubierta de sol Bb | 4 | Check Box 299 | Text Field 1010101018 | sept 2026 | Text Field 1010101019 | `r28.item_112` |
| 113 | Cubierta 300 (sol) | Candado hidrostático | 01 | Cubierta de sol Bb | 4 | Check Box 300 | Text Field 1010101020 | Oct 2026 | Text Field 1010101021 | `r28.item_113` |
| 114 | Cubierta 300 (sol) | Extintor PQS 10 lbs | 01 | Cubierta de sol | 4 | Check Box 301 | Text Field 1010101022 | sept 2026 | Text Field 1010101023 | `r28.item_114` |

Notas de la tabla:

- Los nombres de campo no siguen el número de ítem. El ítem 035 usa Check Box 223 y el 036 usa Check Box 155, intercalados. No existen Check Box 154 ni los Text Field 101062 y 101063. En la página 3, los ítems 067 a 072 alternan los nombres (10101028/10101030, 10101029/10101031, …). La correspondencia de la tabla se hizo por posición (coordenada y), no por nombre, y se verificó por página: 34, 32, 37 y 11 ítems.
- Los ítems 061 a 107 (puente de gobierno, cabinas 6 a 9, cabina del Capitán y del guía, cubierta 01 popa) quedan bajo el rótulo "CUBIERTA 200" porque la hoja no imprime otro rótulo entre el 039 y el 108. Para el recorrido por ubicación se propone agrupar por la columna UBICACIÓN, no por el rótulo (D-17).
- Hay referencias que ya están vencidas o vencen este mes al 29-oct-2026: "caduco" (066, luces de bengala), "9/2025" (104, SART), "nov 2025" (108, batería EPIRB), 31 ítems con "sept 2026" y 3 con "Oct 2026". Es una razón más para que no se precarguen como respuesta. Los formatos de fecha son irregulares ("sept 2026", "Oct 2026", "9/2025", "10 / 2027", "nov 2025"); se propone normalizar a `mm/aaaa`.
- "Recargable" (105) no es una fecha. Se propone un valor explícito `recargable` en lugar de una caducidad.
- El ítem 090 ("Parlamenta bote de rescate", así en la hoja) tiene la referencia "sept 2026"; conviene confirmar que la fecha corresponde a ese equipo.

**Validación propuesta al enviar el R-28.**

- Encabezado completo.
- Los 114 ítems con estado (`conforme` o `novedad`, o `no_revisado` con motivo).
- Caducidad confirmada en los ítems que la tienen.
- Observación en cada novedad y en cada caducidad vencida.
- Firma del marinero de primera de puente.

El recorrido muestra separados los ítems revisados, los pendientes y los que tienen novedad, y puede continuarse en otra sesión. Guardar un ítem no envía el registro.

Filas documentadas: 10 en la matriz (3 de encabezado, 3 patrones por ítem, 1 dato sin campo PDF y 3 firmas) y 114 en la tabla de ítems. Los 348 campos del PDF quedan cubiertos.

---

## 3. Decisiones pendientes con el responsable del SGS

Cada decisión incluye la pregunta concreta, la opción que se propone y qué cambia en el sistema según la respuesta. Mientras no haya respuesta, el sistema aplica la opción propuesta (o, cuando se indica, solo avisa sin bloquear).

| Id | Tema | Pregunta concreta | Opción propuesta | Qué cambia en el sistema según la respuesta |
|---|---|---|---|---|
| D-00 | Formatos vigentes | ¿R-14, R-16, R-23 y R-28 siguen vigentes en edición 00, vigencia 01-05-2025? | Sí, se usan las plantillas actuales | Si hay edición nueva: cambiar la plantilla en `assets/ism/templates`, regenerar las definiciones, crear `R-xx.v2` del esquema y conservar la versión anterior para los registros ya hechos |
| D-01 | OBS en R-14 | El formato tiene una fila "OBS:" bajo la ronda, pero no tiene campo, y no hay espacio para las novedades de zarpe, arribo y fondeado. ¿Dónde deben constar las observaciones? | Página anexa al final del PDF, con el encabezado del formato, fecha, hora, lugar, embarcación y quién llenó. En la fila "OBS:" de la hoja se escribe "Ver anexo" cuando hay novedades | **Sí al anexo**: se implementa como está descrito en 2.1. **Prefiere solo la fila OBS**: se dibuja un resumen en esa fila (cabe una línea, unos 100 caracteres) y lo demás queda solo en el registro digital. **Quiere un campo OBS por sección**: habría que modificar el formato oficial (nueva edición, D-00) |
| D-02 | "No aplica" en R-14 | ¿En qué puntos se permite "No aplica"? | Hoy se permite en los 30 puntos, con motivo obligatorio. Se propone permitirlo **por sección según el momento**: por ejemplo, en un chequeo de zarpe, "Previo al arribo" y "Buque fondeado" no aplican en bloque, con un solo motivo. Dentro de la ronda de seguridad, no permitirlo | Se cambia `allowNa` por punto en `R-14.v1.json` (pasa a `v2` si cambia el comportamiento) y se agrega `allowNaSection`. La validación al enviar usa la nueva regla. Si se decide "no aplica" solo por sección, desaparece el botón en cada punto |
| D-03 | Firma del tripulante de guardia (R-14) | El formato no tiene recuadro de firma para el tripulante de guardia, que es quien hace el chequeo. ¿Basta su identidad autenticada o debe firmar? | Basta la identidad autenticada (nombre, cargo, fecha y hora de envío), impresa en el anexo, sin firma dibujada | **Debe firmar**: se agrega una firma en el anexo (etapa `tripulacion`, `stages.tripulacion = 1`) y el envío la exige. **Basta la identidad**: queda como está. En cualquier caso, la identidad solo vale si la cuenta es personal (D-10) |
| D-04 | R-14 y el zarpe | ¿Completar o aprobar el R-14 autoriza el zarpe? | No. Se asume que no lo autoriza; la decisión es del Capitán. La app muestra el aviso y no tiene ningún estado "zarpe autorizado" | **Si debe autorizar**: se agrega una acción explícita del Capitán, "Autorizo el zarpe", separada de la firma del registro, con hora e identidad, y el R-14 tendría que estar completo antes de la hora de zarpe. **Si no**: queda como está |
| D-05 | Reglas de descanso y día 31 (R-23) | (a) ¿Qué reglas de cumplimiento se aplican? Se propone confirmar las del Convenio 180 de la OIT y STCW A-VIII/1: mínimo 10 h de descanso en 24 h y 77 h en 7 días; como máximo dos periodos de descanso, uno de al menos 6 h; no más de 14 h entre periodos. (b) ¿Las columnas "no para uso del tripulante" registran horas de trabajo en 24 h y horas de descanso en 7 días? (c) La cuadrícula tiene solo 30 días: ¿cómo se registra el día 31? | (a) Se programan como **alerta**, sin bloquear el envío, hasta que se confirmen. (b) Sí, como sugiere el texto en rojo, y se calculan solas. (c) Una página anexa con el día 31 con la misma cuadrícula y columnas, o el día 31 en "Observaciones" de la fila 30 | (a) Si se confirman como bloqueo, el envío exige observación o justificación en los días que no cumplen. (b) Cambia el cálculo de `oficina_24h` y `oficina_7d`, o quedan manuales para el Capitán. (c) Se agrega la página anexa al PDF, o el sistema escribe el resumen del día 31 en la fila 30 |
| D-06 | Redondeo de tramos (R-23) | La hoja marca horas completas. Si alguien descansa de 01:30 a 06:00, ¿se marca la hora 01? | Se marca la casilla solo si la hora completa es de descanso. Los tramos exactos, con minutos, se imprimen en una página anexa | Cambia la función que convierte `r23.tramos[]` en `r23.dia_DD.h_HH`. Si se marca por mayoría (30 min o más), el total de la columna "descanso 24h" puede no coincidir con los tramos exactos; el anexo lo aclara |
| D-07 | Significado de "PRUEBA" (R-28) | La columna "PRUEBA" tiene una sola casilla por ítem y la hoja no la define (verificado en las 4 páginas). ¿Marcarla significa "revisado y conforme", "se hizo la prueba de funcionamiento" o "prueba hidrostática o de servicio vigente"? ¿Cómo se registra un equipo con novedad? | Marcada = revisado físicamente y conforme. Con novedad, la casilla queda sin marcar y la novedad va a OBSERVACIÓN y al anexo. "No revisado" se distingue en la app (sin marca y con motivo), porque en papel no se puede distinguir de "con novedad" | Cambia cómo se imprime `r28.item_NNN.estado`. Si "PRUEBA" es una prueba de funcionamiento que solo aplica a algunos equipos (detectores, bombas, luces, radios), se marcan esos ítems como "con prueba" y los demás llevan solo inspección visual |
| D-08 | Plan S/M/SM/A/B (R-16) | La hoja dice "(Semanal, Mensual, Semestral, Anual, Bianual)". ¿B significa cada dos años (bienal) o dos veces al año? ¿Hay un plan de mantenimiento por equipo que diga qué chequeo toca cada período? | B = bienal (cada dos años), porque dos veces al año ya es SM. Si existe el plan por equipo, se carga y se usa para "Mis tareas" (pendientes y vencidos por equipo) | Con el plan cargado, el sistema propone el chequeo que toca y marca vencidos. Sin plan, el campo `plan` lo elige quien registra y "Mis tareas" solo muestra los equipos sin registro del mes |
| D-09 | Orden de firmas por formato | ¿Qué participantes firman cada formato y en qué orden? Hoy el sistema impone a todos tripulación → Capitán → Persona Designada (y el Capitán puede firmar ya en borrador) | R-14: Capitán → Persona Designada (sin firma de tripulación). R-16: encargado del equipo → Capitán → Persona Designada (en la hoja el Capitán aparece primero a la izquierda; se pide confirmar). R-23: tripulante → Capitán → Persona Designada. R-28: marinero de primera de puente → Capitán → Persona Designada | Se configura por formato: participantes, secciones editables por participante y orden. El Capitán deja de poder firmar en borrador si el orden lo prohíbe. La devolución vuelve a la etapa que corresponda y no siempre a borrador |
| D-10 | Cuentas personales | Hoy hay cuentas compartidas por cargo (por ejemplo `timonel@`, `maquinas@`). Una firma dibujada en una cuenta compartida no prueba quién firmó. ¿Se crea una cuenta por persona? | Sí: una cuenta por tripulante, con PIN corto para cambiar de usuario rápido en una tablet compartida, y el cargo como dato de la cuenta. Mientras tanto, con cuenta compartida se pide el nombre de quien hace la guardia y queda junto a la cuenta (`filledBy.accountName` y `filledBy.name`) | **Con cuentas personales**: las firmas, "Mis tareas" y el R-23 se ligan a la persona; "Obligatorios del mes" del R-23 pasa de "por cargo" a "por persona". **Sin cuentas personales**: la identidad queda como "cuenta + nombre declarado", lo que no cumple el punto 11 de la solicitud |
| D-11 | Edición por etapa | ¿Puede el Capitán o la Persona Designada corregir datos del tripulante durante su revisión, o solo devolver? | Solo devolver, con motivo y sección afectada. Ninguno corrige datos ajenos. Su corrección es la devolución | Hoy `canEdit` permite al Capitán editar en `por_capitan` y a la Persona Designada en `por_oficina`. Si se decide "solo devolver", se quita ese permiso. Si se permite corregir, la edición invalida las firmas previas (cambio de esta entrega) y queda en el historial |
| D-12 | Correcciones después de archivar | Un registro archivado es inmutable. ¿Cómo se corrige un error detectado después? | Registro de corrección nuevo, ligado al original, que repite el circuito de firmas. El original queda intacto, con la marca "corregido por …" | Se agrega la acción "Crear corrección" en el archivo y el vínculo entre registros. No cambia la inmutabilidad |
| D-13 | Encargado del equipo (R-16) | La columna dice "NOMBRE DEL ENCARGADO" y hoy se llena con el cargo ("Jefe de Máquinas"). ¿Va el nombre de la persona o el cargo? ¿Quién firma "ENCARGADO EQUIPO" si varias personas intervienen en el mes? | Nombre de la persona responsable del equipo en el período, y la firma del encargado al cerrar el mes. Cada intervención guarda además su responsable, que se imprime en el anexo | Cambia `equipment.json` (responsable por equipo) o se toma de la cuenta personal (D-10). Si cada intervención se firma, se agrega una firma por fila en el anexo |
| D-14 | Período y cierre del R-16 | ¿El R-16 es mensual por equipo (como cuenta hoy "Obligatorios del mes") o una hoja continua por equipo hasta llenar 13 filas? ¿Un equipo sin intervenciones en el mes requiere registro? ¿Las horas del equipo son obligatorias? | Mensual por equipo. Sin intervenciones: se declara "sin intervenciones" con motivo. Horas obligatorias en equipos con horómetro (motores y generadores) | Cambia "Mis tareas" y "Obligatorios del mes" (73 equipos por mes), la validación de envío y si hace falta una segunda hoja |
| D-15 | Número IMO (R-23) | ¿Cuál es el número IMO de la Y/P Treasure of Galápagos I? ¿Se imprime en todos los R-23? | Configurarlo una vez y llenarlo solo | Se agrega a la configuración de la embarcación y se precarga en Text Field 1011 |
| D-16 | Fecha y caducidad (R-28) | Si el recorrido mensual se hace en varias sesiones, ¿qué fecha va en "FECHA:"? ¿Las caducidades se escriben como mes y año? ¿Qué significan "s/f" y "sept 2026" (caducidad o última recarga)? | "FECHA:" = día en que se completó el recorrido; el detalle por ítem va en el anexo. Caducidad en `mm/aaaa`; "s/f" = sin fecha visible | Cambia el formato del campo, la alerta de vencimiento y lo que se imprime en la hoja |
| D-17 | Agrupación del recorrido (R-28) | La hoja agrupa por cubierta, pero los ítems 061 a 107 (puente, cabinas 6 a 9, cubierta 01) quedan bajo "CUBIERTA 200". ¿Se recorre por ubicación real? | Recorrido por ubicación (puente de gobierno, sala de máquinas, cabinas, cocina…), conservando el número de ítem y la página del formato | Solo cambia la presentación; el PDF queda igual |

---

Resumen de cobertura: R-14, 43 filas (65 campos PDF); R-16, 16 filas de matriz y 13 de correspondencia (139 campos PDF); R-23, 15 filas de matriz y 30 por día (850 campos PDF); R-28, 10 filas de matriz y 114 de ítems (348 campos PDF).
