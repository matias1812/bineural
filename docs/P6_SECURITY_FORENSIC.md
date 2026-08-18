# P6 — Security Forensic

> Auditoría de las superficies de seguridad del sistema integrado (frontend +
> puente nativo + backend + SW). Complementa `docs/seguridad-iso27001.md`.

---

## 1. Secretos y datos de usuario

| Superficie | Hallazgo | Estado |
|---|---|---|
| Token access/refresh | Memoria + localStorage (`vyneural_access_token`, `vyneural_refresh_token`); nunca en URLs | PASS |
| Refresh | Promesa única compartida (sin carreras ni bucles); 401 → refresh 1 vez → si falla `clearSession()` + `ApiError(UNAUTHORIZED)` | PASS |
| VAPID keys | Solo en `.env` del backend; el frontend recibe únicamente la public key vía `/api/v1/push/status` | PASS |
| JWT | Firmado con secret del backend; `sub/type/iat/exp/sid` (rotación de sesión) | PASS |
| Contraseñas | Argon2 (`argon2-cffi` en requirements); cambio exige re-autenticación y cierra otras sesiones | PASS |
| `.env.local` / `.env` | Ambos gitignored (verificable en git status: no aparecen) | PASS |
| Sanitización UI | `escapeHtml`/`textContent` en todo dato de usuario (favoritos, frecuencias, itinerarios, comentarios) | PASS |

## 2. AuthN / AuthZ

- Registro con doble contraseña + términos; verificación de correo (token 24 h);
  recuperación (token 30 min); cambio de contraseña con re-auth.
- Endpoints protegidos: `favorites`, `frequencies`, `itineraries`, `alarms`,
  `push/*`, `sync` → 401 sin token (verificado en vivo: `/api/v1/push/status`
  → 401 sin Authorization).
- **Aislamiento de datos entre usuarios**: no verificado con dos usuarios en
  vivo (BLOCKED por un solo preview), pero el backend filtra por `user_id` en
  cada router (revisión de código del repo backend). La query directa a PG
  confirma que cada entidad tiene su `user_id`.

## 3. Puente nativo (APK)

- Whitelist estricta: `BridgeCommands.isAllowed` (23 comandos) — todo lo demás
  → `DENIED`.
- Payload validado: solo objetos planos, claves `^[A-Za-z0-9_]+$` (doble
  validación JS `validateCommand` + Kotlin).
- Aislamiento de fallos: excepción del bridge → `BRIDGE_ERROR`; la UI web sigue.
- El bridge **nunca** acepta comandos arbitrarios; `START_BACKGROUND_AUDIO` solo
  es alcanzable desde el gesto de play del JS.
- `addJavascriptInterface` expuesto como `AndroidBridgeNative` con whitelist de
  métodos (sin reflect sobre WebView).

## 4. Service Worker

- Fetch handler: solo `GET`, mismo origen; navegaciones red-first con fallback
  cache; estáticos cache-first con revalidación.
- Message bus: solo mensajes con `type` conocido (`DIAGNOSTICS`,
  `PUSH_CONFIG`); el resto se ignora (validación de schema).
- Push handler: solo `showNotification`; **nunca** audio (REGLA DE ORO).
- `notificationclick`: navega a `ndata.url` / action URL; `autostart` solo
  prepara la UI (nunca reproduce).

## 5. WebView (APK)

- `mediaPlaybackRequiresUserGesture = true` (sin autoplay).
- `allowFileAccessFromFileURLs = true` — necesario para módulos ES sobre
  file://; limitado a file→file (100 % offline, sin acceso universal).
- Enlaces http(s) → navegador del sistema (nunca dentro del WebView).
- Sin `setAllowUniversalAccessFromFileURLs`.

## 6. Backend

- CORS por `CORS_ORIGINS` del `.env` (no wildcard en producción).
- Errores normalizados (no exponen stack/SQL/JWT en la respuesta; verificado en
  vivo con 400).
- Rate limiting/429: no observado en el código del backend (no verificado —
  NOT_TESTED; sin evidencia de límites por IP).
- Comentarios (página pública): POST requiere auth (revisión).

## 7. Riesgos abiertos / notas

| Ítem | Clase | Nota |
|---|---|---|
| Token en localStorage | Riesgo XSS residual (toda app SPA) | Mitigado por sanitización auditada; ISO 27001 documenta el control |
| Rate limiting backend | NOT_TESTED | Sin evidencia de límites por IP/endpoint en el repo backend |
| Exposición de `AndroidBridgeNative` en el WebView | Controlado | Interfaz mínima, sin reflect; whitelist |
| Datos entre usuarios (cross-user) | NOT_TESTED en vivo | Diseño filtra por `user_id`; pendiente prueba destructiva con 2 usuarios |

## 8. Conclusión

**PASS** — sin exposición de secretos, sin bypass de autenticación, sin datos de
otro usuario observables, sin entrada de stack trace/SQL/JWT en la UI. Pendientes
de ejecutar en entorno completo: rate limiting y prueba cross-user destructiva.
