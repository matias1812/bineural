// scripts/release-apk-meta.mjs
// Corrige el hallazgo CRÍTICO de la auditoría: el SHA-256/versión/tamaño de
// public/vyneural.apk que se muestran en /descargar (texto + JSON-LD) se
// escribían A MANO y quedaban desincronizados del binario real en cada
// release. Este script es la única fuente de verdad: lee el .apk real y
// android/app/build.gradle, y reescribe descargar.html por reemplazo de
// patrón — sin dependencias nuevas, idempotente (se puede correr en cada
// release sin dejar residuos).
//
// Uso:  node scripts/release-apk-meta.mjs
// Correr DESPUÉS de copiar el .apk firmado a public/vyneural.apk.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const apkPath = path.join(root, 'public', 'vyneural.apk');
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');
const htmlPath = path.join(root, 'descargar.html');

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const apkBytes = readFileSync(apkPath);
const sha256 = createHash('sha256').update(apkBytes).digest('hex');
const fileSize = statSync(apkPath).size;

const gradle = readFileSync(gradlePath, 'utf8');
const versionMatch = gradle.match(/versionName\s+"([^"]+)"/);
if (!versionMatch) fail(`no se pudo leer versionName de ${gradlePath}`);
const version = versionMatch[1];

let html = readFileSync(htmlPath, 'utf8');
let changed = 0;

function replaceOne(re, replacement, label) {
  if (!re.test(html)) fail(`patrón no encontrado en descargar.html: ${label}`);
  const before = html;
  html = html.replace(re, replacement);
  if (html !== before) changed += 1;
}

replaceOne(
  /<h2>Vyneural [^\s]+ · Android 8\+<\/h2>/,
  `<h2>Vyneural ${version} · Android 8+</h2>`,
  'título de versión',
);
replaceOne(
  /(<p class="download-sha">SHA-256:<br \/><code>)[0-9a-f]{64}(<\/code><\/p>)/,
  `$1${sha256}$2`,
  'SHA-256',
);
replaceOne(/"version":\s*"[^"]+"/, `"version": "${version}"`, 'JSON-LD version');
replaceOne(/"fileSize":\s*"\d+"/, `"fileSize": "${fileSize}"`, 'JSON-LD fileSize');

writeFileSync(htmlPath, html, 'utf8');

console.log(`✓ descargar.html actualizado (${changed} reemplazos)`);
console.log(`  versión   : ${version}`);
console.log(`  SHA-256   : ${sha256}`);
console.log(`  tamaño    : ${fileSize} bytes`);
