// ---------------------------------------------------------------- Alarmas y notificaciones
// Recordatorios de sesión en Vyneural: notificaciones web/PWA, sonido sutil en
// primer plano, respaldo con Google Calendar y .ics (Apple Calendar/Outlook),
// y persistencia en localStorage. Las notificaciones locales solo pueden
// dispararse mientras la página está abierta; por eso se ofrecen los respaldos
// de calendario para cuando el navegador está cerrado o el SO suspende la PWA.

const LS_ALARMS = 'vyneural_alarms';

// ---------------------------------------------------------------- Almacenamiento
export function getAlarms() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_ALARMS) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveAlarms(alarms) {
  try {
    localStorage.setItem(LS_ALARMS, JSON.stringify(alarms));
  } catch {
    /* almacenamiento lleno o no disponible */
  }
}

export function removeAlarm(id) {
  saveAlarms(getAlarms().filter((a) => a.id !== id));
}

// ---------------------------------------------------------------- Soporte y permisos
export function notificationSupported() {
  return typeof Notification !== 'undefined';
}

// El usuario puede desactivar los permisos desde ⋯ → Permisos de la web.
// Con permisos desactivados no se piden y los recordatorios solo suenan en
// primer plano (campanita), sin notificación del sistema.
export function permissionsDisabled() {
  try {
    return localStorage.getItem('vyneural_perms_disabled') === 'true';
  } catch {
    return false;
  }
}

export function isIos() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

// iOS 16.4+ solo permite notificaciones web si la PWA está instalada en la
// pantalla de inicio.
export function iosNeedsInstall() {
  return isIos() && !isStandalone();
}

export async function requestPermission() {
  // 1. Prioridad: Bridge Nativo (APK Android)
  // El bridge nativo (Fase 10) permite distinguir DENIED de DENIED_PERMANENTLY
  // y reaccionar con un botón a Ajustes. Se aceptan los dos bridges: el
  // wrapper `window.AndroidBridge` (inyectado en onPageFinished) y el raw
  // `AndroidBridgeNative` (addJavascriptInterface, presente desde el arranque).
  const b =
    typeof window !== 'undefined' &&
    window.AndroidBridge && typeof window.AndroidBridge.postMessage === 'function'
      ? window.AndroidBridge
      : typeof window !== 'undefined' && window.AndroidBridgeNative && typeof window.AndroidBridgeNative.postMessage === 'function'
        ? window.AndroidBridgeNative
        : null;
  if (b) {
    try {
      let res = b.postMessage(JSON.stringify({ command: 'REQUEST_NOTIFICATION_PERMISSION' }));
      if (typeof res === 'string') {
        try { res = JSON.parse(res); } catch (e) { res = null; }
      }
      // El bridge responde OK si lanzó la petición; el resultado real llega
      // por getPlatformInfo() en el siguiente tick.
      if (res && (res.status === 'OK' || res.status === 'PENDING')) return 'pending';
    } catch (e) {
      /* fallback a Notification API web */
    }
  }

  if (!notificationSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

// ---------------------------------------------------------------- Deep link de la alarma
// https://vyneural.cl/?freq={base}&beat={ritmo}&wave={onda}&autostart=true
// Origen/path base sin tocar location: en el navegador `location` no se puede
// reemplazar y en Node no existe. El parámetro explícito manda cuando se pasa
// (tests headless y en navegador); si no, se usa location real y como último
// recurso la referencia de producción.
function baseOrigin(origin) {
  if (origin !== undefined && origin !== null) return origin;
  return typeof location !== 'undefined' ? location.origin : 'https://vyneural.cl';
}
function basePathname(pathname) {
  if (pathname !== undefined && pathname !== null) return pathname;
  return typeof location !== 'undefined' ? location.pathname : '/';
}

export function getAlarmDeepLink(alarm, origin, pathname) {
  const p = new URLSearchParams();
  p.set('freq', String(Math.round(alarm.freq * 10) / 10));
  p.set('beat', String(Math.round(alarm.beat * 10) / 10));
  if (alarm.wave && alarm.wave !== 'sine') p.set('wave', alarm.wave);
  p.set('autostart', 'true');
  return `${baseOrigin(origin)}${basePathname(pathname)}?${p.toString()}`;
}

// ---------------------------------------------------------------- Notificación
// ¿Hay un Service Worker registrado (para notificaciones "de sistema")?
export function swReady() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

// ¿El navegador soporta Web Push? (PushManager + SW). Que sea "soporta" no
// significa que funcione: sin backend configurado nunca llega ningún push.
export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'serviceWorker' in navigator
  );
}

// ¿La plataforma soporta acciones en las notificaciones (botones)?
// Android sí; Safari iOS no; no mostrar botones que no pueden funcionar.
export function notificationActionsSupported() {
  return typeof Notification !== 'undefined' && 'actions' in Notification.prototype;
}

