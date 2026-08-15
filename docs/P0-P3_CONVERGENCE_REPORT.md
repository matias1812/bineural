# CONVERGENCIA P0 → P3 — ESTADO CONSOLIDADO

**Fecha:** 2026-08-15 · **Último estado verificado:** 102/102 tests, APK release firmada, web desplegada en producción.

---

## 1. RESUMEN EJECUTIVO

El proyecto pasó de "arquitectura separada Web/PWA/APK sin cierre" a **cierre lógico completo de las fases P0→P3**:

- **P0 — Auditoría:** arquitectura por capas (Core → Session → Platform Adapter) con core protegido.
- **P1 — Forense de duplicación de audio:** `start()` idempotente, teardown síncrono, cancelación de automation, RestoreGate (dedup del unlock).
- **P2 — Forense de Media Session/Focus/Notificación:** owner único por recurso (1 MediaSession, 1 notificación, 1 alarma por evento), watchdog de audio focus, estado UNKNOWN endurecido.
- **P3 — Persistencia y crash recovery:** sesión de audio restaurada tras kill del proceso, sanitización de datos corruptos, un solo disparo por evento multi-tab.

**Regla de oro cumplida en todas las fases:** `cymatics.js`, `wavefield.js`, `simulation.js`, `experiments.js` **intactos** (CLEAN vs HEAD en cada fase). Todo el trabajo se hizo en la capa de plataforma/sesión.

## 2. ESTADO CONSOLIDADO POR ÁREA

| Área | P0 | P1 | P2 | P3 | Estado actual |
|---|---|---|---|---|---|
| Integridad del core | PASS | PASS | PASS | PASS | ✅ **PASS** (4 archivos protegidos CLEAN) |
| Arquitectura de capas | PASS | PASS | PASS | PASS | ✅ **PASS** |
| Detección Web/PWA/APK | PASS | PASS | PASS | PASS | ✅ **PASS** (Chrome Android ≠ APK, probado) |
| Audio — pipeline único | — | PASS | PASS | PASS | ✅ **PASS** (`start()` doble, lock/unlock ×3, stop→start) |
| Audio — lifecycle/restore | CONDITIONAL | PASS | PASS | PASS | ✅ **PASS** (RestoreGate + teardown síncrono) |
| Audio — focus | — | — | CONDITIONAL→PASS | PASS | ✅ **PASS** (watchdog + UNKNOWN endurecido + contadores) |
| Media Session (owner único) | — | — | PASS | PASS | ✅ **PASS** (1 sesión en el SO) |
| Notificaciones (owner único) | PASS | PASS | PASS | PASS | ✅ **PASS** (web ≠ PWA ≠ APK, local ≠ push) |
| Alarmas (owner por plataforma) | PASS | PASS | PASS | PASS | ✅ **PASS** (nativo en APK, web external, I6) |
| Permisos | PASS | PASS | PASS | PASS | ✅ **PASS** (solicitud en el momento correcto, estados honestos) |
| ICS | PASS | PASS | PASS | PASS | ✅ **PASS** (RFC 5545, UID estable, LOCATION/SEQUENCE) |
| Persistencia web | — | — | — | PASS | ✅ **PASS** (sanitización + backup/import) |
| Crash recovery audio nativo | — | — | — | PASS | ✅ **PASS** (START_STICKY restaura la sesión) |
| Concurrencia multi-tab | — | — | PASS | PASS | ✅ **PASS** (Web Locks + confirmación en store) |
| Tests | 82 | 89 | 95 | **102** | ✅ **PASS** (102/102) |
| Build web + APK | PASS | PASS | PASS | PASS | ✅ **PASS** (vite + APK release firmada) |
| Despliegue | — | — | PASS | PASS | ✅ **PASS** (producción activa) |
| Hardware físico | NOT_TESTED | NOT_TESTED | NOT_TESTED | NOT_TESTED | ⚠️ **NOT_TESTED** (plan en §4) |

## 3. CRITERIOS DE CIERRE ACUMULADOS (los 4 reportes)

