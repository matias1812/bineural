#!/usr/bin/env bash
# scripts/hardware-evidence.sh
# Captura de evidencia timestamped para la matriz física (docs/HARDWARE_MATRIX.md).
# Cada paso del checklist deja un bloque de evidencia en docs/evidence/<run>.log:
#   - estado JS (solo si el WebView tiene debug habilitado: APK debug/emulador)
#   - servicio nativo + MediaSession + AudioTracks (dumpsys)
#   - traza causal nativa (logcat BineuralLog)
#
# Funciona en la APK RELEASE (sin CDP): la evidencia nativa (dumpsys + logcat)
# está disponible igual; el estado JS se omite con un aviso.
#
# Uso:
#   ./scripts/hardware-evidence.sh start-run
#   ./scripts/hardware-evidence.sh capture "A1 Idle 5 min"
#   ./scripts/hardware-evidence.sh play | pause | stop | dispatch-play | dispatch-pause | dispatch-stop
#   ./scripts/hardware-evidence.sh lock | unlock | back | home | open | kill | reopen
#   ./scripts/hardware-evidence.sh verify-idle | verify-playing | summary
#   ./scripts/hardware-evidence.sh tap <x> <y>          # tap real (play con coordenadas de tu pantalla)
#
# Los comandos `dispatch-*` usan cmd media_session (funcionan cuando existe sesión);
# para el PRIMER play desde idle usa `tap` con las coordenadas del botón "Comenzar
# sesión" de tu pantalla (la app muestra las coordenadas en el propio /diagnostico,
# sección "coordenadas de control", o mídalas con `adb shell wm size` + el layout).

set -u

# ── Entorno adb ──────────────────────────────────────────────────────────────
ADB="adb"
for p in "$HOME/.local/android-sdk/platform-tools" "/c/Users/$USERNAME/AppData/Local/Android/Sdk/platform-tools" "/opt/android-sdk/platform-tools"; do
  if [ -x "$p/adb.exe" ] || [ -x "$p/adb" ]; then ADB="$p/adb"; break; fi
done
export MSYS_NO_PATHCONV=1
PKG="com.vyneural.bineural"
RUN_DIR="docs/evidence"
RUN_LOG=""
CDP_AVAILABLE=0
MARKER="$RUN_DIR/.current"

now_ts() { date "+%Y-%m-%d %H:%M:%S"; }
stamp() { date "+%Y%m%d_%H%M%S"; }

say() { printf '%s\n' "$*"; }
log() { printf '[%s] %s\n' "$(now_ts)" "$*" | tee -a "$RUN_LOG"; }

ensure_run() {
  mkdir -p "$RUN_DIR"
  if [ -z "$RUN_LOG" ]; then
    # Cada invocación es un proceso nuevo: el run se comparte por marcador.
    if [ -s "$MARKER" ]; then
      RUN_LOG=$(cat "$MARKER")
    else
      RUN_LOG="$RUN_DIR/run_$(stamp).log"
      printf '%s' "$RUN_LOG" > "$MARKER"
      log "=== RUN iniciado $(now_ts) — APK release candidate c8b8483d… ==="
      log "=== dispositivo: $(adb_getprop ro.product.model 2>/dev/null) · android $(adb_getprop ro.build.version.release 2>/dev/null) ==="
    fi
  fi
}

adb_getprop() { "$ADB" shell "getprop $1" 2>/dev/null | tr -d '\r'; }

# ── CDP (solo debug): túnel + lectura del estado JS ─────────────────────────
setup_cdp() {
  local sock
  sock=$("$ADB" shell "cat /proc/net/unix 2>/dev/null" | grep -oE "webview_devtools_remote_[0-9]+" | head -1)
  [ -z "$sock" ] && { CDP_AVAILABLE=0; return; }
  "$ADB" forward --remove tcp:9222 >/dev/null 2>&1
  "$ADB" forward tcp:9222 "localabstract:$sock" >/dev/null 2>&1
  CDP_AVAILABLE=1
}

