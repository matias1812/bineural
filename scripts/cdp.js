// CDP client: node scripts/cdp.js "<expression>"
// Connects to the WebView devtools socket (forwarded to localhost:9222) and evaluates the expression.
const port = process.env.CDP_PORT || 9222;
const expr = process.argv[2];
if (!expr) { console.error('usage: node scripts/cdp.js "<expression>"'); process.exit(1); }

async function main() {
  const targets = await (await fetch(`http://localhost:${port}/json`)).json();
  const page = targets.find(t => t.type === 'page');
  if (!page) { console.error('no page target'); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await new Promise((res) => { ws.onopen = res; });
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  ws.close();
  if (r.error) { console.error('CDP error:', JSON.stringify(r.error)); process.exit(1); }
  const res = r.result && r.result.result;
  if (res && res.exceptionDetails) {
    console.error('JS exception:', res.exceptionDetails.exception ? res.exceptionDetails.exception.description : res.exceptionDetails.text);
    process.exit(1);
  }
  const value = res && res.value;
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
