// scripts/alarm-chain-test.mjs
// Prueba de INTEGRACIÓN de la cadena de alarma de la APK (P4-A):
//
//   UI/bridge → AlarmScheduler → AlarmManager (RTC_WAKEUP) → PendingIntent
//   → AlarmReceiver (broadcast) → NotificationHelper (notificación nativa)
//
// Verifica con la APK CERRADA (proceso muerto) que:
//   1. el PendingIntent queda registrado en el reloj del sistema;
//   2. el SO despierta el proceso solo para el broadcast al dispararse;
//   3. aparece EXACTAMENTE UNA notificación nativa con el título esperado;
//   4. el registro persistente se consume (un solo disparo).
//
// Uso: node scripts/alarm-chain-test.mjs [delaySec]
// Requiere: emulador con la APK debug instalada y el WebView expuesto en el
// puerto 9222 (adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>).
import { execSync } from 'child_process';

const DELAY = parseInt(process.argv[2] || '75', 10); // segundos hasta la alarma
const ADB = process.env.ADB || `${process.env.LOCALAPPDATA}/Android/Sdk/platform-tools/adb`;
const TITLE = `Alarma P4-A ${Date.now().toString(36)}`;
const ALARM_ID = `p4a-${Date.now().toString(36)}`;

function adb(...args) {
  // Nunca lanza por exit code (p. ej. grep sin match): devuelve la salida.
  const q = args.map((a) => `"${String(a).replace(/"/g, '\\"')}"`).join(' ');
  try {
    return execSync(`"${ADB}" ${q}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return (e.stdout || '').toString().trim();
  }
}

function appPid() {
  const ps = adb('shell', 'ps -A | grep vyneural');
  return ps.split(/\s+/)[1] || null;
}

// Pre-flight: si la APK no está corriendo (el SO la mató o cerró), se
// arranca y se re-expone el socket CDP.
async function ensureAppUp() {
  if (!appPid()) {
    console.log('APK no está corriendo: arrancando…');
    adb('shell', 'am start -n com.vyneural.bineural/.MainActivity');
    await sleep(5000);
  }
  const pid = appPid();
  if (!pid) throw new Error('la APK no arrancó');
  adb('forward', '--remove', 'tcp:9222');
  adb('forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`);
  await sleep(1500);
  return pid;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function wsUrl() {
  const json = JSON.parse(execSync('curl -s http://localhost:9222/json', { encoding: 'utf8' }));
  const page = json.find((t) => t.type === 'page');
  if (!page) throw new Error('sin página CDP en 9222');
  return page.webSocketDebuggerUrl;
}

function evaluate(expr) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl());
    const t = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('timeout')); }, 8000);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === 1) {
        clearTimeout(t);
        try { ws.close(); } catch {}
        if (msg.error) return reject(new Error(JSON.stringify(msg.error)));
        const r = msg.result && msg.result.result;
        resolve(r && r.value !== undefined ? r.value : r);
      }
    };
    ws.onerror = () => { clearTimeout(t); reject(new Error('ws error')); };
  });
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// ── 0. Pre-flight: APK corriendo + CDP expuesto ────────────────────────────
await ensureAppUp();

// ── 1. Programar la alarma vía el bridge (mismo camino que la UI) ───────────
const atMs = Date.now() + DELAY * 1000;
const sched = await evaluate(`(() => {
  const b = window.AndroidBridge || window.AndroidBridgeNative;
  const r = b.postMessage(JSON.stringify({ command: 'SCHEDULE_ALARM', payload: {
    alarmId: '${ALARM_ID}', title: '${TITLE}', body: 'Prueba cadena con APK cerrada', atMs: ${atMs}
  }}));
  const o = typeof r === 'string' ? JSON.parse(r) : r;
  return JSON.stringify({ status: o && o.status, atMs: ${atMs} });
})()`);
const schedObj = JSON.parse(sched);
check('SCHEDULE_ALARM responde OK', schedObj.status === 'OK', `status=${schedObj.status}`);

// ── 2. PendingIntent registrado en AlarmManager ────────────────────────────
await sleep(1000);
const alarmDump = adb('shell', 'dumpsys alarm');
const pending = alarmDump.includes(`ALARM_${ALARM_ID}`);
check('PendingIntent en el reloj del SO', pending, `tag=*walarm*:...ALARM_${ALARM_ID}`);

// ── 3. Matar el proceso (APK "cerrada") ────────────────────────────────────
const pid = appPid();
check('proceso detectado', !!pid, `pid=${pid}`);
if (pid) {
  adb('shell', `su 0 kill -9 ${pid} 2>/dev/null || kill -9 ${pid}`);
  await sleep(1500);
  const alive = appPid();
  check('proceso muerto', !alive, alive ? `aún vivo: ${alive}` : 'kill confirmado');
}

// ── 4. Esperar el disparo (exacta o ventana de 60 s) ───────────────────────
console.log(`Esperando al disparo (≈${DELAY}s + margen de ventana)...`);
let notified = false;
const deadline = Date.now() + (DELAY + 90) * 1000;
while (Date.now() < deadline) {
  await sleep(5000);
  const n = adb('shell', 'dumpsys notification --noredact 2>/dev/null');
  if (n.includes(TITLE)) { notified = true; break; }
}
check('notificación nativa apareció con APK cerrada', notified,
  notified ? `título "${TITLE}"` : 'no apareció en la ventana');

// ── 5. Un solo disparo: registro persistente consumido ─────────────────────
const prefs = adb('shell', `run-as com.vyneural.bineural cat shared_prefs/bineural_alarms.xml 2>/dev/null`);
check('registro persistente consumido (un solo disparo)', !prefs.includes(ALARM_ID),
  prefs.includes(ALARM_ID) ? 'aún en prefs' : 'consumido');

// ── 6. Conteo de notificaciones ────────────────────────────────────────────
const count = adb('shell', 'dumpsys notification --noredact 2>/dev/null').split(TITLE).length - 1;
check('exactamente UNA notificación', count === 1, `count=${count}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n=== CADENA DE ALARMA: ${failed.length === 0 ? 'PASS' : `FAIL (${failed.length})`} ===`);
process.exit(failed.length === 0 ? 0 : 1);