js_state() {
  [ "$CDP_AVAILABLE" = "0" ] && { echo "CDP no disponible (release/WebView sin debug)"; return; }
  node "$(dirname "$0")/cdp.js" \
    "JSON.stringify({state:__audioState.state,playing:document.querySelector('#play-btn').classList.contains('playing'),gain:(__audioProbe().stats?__audioProbe().stats.gain:null),sid:(__audioProbe().stats?__audioProbe().stats.sessionId:null),causal:__causalLog.list().slice(-5).map(e=>e.action+':'+e.source),coalescer:{level:__nativeCmdCoalescer.sent('level'),wave:__nativeCmdCoalescer.sent('wave'),retune:__nativeCmdCoalescer.sent('retune')}})" 2>/dev/null \
    || echo "CDP error (página aún cargando)"
}

# ── Evidencia nativa ─────────────────────────────────────────────────────────
svc_count()   { "$ADB" shell "dumpsys activity services $PKG" 2>/dev/null | grep -cE "ServiceRecord\{.*audio\\.AudioForegroundService"; }
sess_count()  { "$ADB" shell "dumpsys media_session" 2>/dev/null | grep -cE "Session \{.*Vyneural"; }
start_id()    { "$ADB" shell "dumpsys activity services $PKG" 2>/dev/null | grep -oE "lastStartId=[0-9]+" | head -1; }
audio_tracks(){ "$ADB" shell "dumpsys audio" 2>/dev/null | grep -E "AudioTrack|Track.*active|started" | head -8; }
focus_state() { "$ADB" shell "dumpsys audio" 2>/dev/null | grep -iE "focus.*(gained|lost)|AUDIOFOCUS" | head -4; }
native_trace(){ "$ADB" shell "logcat -d -s BineuralLog:I" 2>/dev/null | tail -40; }

capture() {
  ensure_run
  local label="$1"
  log "────────────────────────────────────────────────────────────"
  log "CAPTURA: $label"
  setup_cdp
  {
    echo "## $label — $(now_ts)"
    echo
    echo "### JS (CDP)"
    js_state
    echo
    echo "### Servicio nativo"
    echo "AudioForegroundService: $(svc_count) · MediaSession Vyneural: $(sess_count) · $(start_id)"
    echo
    echo "### AudioTracks"
    audio_tracks
    echo
    echo "### Focus"
    focus_state
    echo
    echo "### Traza nativa (BineuralLog, último)"
    native_trace
    echo
    echo "────────────────────────────────────────────────────────────"
  } >> "$RUN_LOG"
  local s=$(svc_count) m=$(sess_count) js
  js=$( [ "$CDP_AVAILABLE" = "1" ] && node "$(dirname "$0")/cdp.js" "__audioState.state" 2>/dev/null || echo "-" )
  say "  ✓ evidencia: svc=$s msess=$m js=$js → $RUN_LOG"
}

# ── Acciones ─────────────────────────────────────────────────────────────────
action() {
  ensure_run
  local cmd="$1" x="${2:-}" y="${3:-}"
  case "$cmd" in
    play)        log "ACCION: play (tap)";  ;;
    tap)         log "ACCION: tap $x $y"; "$ADB" shell input tap "$x" "$y"; sleep 2;;
    dispatch-play)  log "ACCION: media dispatch play"; "$ADB" shell cmd media_session dispatch play; sleep 1;;
    dispatch-pause) log "ACCION: media dispatch pause"; "$ADB" shell cmd media_session dispatch pause; sleep 1;;
    dispatch-stop)  log "ACCION: media dispatch stop"; "$ADB" shell cmd media_session dispatch stop; sleep 2;;
    lock)        log "ACCION: lock"; "$ADB" shell input keyevent 26; sleep 2;;
    unlock)      log "ACCION: unlock"; "$ADB" shell input keyevent 82; sleep 3;;
    back)        log "ACCION: back"; "$ADB" shell input keyevent 4; sleep 2;;
    home)        log "ACCION: home"; "$ADB" shell input keyevent 3; sleep 2;;
    open)        log "ACCION: abrir app"; "$ADB" shell am start -n "$PKG/.MainActivity" >/dev/null 2>&1; sleep 4;;
    kill)        log "ACCION: force-stop (kill de proceso)"; "$ADB" shell am force-stop "$PKG"; sleep 2;;
    reopen)      log "ACCION: kill + reabrir"; "$ADB" shell am force-stop "$PKG"; sleep 2; "$ADB" shell am start -n "$PKG/.MainActivity" >/dev/null 2>&1; sleep 5;;
    *) say "acción desconocida: $cmd"; exit 2;;
  esac
}

