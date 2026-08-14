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
export function getAlarmDeepLink(alarm) {
  const p = new URLSearchParams();
  p.set('freq', String(Math.round(alarm.freq * 10) / 10));
  p.set('beat', String(Math.round(alarm.beat * 10) / 10));
  if (alarm.wave && alarm.wave !== 'sine') p.set('wave', alarm.wave);
  p.set('autostart', 'true');
  return `${location.origin}${location.pathname}?${p.toString()}`;
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
function fmtGCal(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

export function buildGoogleCalendarUrl(alarm) {
  const start = new Date(alarm.nextAt);
  const mins = alarm.minutes > 0 ? alarm.minutes : 60;
  const end = new Date(start.getTime() + mins * 60000);
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Sesión de ondas binaurales en Vyneural (${Math.round(alarm.freq)} Hz)`,
    dates: `${fmtGCal(start)}/${fmtGCal(end)}`,
    details: `Inicia tu sesión de ${Math.round(alarm.freq)} Hz en Vyneural:\n${getAlarmDeepLink(alarm)}`,
    location: location.origin,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

function escIcs(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

export function buildIcs(alarm) {
  const start = new Date(alarm.nextAt);
  const mins = alarm.minutes > 0 ? alarm.minutes : 60;
  const end = new Date(start.getTime() + mins * 60000);
  const fmt = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vyneural//Recordatorio de sesión//ES',
    'BEGIN:VEVENT',
    `UID:${alarm.id}@vyneural.cl`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${escIcs(`Sesión de ondas binaurales (${Math.round(alarm.freq)} Hz)`)}`,
    `DESCRIPTION:${escIcs(`Inicia tu sesión de ${Math.round(alarm.freq)} Hz en Vyneural: ${getAlarmDeepLink(alarm)}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

// Exporta el .ics con UN toque: en móvil abre el share sheet del sistema
// (Guardar en Archivos / Calendario / Google Calendar) vía Web Share API, y
// en escritorio descarga el archivo directamente. En iOS el atributo
// `download` de los blob URLs no funciona en el navegador; el share es el
// camino "automático" para que el botón funcione siempre.
export async function downloadIcs(alarm) {
  const fileName = `vyneural-${String(alarm.time || 'sesion').replace(':', '-')}-${Math.round(alarm.freq)}hz.ics`;
  const ics = buildIcs(alarm);
  try {
    // Web Share API Level 2: compartir el archivo .ics (móvil y algunos
    // escritorios). Un toque → el usuario elige dónde guardarlo.
    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.share) {
      const file = new File([ics], fileName, { type: 'text/calendar' });
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
    /* el usuario canceló el share: seguir con la descarga */
  }
  // Fallback: descarga directa (escritorio / sin Web Share).
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return false;
}


