// scripts/apk-devices-card-check.mjs
// Sonda: en el WebView de la APK (CDP), navega a /cuenta y verifica que la
// tarjeta "Dispositivos" (sección del estado de push sincronizado) exista en
// el DOM con su estructura mínima. No depende del backend (la tarjeta se
// renderiza; el contenido se llena si hay sesión y el backend responde).
import http from 'http';

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

const list = await getJSON('http://127.0.0.1:9222/json/list');
const page = list.find((x) => x.type === 'page');
if (!page) throw new Error('sin página CDP');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
  }
};
await new Promise((res) => (ws.onopen = res));
function cmd(method, params = {}) {
  return new Promise((res) => {
    const myId = ++id;
    pending.set(myId, res);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}
await cmd('Page.enable');
await cmd('Runtime.enable');

// Navegar a /cuenta
await cmd('Page.navigate', { url: 'file:///android_asset/bineural/cuenta.html' });
await new Promise((r) => setTimeout(r, 3500));

const evalJs = await cmd('Runtime.evaluate', {
  expression: `(() => {
    const txt = (document.body ? document.body.innerText : '') || '';
    const card = [...document.querySelectorAll('h3, .card, section, [class*=device]')]
      .filter((el) => (el.innerText || '').includes('Dispositivo'))
      .map((el) => (el.innerText || '').slice(0, 160));
    return JSON.stringify({
      hasBody: !!document.body,
      hasDevicesSection: txt.includes('Dispositivos'),
      hasVAPID: txt.includes('VAPID'),
      sample: card.slice(0, 2),
      url: location.href,
    });
  })()`,
  returnByValue: true,
});
console.log(JSON.stringify(JSON.parse(evalJs.result.value), null, 2));
ws.close();
