# 🎉 Vyneural — Anuncio de lanzamiento del MVP

> Frecuencias binaurales generadas en tiempo real en tu navegador, tu teléfono
> o tu app Android. Sin cuentas, sin servidores, sin grabaciones.

**URL**: https://vyneural-six.vercel.app
**APK Android**: https://vyneural-six.vercel.app/vyneural.apk
**Versión**: 1.0.0 (firmada con el keystore de producción)

## Qué es

Vyneural genera ondas binaurales en tiempo real con la Web Audio API. El cerebro
percibe la diferencia entre dos tonos (uno por oído) como un latido: un
instrumento de relajación, meditación, foco y descanso con visualizadores
interactivos (cimática y campo de gotas).

## Un producto, tres runtimes

| Plataforma | Audio | Alarmas/recordatorios | Notificaciones |
|---|---|---|---|
| **Web** | Web Audio (tiempo real, sin grabaciones) | Scheduler del navegador (pestaña viva) — una sola vez | Web, como está |
| **PWA** (instalable) | Web Audio + controles en pantalla de bloqueo | Scheduler del navegador — una sola vez | Web + service worker |
| **APK Android** | Motor nativo (Foreground Service + MediaSession) | **AlarmManager del teléfono** (avisa con la app cerrada) + **rutina recurrente por días** (con vibración) | Nativas y autónomas |

## Estado de validación (honesto)

| Área | Estado |
|---|---|
| Lógica: tests automatizados | ✅ 104/104 |
| Core de simulación/audio | ✅ protegido (cero modificaciones accidentales) |
| Web: audio ruta única, sin cortes por interacción | ✅ verificado (Chrome real) |
| PWA: instalabilidad + runtime standalone | ✅ 14/14 checks |
| APK: audio nativo + MediaSession + alarmas con app cerrada | ✅ verificado (emulador Android 14) |
| Crash recovery (proceso eliminado → la sesión se restaura) | ✅ verificado |
| Llamada entrante (duck/pausa + recuperación) | ✅ verificado (emulador, llamada real simulada) |
| Hardware físico (Bluetooth, kill OEM, doze, iOS Safari) | ⚠️ `NOT_TESTED` — pendiente de dispositivo físico |

> **Transparencia**: el MVP está validado en emulador y navegador real. Antes de
> declararlo producción, faltan pruebas en un teléfono físico (controles
> Bluetooth, llamada real, fabricantes que matan apps) y Safari iOS. No se
> declara PASS lo que no se probó.

## La APK

- **Archivo**: `public/vyneural.apk` (2.9 MB) — firmada con el keystore de
  producción (CN=Bineural, OU=Vyneural).
- **Contenido**: crash recovery, defensa de audio focus (incl. UNKNOWN),
  alarmas nativas con notificación autónoma, **rutina recurrente por días con
  vibración** (se reprograma sola con la app cerrada), MediaSession con
  controles en pantalla de bloqueo, historial de navegación con BACK correcto,
  panel de diagnóstico.
- **Permisos**: solo se piden bajo demanda (notificaciones al guardar una
  alarma; alarmas exactas si se usan). Si denegás notificaciones, la app te lo
  avisa y te ofrece abrir los ajustes.
- **Privacidad**: 100 % offline, nada sale del dispositivo.

## Cómo usarlo

1. **Web**: abrí https://vyneural-six.vercel.app, elegí un estado, ponete
   audífonos y tocá ▶.
2. **PWA**: en el navegador del celular, menú → "Añadir a pantalla de inicio".
3. **APK**: descargá https://vyneural-six.vercel.app/vyneural.apk (el enlace
   está en el pie de página) e instalala.

## Limitaciones conocidas (documentadas)

- Las notificaciones locales de **Web/PWA** no pueden dispararse con la pestaña
  cerrada (límite del navegador); el respaldo de calendario (`.ics`) avisa a la
  hora exacta. El aviso con la app cerrada (Push) requiere un servidor y aún no
  está configurado.
- **APK**: la notificación de alarma sí es autónoma (AlarmManager del teléfono),
  incluso con la app cerrada o el proceso eliminado.
- **Rutina (repetición por días) = exclusiva de la APK**: la web/PWA solo
  ofrece recordatorios de una sola vez (el navegador no puede reprogramar con
  la pestaña cerrada). La página `/rutina` y el selector de días solo existen
  dentro de la APK.
- Hardware físico e iOS: pendientes (ver arriba).

## Estado del proyecto

- Cierre lógico **P0→P4**: PASS (core protegido, 104/104 tests, matrices Web /
  PWA / APK / permisos / notificaciones / Media Session / audio / persistencia).
- Plan de hardware: `docs/HARDWARE_TEST_PLAN.md` (H1–H8).
- Próximos pasos tras el MVP: validación en hardware físico, iOS Safari, y
  (si se quiere) notificaciones push con servidor.