# ── Verificaciones (reglas absolutas) ────────────────────────────────────────
verify_idle() {
  ensure_run
  setup_cdp
  local s=$(svc_count) m=$(sess_count)
  local js="(sin CDP)"
  [ "$CDP_AVAILABLE" = "1" ] && js=$(node "$(dirname "$0")/cdp.js" "__audioState.state" 2>/dev/null)
  local ok=1
  [ "$s" != "0" ] && ok=0
  [ "$m" != "0" ] && ok=0
  case "$js" in PLAYING|INITIALIZING) ok=0;; esac
  if [ "$ok" = "1" ]; then
    log "VERIFY-IDLE: PASS — svc=$s msess=$m js=$js (IDLE/STOPPED + cualquier evento → NO PLAY ✓)"
    say "✓ IDLE PASS"
  else
    log "VERIFY-IDLE: FAIL — svc=$s msess=$m js=$js → BUG P0 (activación espontánea)"
    say "✗ IDLE FAIL — revisar traza causal del primer START en $RUN_LOG"
  fi
}

verify_playing() {
  ensure_run
  setup_cdp
  local s=$(svc_count) m=$(sess_count) sid=$(start_id)
  local js="(sin CDP)"
  [ "$CDP_AVAILABLE" = "1" ] && js=$(node "$(dirname "$0")/cdp.js" "JSON.stringify({state:__audioState.state,gain:(__audioProbe().stats?__audioProbe().stats.gain:null),sid:(__audioProbe().stats?__audioProbe().stats.sessionId:null)})" 2>/dev/null)
  local ok=1
  [ "$s" = "0" ] && ok=0
  [ "$m" = "0" ] && ok=0
  case "$js" in *'"state":"PLAYING"'*) : ;; *) [ "$CDP_AVAILABLE" = "0" ] || ok=0;; esac
  if [ "$ok" = "1" ]; then
    log "VERIFY-PLAYING: PASS — svc=$s msess=$m $sid js=$js (web gain debe ser 0 en APK)"
    say "✓ PLAYING PASS"
  else
    log "VERIFY-PLAYING: FAIL — svc=$s msess=$m $sid js=$js"
    say "✗ PLAYING FAIL"
  fi
}

summary() {
  ensure_run
  log "=== FIN DE RUN $(now_ts) — archivo: $RUN_LOG ==="
  say "Evidencia completa: $RUN_LOG"
}

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
  case "${1:-}" in
    start-run) rm -f "$MARKER"; ensure_run; setup_cdp; log "CDP: $([ "$CDP_AVAILABLE" = "1" ] && echo disponible || echo no disponible)";;
    capture)   shift; capture "$*";;
    verify-idle)   verify_idle;;
    verify-playing) verify_playing;;
    summary)   summary;;
    tap|play|dispatch-play|dispatch-pause|dispatch-stop|lock|unlock|back|home|open|kill|reopen) action "$@";;
    *) say "uso: $0 {start-run|capture \"LABEL\"|play|dispatch-play|dispatch-pause|dispatch-stop|lock|unlock|back|home|open|kill|reopen|tap X Y|verify-idle|verify-playing|summary}"; exit 1;;
  esac
}

main "$@"