// ── Providers de notificación (NotificationManager, P0) ─────────────────────
// Se separan los dos caminos para que NotificationManager elija por
// capacidad: el Service Worker tiene prioridad; sin SW se usa el camino local.
//
// Limitación honesta (compartida por ambos): ninguna de las dos dispara con
// la app cerrada; para eso hace falta Web Push con backend
// (docs/system-robustness.md) o el respaldo de calendario (Google Calendar /
// .ics).

// Notificación vía Service Worker (registration.showNotification). Preferida:
// el click y las acciones los gestiona el SW (notificationclick), incluso si
// la pestaña está congelada en ese momento.
export function showSwNotification(alarm) {
  if (permissionsDisabled()) return false;
  if (!notificationSupported() || Notification.permission !== 'granted') return false;
  try {
    const url = getAlarmDeepLink(alarm);
    const actions = notificationActionsSupported()
      ? [
          { action: 'start', title: '▶ Iniciar sesión' },
          { action: 'dismiss', title: 'Descartar' },
        ]
      : [];

    navigator.serviceWorker.ready
      .then((reg) => {
        if (!reg.showNotification) throw new Error('sin showNotification');
        reg.showNotification('¡Hora de tu sesión en Vyneural!', {
          body: `Toca aquí para iniciar tu frecuencia de ${Math.round(alarm.freq)} Hz.`,
          tag: `vyneural-alarm-${alarm.id}`,
          icon: 'icons/icon-192.png',
          badge: 'icons/icon-192.png',
          renotify: true,
          data: { url },
          actions,
        });
      })
      .catch(() => showLocalNotification(alarm, url));
    return true;
  } catch {
    return false;
  }
}

// Camino local: new Notification() con onclick en la página (fallback sin SW).
export function showLocalNotification(alarm, url = getAlarmDeepLink(alarm)) {
  if (permissionsDisabled()) return false;
  if (!notificationSupported() || Notification.permission !== 'granted') return false;
  try {
    const n = new Notification('¡Hora de tu sesión en Vyneural!', {
      body: `Toca aquí para iniciar tu frecuencia de ${Math.round(alarm.freq)} Hz.`,
      tag: `vyneural-alarm-${alarm.id}`,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      renotify: true,
    });
    n.onclick = () => {
      if (n.close) n.close();
      window.focus();
      location.href = url;
    };
    return true;
  } catch {
    return false;
  }
}

// Comodín con prioridad al Service Worker (compatibilidad con fireAlarm y
// con la documentación previa).
export function showSessionAlarmNotification(alarm) {
  return showSwNotification(alarm);
}

// Dispara la alarma: notificación si la pestaña está oculta, sonido sutil si
// está en primer plano. Devuelve 'background' | 'foreground' | null.
// Con permisos desactivados, incluso en segundo plano solo suena la campanita
// (el sonido del navegador, que no requiere permiso).
export function fireAlarm(alarm) {
  if (document.hidden && !permissionsDisabled()) {
    return showSessionAlarmNotification(alarm) ? 'background' : 'foreground';
  }
  playChime();
  return 'foreground';
}

// Campanita sutil con Web Audio (sin despertar el motor binaural).
// Reutiliza el contexto del motor si ya existe y está running (evita un
// segundo AudioContext efímero cuando hay sesión activa); si no, crea uno
// temporal que se cierra a los 4 s.
export function playChime() {
  try {
    const probe =
      typeof window !== 'undefined' && typeof window.__audioProbe === 'function'
        ? window.__audioProbe()
        : null;
    const engineCtx =
      probe && probe.ctx && probe.ctx.state === 'running' ? probe.ctx : null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx && !engineCtx) return;
    const ctx = engineCtx || new Ctx();
    const own = !engineCtx;
    const now = ctx.currentTime;
    const notes = [880, 1174.66, 1567.98]; // A5 · D6 · G6
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const t0 = now + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.14, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 1.2);
    });
    if (own) {
      window.setTimeout(() => {
        ctx.close().catch(() => {});
      }, 4000);
    }
  } catch {
    /* sin soporte de audio */
  }
}

