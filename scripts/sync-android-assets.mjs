// scripts/sync-android-assets.mjs
// Refresca la copia web embebida de la APK (android/app/src/main/assets/bineural)
// a partir de dist/. Uso: npm run build && node scripts/sync-android-assets.mjs
//
// dist/ incluye vyneural.apk (copiado de public/, lo sirve /descargar en la
// web) — pero NO tiene sentido embeberlo dentro de la propia APK: el enlace
// de /descargar dentro del WebView (file://) no sirve para instalar una
// actualización de la app que ya está corriendo, y cada release quedaba
// pesando ~5-6 MB de más (la versión anterior de sí misma, empaquetada
// adentro). Se excluye acá para que no vuelva a colarse.

import { cpSync, existsSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const TARGET = join('android', 'app', 'src', 'main', 'assets', 'bineural');

if (!existsSync(DIST)) {
  console.error(`✗ No existe ${DIST}/ — corré "npm run build" primero.`);
  process.exit(1);
}

rmSync(TARGET, { recursive: true, force: true });
cpSync(DIST, TARGET, { recursive: true });

const strayApk = join(TARGET, 'vyneural.apk');
if (existsSync(strayApk)) {
  const kb = Math.round(statSync(strayApk).size / 1024);
  rmSync(strayApk);
  console.log(`✓ Excluido vyneural.apk de los assets de la APK (-${kb} KB)`);
} else {
  console.log('✓ vyneural.apk no estaba presente (nada que excluir)');
}

console.log(`✓ ${TARGET} sincronizado desde ${DIST}/`);
