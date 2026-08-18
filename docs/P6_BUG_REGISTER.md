# P6 — Bug Register

> Registro de hallazgos de la auditoría P6. Formato: ID · Severidad · Plataforma
> · Área. Estado: OPEN. **No se corrigió nada en esta pasada** (regla P6: primero
> evidencia, luego aprobación, luego fixes).

---

## P6-FEAT-001 — Las alarmas del generador (web/PWA) no se sincronizan al backend

- **ID:** P6-FEAT-001
- **Severidad:** **P2**
- **Plataforma:** Web / PWA (APK usa AlarmManager nativo, correcto)
- **Área:** Sync / Alarmas / Backend

**PRECONDITION:**
- Sesión iniciada en el backend.
- El usuario crea una alarma desde el generador (modal "Recordatorio de sesión").

**ACTION:**
1. Crear alarma en el generador (web) con sesión iniciada.
2. Abrir `/cuenta.html` → sección "Mis alarmas".
3. Consultar `/api/v1/alarms` con el token del usuario.

**EXPECTED:**
- La alarma creada aparece en "Mis alarmas" y viaja a otros dispositivos
  (el copy de la UI lo afirma: "alarmas … viven en la nube y en este dispositivo").

**ACTUAL:**
- "Mis alarmas" → "Sin alarmas sincronizadas"; `/api/v1/alarms` → `[]`; la
  alarma vive solo en el AlarmManager local (IndexedDB + espejo localStorage).

**EVIDENCE:**
- `createAlarm` (src/api/alarms.js) no tiene ningún llamador en el generador:
  `grep -rn "createAlarm\|/api/v1/alarms" src/` → solo definiciones.
- `enqueueLocal` (cola de sync) sin llamadores: `grep -rn "enqueueLocal" src/`
  → solo la definición en `api/sync.js`.
- Runtime: alarma local `al-msxga4kh-ybqde` creada y disparada (`fires:1`) con
  sesión activa; `GET /api/v1/alarms` → `[]` (R24).
- `src/cuenta.js:14` importa `listAlarms`/`deleteAlarm` (solo lectura/borrado).

**ROOT CAUSE:**
- El flujo de creación de alarmas del generador (`alarmSave` en main.js) persiste
  solo en el `AlarmManager` local y en el AlarmManager nativo (APK); nunca emite
  `POST /api/v1/alarms`. La cola de sincronización prevista (`api/sync.js`) está
  inerte (P6-FEAT-002), así que no hay reenvío.

**IMPACT:**
- Las alarmas web/PWA no persisten entre dispositivos ni aparecen en la cuenta;
  el copy de la UI sobrevende la sincronización. P2: "sync incorrecto".

**REPRODUCIBILITY:** 2/2 (alarma pre-login y con sesión activa).

**STATUS:** FIXED — `alarmSave` ahora emite `createAlarm` con sesión y guarda
el `cloudId` en la copia local; el borrado (`cancelAlarmBoth`) emite
`deleteAlarm`. El backend además tiene un scheduler server-side
(`app/services/reminders.py`) que envía el Web Push a la hora exacta (FASE 24).

---

## P6-FEAT-002 — Cola de sincronización definida pero inerte

- **ID:** P6-FEAT-002
- **Severidad:** **P3** (deuda de arquitectura; sin efecto observable hoy)
- **Plataforma:** Web / PWA / APK
- **Área:** Sync

**PRECONDITION:** — (estructural)

**ACTION:** revisar llamadores de `enqueueLocal`/`drainQueue` en `src/`.

**EXPECTED:** la cola offline con reintentos documentada en `api/sync.js`.

**ACTUAL:** `enqueueLocal` y `drainQueue` no se llaman en ningún módulo; el
"sync" es POST directos best-effort (favoritos/frecuencias) sin cola ni
reintentos; `syncNow()` envía la cola (vacía) y hace pull.

**EVIDENCE:** `grep -rn "enqueueLocal" src/` → solo `api/sync.js`.

**ROOT CAUSE:** la sincronización se implementó por flujo dedicado
(`fav-sync.js`) en vez de la cola genérica.

**IMPACT:** sin reintentos offline para mutaciones; sin cola para alarmas
(relacionado con P6-FEAT-001); el estado SYNCED/ERROR no refleja una cola.

**REPRODUCIBILITY:** n/a (estructural).

**STATUS:** OPEN — decidir: usar la cola o eliminarla/documentarla como deuda.

---

## P6-ALARM-003 — Chime de alarma en foreground es sonido sin gesto

- **ID:** P6-ALARM-003
- **Severidad:** **P3** (política; requiere aprobación explícita)
- **Plataforma:** Web / PWA
- **Área:** Alarmas / Audio (P0.6 literal)

**PRECONDITION:**
- Alarma con pestaña en primer plano, permiso de notificación concedido.

**ACTION:** disparar una alarma con la pestaña visible.

**EXPECTED (P0.6 literal):** `notification = YES · audio = NO · session = NO`.

**ACTUAL:** notificación + toast + **chime de 3 notas** (Web Audio,
`playChime()`, gain 0.14, contexto temporal cerrado a los 4 s). La sesión
binaural **no** se inicia (verificado: `causal:[]`, `ctx:none`, `osc:0`).