// ---------------------------------------------------------------- Próxima ocurrencia
// Próxima vez (hoy si todavía no pasó, si no mañana) para "HH:MM".
export function nextAlarmAt(time) {
  const [h, m] = String(time || '08:00').split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

// ---------------------------------------------------------------- Respaldo calendario
// días de repetición (JS Date.getDay: 0=domingo…6=sábado) → BYDAY de RFC 5545.
const ICS_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// Regla de repetición semanal para una rutina, o null si no repite.
// Ej.: [1, 4] (lunes y jueves) → 'FREQ=WEEKLY;BYDAY=MO,TH'.
export function rruleFor(days) {
  if (!days || days.length === 0) return null;
  // Orden semanal natural (L M X J V S D) para un BYDAY legible.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const sorted = [...new Set(days)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return `FREQ=WEEKLY;BYDAY=${sorted.map((d) => ICS_DAY[d]).join(',')}`;
}

function fmtGCal(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

export function buildGoogleCalendarUrl(alarm, origin) {
  const start = new Date(alarm.nextAt);
  const mins = alarm.minutes > 0 ? alarm.minutes : 60;
  const end = new Date(start.getTime() + mins * 60000);
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Sesión de ondas binaurales en Vyneural (${Math.round(alarm.freq)} Hz)`,
    dates: `${fmtGCal(start)}/${fmtGCal(end)}`,
    details: `Inicia tu sesión de ${Math.round(alarm.freq)} Hz en Vyneural:\n${getAlarmDeepLink(alarm, origin)}`,
    location: baseOrigin(origin),
  });
  // Rutina recurrente → el evento se repite semanalmente en los días elegidos.
  const rrule = rruleFor(alarm.days);
  if (rrule) p.set('recur', rrule);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

function escIcs(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

export function buildIcs(alarm, origin) {
  const start = new Date(alarm.nextAt);
  const mins = alarm.minutes > 0 ? alarm.minutes : 60;
  const end = new Date(start.getTime() + mins * 60000);
  const fmt = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
  const rrule = rruleFor(alarm.days);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vyneural//Recordatorio de sesión//ES',
    'BEGIN:VEVENT',
    `UID:${alarm.id}@vyneural.cl`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    // Rutina recurrente → RRULE semanal (RFC 5545) con los días elegidos.
    ...(rrule ? [`RRULE:${rrule}`] : []),
    `SUMMARY:${escIcs(`Sesión de ondas binaurales (${Math.round(alarm.freq)} Hz)`)}`,
    `DESCRIPTION:${escIcs(`Inicia tu sesión de ${Math.round(alarm.freq)} Hz en Vyneural: ${getAlarmDeepLink(alarm)}`)}`,
    // P2 (FASE 10): LOCATION y SEQUENCE explícitos (RFC 5545). UID estable por
    // alarma → un evento solo puede descargarse una vez (el mismo evento
    // re-generado tiene el mismo UID; los calendarios lo deduplican).
    `LOCATION:${escIcs(baseOrigin(origin))}`,
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

// Exporta el .ics con UN toque. Prioridades:
//   1. APK: bridge nativo SAVE_ICS → guarda el archivo en la carpeta
//      Descargas del dispositivo (el DownloadManager no puede con blob: URLs).
//   2. Web: Web Share API Level 2 (móvil abre el share sheet del sistema) y,
//      si no hay share, descarga directa del blob. En iOS el atributo
//      `download` no funciona en blob URLs; el share es el camino automático.
export async function downloadIcs(alarm) {
  const fileName = `vyneural-${String(alarm.time || 'sesion').replace(':', '-')}-${Math.round(alarm.freq)}hz.ics`;
  const ics = buildIcs(alarm);

  // 1. Dentro de la APK: guardar vía bridge (Descargas del dispositivo).
  if (typeof window !== 'undefined' && window.AndroidBridge && typeof window.AndroidBridge.postMessage === 'function') {
    try {
      const res = JSON.parse(window.AndroidBridge.postMessage(JSON.stringify({ command: 'SAVE_ICS', payload: { fileName, content: ics } })));
      if (res && res.status === 'OK') return true;
    } catch {
      /* bridge ocupado/error: seguir con el camino web */
    }
  }

  try {
    // 2. Web Share API Level 2: compartir el archivo .ics (móvil y algunos
    //    escritorios). Un toque → el usuario elige dónde guardarlo.
    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.share) {
      const file = new File([ics], fileName, { type: 'text/calendar' });
      // canShare puede lanzar (navegadores viejos / contexto no seguro):
      // cualquier fallo aquí debe caer a la descarga, no romper el botón.
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Recordatorio Vyneural · ${Math.round(alarm.freq)} Hz`,
          text: `Sesión de ondas binaurales de ${Math.round(alarm.freq)} Hz el ${new Date(alarm.nextAt).toLocaleString()}`,
        });
        return true; // compartido/guardado
      }
    }
  } catch {
    /* el usuario canceló el share o no soporta files: seguir con la descarga */
  }

  // 3. Fallback: descarga directa (escritorio / sin Web Share). Se prueban
  //    DOS vías (blob URL y data URL) porque hay navegadores/WebViews que
  //    bloquean una y aceptan la otra; con `download` el archivo se guarda
  //    como .ics sin abrir nada.
  const tryDownload = (href) => {
    try {
      const a = document.createElement('a');
      a.href = href;
      a.download = fileName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    } catch {
      return false;
    }
  };
  let ok = false;
  try {
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    ok = tryDownload(url);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch {
    ok = false;
  }
  if (!ok) {
    ok = tryDownload('data:text/calendar;charset=utf-8,' + encodeURIComponent(ics));
  }
  return ok;
}