| # | Criterio | Estado |
|---|---|---|
| 1 | CORE INTEGRITY = PASS (sin diffs en los 4 archivos protegidos) | ✅ |
| 2 | Un solo pipeline de audio por sesión (nunca 2) | ✅ (forense + `live=[1,2]` constante) |
| 3 | `start()`/`stop()`/`pause()`/`resume()` idempotentes | ✅ |
| 4 | lock/unlock idempotente (primer lock = locks 2 y 3) | ✅ (`sid=1` estable) |
| 5 | Restore único tras unlock (5+ vías colapsadas a 1) | ✅ (RestoreGate) |
| 6 | Una sola MediaSession ante el SO (APK) | ✅ (dumpsys: solo `Vyneural`) |
| 7 | Una sola notificación player por sesión | ✅ (id=1001, sin duplicados) |
| 8 | Una sola alarma por evento (nunca web+nativa en paralelo) | ✅ (external + dueño puro) |
| 9 | Audio focus con watchdog y estado UNKNOWN seguro | ✅ (pausa + re-adquisición + CRITICAL visible) |
| 10 | Media Session controla, nunca crea audio | ✅ |
| 11 | Notificación representa, nunca inicia reproducción | ✅ |
| 12 | Persistencia tolerante a corrupción (NaN, fuera de rango, basura en IndexedDB) | ✅ |
| 13 | Crash recovery: proceso muerto → sesión restaurada con las mismas frecuencias | ✅ (210/216 Hz restauradas en vivo) |
| 14 | Concurrencia: un solo disparo por evento multi-tab | ✅ |
| 15 | Tests automatizados PASS | ✅ 102/102 |
| 16 | Build web + APK OK | ✅ (release firmada CN=Bineural) |
| 17 | Producción desplegada y verificada | ✅ (vyneural-six.vercel.app, 200) |
| 18 | Hardware físico (Bluetooth, kill OEM, reinicio, fabricantes) | ⚠️ NOT_TESTED |

**Conclusión:** **cierre lógico COMPLETO (P0–P3)**. El único pendiente para "production-ready" es la validación física.

## 4. PLAN DE HARDWARE FÍSICO (bloqueante de production-ready, no de cierre lógico)

Lo que falta probar en dispositivo real y cómo (dispositivo Android ≥ 11 recomendado):

| # | Prueba | Dispositivo/entorno | Qué validar | Evidencia esperada |
|---|---|---|---|---|
| H1 | Audio con pantalla bloqueada real | Teléfono físico, auriculares | Audio continúa, controles de lock screen (play/pause/stop) | Observación + dumpsys en USB |
| H2 | Controles Bluetooth / headset | Auriculares BT reales | MediaSession responde a BT (play/pause/next) | Observación |
| H3 | Kill del proceso por el OEM | Batería restringida / recents swipe | El servicio se restaura con las mismas frecuencias (P3) | logcat `restart START_STICKY` |
| H4 | Alarma con la app cerrada | Físico + reboot | AlarmManager dispara tras app cerrada y tras reinicio (BootReceiver) | Notificación real + logcat |
| H5 | Interferencia audible tras lock/unlock | Físico, auriculares | Sin batido/acoplamiento (confirmación auditiva del fix P1) | Observación |
| H6 | PWA instalada real | Chrome Android, instalar PWA | Lifecycle PWA ≠ web, notificación PWA, Media Session | Observación |
| H7 | Fabricantes variados (Samsung, Xiaomi, Pixel) | 2-3 dispositivos | Permisos, servicios foreground, Doze/batería | Observación por fabricante |
| H8 | Orientación/ducking con llamada real | Físico, SIM | LOSS_TRANSIENT/CAN_DUCK durante llamada entrante | Observación + contadores de focus |

**Criterio:** cada prueba H se marca `PASS`/`FAIL` con evidencia (video/logcat/dumpsys). Las que no puedan ejecutarse quedan `NOT_TESTED` con el dispositivo faltante.

## 5. PRÓXIMOS PASOS (P4+ sugeridos, sin orden de prioridad)

1. **Validación física** (plan §4) — el único bloqueante real de production-ready.
2. **Exposición del Core / API científica** (el dictamen apuntaba a "serialización JS↔WASM, exposición del Core"): decidir si el motor se expone como módulo/WASM para integraciones externas, con pruebas de corrupción/concurrencia.
3. **Push remoto** (opcional, requiere backend/FCM): hoy correctamente no implementado; documentado qué cambiaría.
4. **Distribución** (Play Store / firma de actualizaciones / versionCode management).
5. **Telemetría local** (sin servidores): métricas de uso y diagnóstico exportables para soporte.

## 6. DOCUMENTOS DE REFERENCIA

- `docs/P0_AUDIT.md` — auditoría y causa raíz del acoplamiento (M1/M2/M3)
- `docs/P1_AUDIO_FORENSIC_REPORT.md` — duplicación de pipelines + lifecycle hardening
- `docs/P2_MEDIA_SESSION_FORENSIC_REPORT.md` — owners únicos + audio focus + UNKNOWN
- `docs/P3_PERSISTENCE_CRASH_RECOVERY_REPORT.md` — persistencia, corrupción, crash recovery
- `docs/P2_VALIDATION_REPORT.md`, `PLATFORM_CAPABILITY_MATRIX.md`, `TEST_MATRIX.md`, `PERMISSION_MATRIX.md`, `NOTIFICATION_ARCHITECTURE.md`, `AUDIO_LIFECYCLE_REPORT.md`, `MEDIA_SESSION_REPORT.md`
