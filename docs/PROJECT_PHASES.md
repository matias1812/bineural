# Vyneural — Refinamiento del proyecto por fases

Documento vivo: cada fase tiene un objetivo concreto, un criterio de cierre
objetivo y entregables. Nada se declara PASS sin **implementado + ejecutado +
observado + verificado**.

## Estado actual (v1.1, agosto 2026)

- **MVP desplegado**: https://www.vyneural.cl — web, PWA y APK para
  Android con un único core de simulación protegido.
- **104/104 tests** · core intacto (audio/cym/wavefield/simulation/experiments).
- **APK release**: audio nativo (Foreground Service + MediaSession), alarmas con
  la app cerrada, crash recovery, rutina recurrente con vibración, canal de
  notificaciones v2, panel de diagnóstico con traza de navegación.
- **Rutina (repetición por días + página `/rutina`) = exclusiva de la APK.**
  Web/PWA: recordatorios de una sola vez (límite real del navegador, honesto).
- **Pendiente físico**: H4 (Bluetooth real), H5 (kill OEM), H6 (reboot real),
  H7 en físico (ducking por llamada real), H8 (WebAPK real) e iOS Safari.

## Regla transversal

- No mezclar plataformas: Web/PWA nunca usan NativeBridge ni AlarmManager;
  la APK no finge ser web con más permisos.
- No "arreglar" una plataforma rompiendo otra.
- No prometer lo que no está verificado.

---

## Fase 1 — Cierre de la experiencia de rutina (APK) — EN CURSO

**Objetivo**: que la rutina recurrente sea clara y usable dentro de la APK.

- [x] Selector de días en el modal (L M X J V S D), solo APK.
- [x] AlarmManager guarda el patrón; se reprograma solo al dispararse y tras reboot.
- [x] Vibración (canal `bineural_alarms_v2`).
- [x] Página `/rutina` (APK-only) con lista, repetición, próxima sesión y borrado.
- [x] Tira semanal (L M X J V S D) en los recordatorios del generador.
- [x] Cadena verificada por bridge: alarma exacta → proceso muerto → notificación → reprogramación.
- [ ] **Cadena verificada por UI** (modal real, no bridge): guardar rutina con días desde la interfaz.
- [ ] Recurrencia visible en `/diagnostico` (próximas ocurrencias por alarma).

**Cierre**: cadena UI verificada en emulador + diagnóstico con ocurrencias futuras.

## Fase 2 — Control web (API + Media Session) — EN CURSO

**Objetivo**: una API de control limpia y verificable para integraciones.

- [x] `window.__vyneuralControl` (play/pause/toggle/next/prev/seekBy).
- [ ] Documentar el contrato en `docs/` (endpoints, estados, errores).
- [ ] Verificar que los controles de Media Session (play/pause/next/prev del
      sistema y del auricular) usan la MISMA ruta que la API (sin bifurcaciones).
- [ ] Pruebas de contrato (payload, idempotencia, estados).

**Cierre**: contrato documentado + prueba de que el teclado/MediaSession/API
controlan el mismo motor sin duplicación.

## Fase 3 — Calidad de audio Web/PWA

**Objetivo**: eliminar los últimos síntomas de acoplamiento/interferencia en web.

- [ ] Forense de la ruta audible (motor → transport → ancla → MediaSession) con
      mediciones de `AudioContext.state` ante interacción/minimizar/lock.
- [ ] Medir continuidad de muestra y estabilidad de frecuencia en sesiones largas
      (≥ 30 min).
- [ ] Corregir SOLO la transición responsable del transitorio al pulsar Play
      (sin fades arbitrarios).

**Cierre**: mediciones registradas + ausencia de glitches en sesión larga.

## Fase 4 — Hardware físico (desbloquea "producción")

**Objetivo**: cerrar los `NOT_TESTED` que separan el MVP de producción.

- [ ] **H4** Bluetooth real (controles + desconexión/reconexión) — checklist en
      `docs/HARDWARE_TEST_PLAN.md`.
- [ ] **H7** llamada de operadora real (duck/pausa + recuperación).
- [ ] **H5** fabricantes que matan apps (Samsung/Xiaomi/Huawei): confirmar si las
      alarmas sobreviven o documentar el paso por ajustes de batería.
- [ ] **H6** reboot real → `BootReceiver` reprograma → alarma dispara.
- [ ] **H8** instalación WebAPK real desde Chrome del teléfono.
- [ ] iOS Safari: camino `direct` + ancla muda (único camino web sin validar).

**Cierre**: cada ítem con evidencia (captura + estado) o `NOT_TESTED` con el
dispositivo exacto que falta.

## Fase 5 — Push real (requiere backend)

**Objetivo**: avisos con la app/pestaña cerrada también en web/PWA.

- [ ] Decidir backend mínimo (Vercel Serverless / worker) + suscripción Web Push.
- [ ] Contrato documentado: quién crea la notificación, qué requiere servidor,
      qué requiere FCM, qué sigue siendo local.
- [ ] NO declarar "notificaciones background completas" si solo existe local.

**Cierre**: una notificación push REAL llega con la pestaña cerrada + contrato
documentado en `NOTIFICATION_ARCHITECTURE.md`.

## Fase 6 — Distribución y crecimiento

- [ ] Google Play (firma, aab, política de privacidad).
- [ ] Widget de Android con la próxima sesión de la rutina.
- [ ] Exportar la rutina recurrente a Google Calendar/.ics desde la APK (RRULE ya
      implementado en el generador; verificar el flujo nativo).
- [ ] Sincronización opcional entre dispositivos (solo si el usuario la activa).

**Cierre**: APK en Play con actualizaciones automáticas + widget verificado.

---

## Criterio global de cierre

Cada fase se cierra cuando: código implementado → ejecutado → observado →
verificado, con evidencia. Lo no verificable en el entorno actual se marca
`NOT_TESTED` con el dispositivo exacto que falta (nunca PASS por "parece bien").