**EVIDENCE:** runtime R11; `main.js` onFire: `playChime()` + toast; test `B1`
protege únicamente contra `start()`.

**ROOT CAUSE:** decisión de diseño documentada ("el chime es el complemento
audible, no el aviso"; "una alarma que solo suena sin nada visible no es una
alarma").

**IMPACT:** cumple "alarma → no PLAY de sesión"; produce sonido de aviso sin
gesto. Si la regla P0.6 se lee en forma literal ("audio = NO"), exige eliminar
el chime o pedir gesto.

**REPRODUCIBILITY:** 1/1.

**STATUS:** OPEN — decisión de producto (mantener chime = aprobación explícita;
o quitar/silenciar el chime en foreground).

---

## P6-UX-001 — Listas de /cuenta no se refrescan tras crear

- **ID:** P6-UX-001
- **Severidad:** **P3**
- **Plataforma:** Web / PWA
- **Área:** UX / Cuenta

**PRECONDITION:** sesión iniciada en `/cuenta.html`.

**ACTION:** expandir "＋ Crear itinerario", completar y guardar.

**EXPECTED:** la lista "Mis itinerarios" muestra el nuevo itinerario al momento.

**ACTUAL:** la lista sigue mostrando "Sin itinerarios creados" hasta recargar la
página (el dato sí está en el backend — `GET /api/v1/itineraries` lo devuelve).

**EVIDENCE:** runtime — tras crear "Rutina P6": UI "Sin itinerarios creados";
API `itineraries` → `[{"name":"Rutina P6",…}]`; tras reload: UI lo muestra.

**ROOT CAUSE:** el render de la lista no se invoca tras el POST exitoso
(`createItinerary` no dispara el re-render de la sección; solo `alert` en
error).

**IMPACT:** percepción de pérdida de datos hasta recargar (falso negativo).

**REPRODUCIBILITY:** 1/1.

**STATUS:** FIXED — verificado en código actual: el submit de `#itinerary-form`
(`cuenta.js:667-674`) llama `await createItinerary(...)` y luego `loadAll()`;
`api/client.js` invalida el caché GET de `/api/v1/itineraries` tras cada
mutación (`mutating()` → `invalidateCache(path)`), así que el `loadAll()`
posterior pega al backend en vez de servir la lista vieja cacheada.

---

## P6-OBS-001 — AudioContext web queda en `running` tras STOP/PAUSE

- **ID:** P6-OBS-001
- **Severidad:** **P3** (observación, sin audio audible)
- **Plataforma:** Web / PWA
- **Área:** Audio (higiene de estado)

**PRECONDITION:** PLAY y luego STOP o PAUSE en web.

**ACTUAL:** `ctx.state === 'running'` persistente (silencioso: osc 0, gain al
piso 0.0001, rms 0). No hay fuentes ni salida audible.

**EXPECTED:** contexto suspendido o, al menos, ganancia 0 (ya cumplido).

**ROOT CAUSE:** decisión de mantener el contexto vivo para no exigir un nuevo
gesto al reanudar (YouTube-like) y para reusarlo en el chime de alarma.

**IMPACT:** ninguno auditivo; solo consumo mínimo de CPU y lectura de diagnóstico
("ctx running" con sesión detenida).

**REPRODUCIBILITY:** siempre.

**STATUS:** OPEN — documentar o suspender el contexto tras un idle largo.

---

## P6-POL-001 — Política de resume de audio focus en APK (watchdog H7)

- **ID:** P6-POL-001
- **Severidad:** **P3** (política explícita documentada; NO es reproducción
  espontánea)
- **Plataforma:** APK
- **Área:** Audio Focus

**PRECONDITION:** sesión nativa en `shouldPlay`; otra app toma el foco
(LOSS/LOSS_TRANSIENT).

**ACTION:** la app externa libera el foco.

**EXPECTED (P0.5 literal):** "NO PLAY" salvo política explícita de resume.

**ACTUAL:** pausa al perder foco; el watchdog re-solicita con backoff (1.2 s →
5 s tope) y, al recuperar GAIN, reanuda el **mismo** motor (nunca una segunda
sesión). `pushToJs=false` evita el bucle pause→play del sync JS.

**EVIDENCE:** `AudioForegroundService.handleFocusChange` + `scheduleFocusReacquire`;
`AudioFocusHelper` (held como fuente de verdad operacional); contadores
`focusReacquireCount`/`focusUnknownCount` visibles en diagnóstico.

**ROOT CAUSE:** política deliberada de reproductor (Spotify-like): la sesión que
el usuario dejó sonando se auto-recupera al volver el foco.

**IMPACT:** cumple la salvedad de P0.5 (política explícita de resume). Aprobación
explícita requerida si se quiere recuperación únicamente manual.

**REPRODUCIBILITY:** por diseño (verificado en emulador en etapas previas).

**STATUS:** OPEN — aprobar política o pedir resume manual.

---

## Conteo

- **P0: 0**
- **P1: 0**
- **P2: 0** (P6-FEAT-001 resuelto)
- **P3: 4 OPEN** (FEAT-002, ALARM-003, OBS-001, POL-001) **+ 1 FIXED** (UX-001)
