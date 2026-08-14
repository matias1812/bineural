// ---------------------------------------------------------------- Alarmas y notificaciones
// Recordatorios de sesión en Vyneural: notificaciones web/PWA, sonido sutil en
// primer plano, respaldo con Google Calendar y .ics (Apple Calendar/Outlook),
// y persistencia en localStorage. Las notificaciones locales solo pueden
// dispararse mientras la página está abierta; por eso se ofrecen los respaldos
// de calendario para cuando el navegador está cerrado o el SO suspende la PWA.

const LS_ALARMS = 'vyneural_alarms';
const ALARM_GRACE_MS = 5 * 60 * 1000; // 5 minutos de tolerancia si se abre tarde
const CHECK_INTERVAL_MS = 15000; // revisar alarmas cada 15 s

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
export function showSessionAlarmNotification(alarm) {
  if (permissionsDisabled()) return false;
  if (!notificationSupported() || Notification.permission !== 'granted') return false;
  try {
    const url = getAlarmDeepLink(alarm);
    const n = new Notification('¡Hora de tu sesión en Vyneural!', {
      body: `Toca aquí para iniciar tu frecuencia de ${Math.round(alarm.freq)} Hz.`,
      tag: `vyneural-alarm-${alarm.id}`,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
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
export function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
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
    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 4000);
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

export function downloadIcs(alarm) {
  const blob = new Blob([buildIcs(alarm)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vyneural-${alarm.time.replace(':', '-')}-${Math.round(alarm.freq)}hz.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------------------------------------------------------------- Watcher
// Revisa las alarmas guardadas y dispara las vencidas (con tolerancia de 5
// minutos si la app se abrió tarde). Las alarmas son de un solo disparo:
// se eliminan al dispararse o al quedar obsoletas. Cada vez que el watcher
// cambia el almacenamiento llama a onSync para que la UI se mantenga al día.
export function startAlarmWatcher(onFire, onSync) {
  let running = true;
  function tick() {
    if (!running) return;
    const now = Date.now();
    let changed = false;
    for (const alarm of getAlarms()) {
      if (now >= alarm.nextAt) {
        changed = true;
        if (now - alarm.nextAt <= ALARM_GRACE_MS) {
          try {
            onFire(alarm);
          } catch {
            /* el callback no debe romper el ciclo */
          }
        }
      }
    }
    if (changed) {
      saveAlarms(getAlarms().filter((a) => a.nextAt > now));
      if (typeof onSync === 'function') {
        try {
          onSync();
        } catch {
          /* no romper el ciclo */
        }
      }
    }
  }
  tick();
  const iv = setInterval(tick, CHECK_INTERVAL_MS);
  return () => {
    running = false;
    clearInterval(iv);
  };
}
