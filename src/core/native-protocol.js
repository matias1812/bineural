// src/core/native-protocol.js
// P5.2 — protocolo ÚNICO Web→Nativo para PLAY/PAUSE/STOP (contrato puro,
// sin DOM). La regla central: toda transición de reproducción atraviesa el
// mismo protocolo en Web y APK, y cada acción genera EXACTAMENTE un comando
// (o ninguno cuando el nativo ya la aplicó).
//
//   PLAY (sesión nueva / servicio muerto)        → 1 START
//   RESUME (tras pausa, servicio vivo)           → 1 RESUME
//   RESUME ya aplicada por el nativo (lock scr.) → 0 comandos (solo mute web)
//   PAUSE desde UI / teclado / API               → 1 PAUSE
//   PAUSE ya aplicada por el nativo (lock scr.)  → 0 comandos
//   STOP con servicio vivo                        → 1 STOP
//   STOP con servicio muerto                      → 0 comandos (no crear audio)
//
// Nunca: config (volumen/onda/frecuencia) → crear/revivir el servicio.
export function nativePlayCommand({ resume, source, serviceRunning }) {
  // El nativo ya reanudó (evento vyneural:audioplayback del lock screen):
  // la web solo re-mutea su motor; 0 comandos.
  if (resume && source === 'lock-screen') return 'mute-only';
  // Reanudación tras pausa con el servicio vivo: 1 RESUME (nunca un START
  // duplicado con re-solicitud de audio focus).
  if (resume && serviceRunning) return 'resume';
  // Sesión nueva o servicio muerto: 1 START (única vía para crear audio).
  return 'start';
}

export function nativePauseCommand({ source }) {
  // Pausa ya aplicada por el nativo (lock screen): 0 comandos.
  return source === 'lock-screen' ? 'none' : 'pause';
}

export function nativeStopCommand({ serviceRunning }) {
  // STOP de un servicio inactivo es no-op: no se crea audio para detenerlo.
  return serviceRunning ? 'stop' : 'none';
}

// R2 — coalescing de comandos de CONFIGURACIÓN nativa (volumen/onda/retune).
// El slider de volumen y los cambios rápidos de onda/estado/portadora emiten
// ráfagas de comandos al servicio (forense R2: startId 3→78 en 100 cambios).
// No crean reproducción (jamás START/RESUME — contrato de arriba) pero
// inflan el startId y el tráfico binder. El coalescer deja pasar SOLO el
// último comando de cada ráfaga (ventana trailing): el efecto audible es el
// mismo con un comando por ráfaga.
//
// Los comandos de reproducción (START/RESUME/PAUSE/STOP) NO pasan por aquí:
// siempre van directos y síncronos (una acción = un comando, P5.2).
//
// Es puro (sin DOM): los tests lo validan headless con reloj inyectado.
export class NativeCommandCoalescer {
  /**
   * @param {object} [opts]
   * @param {number} [opts.windowMs]  Ventana de coalescing (ms).
   */
  constructor({ windowMs = 120 } = {}) {
    this.windowMs = windowMs;
    this._timers = new Map();
    this._sent = new Map();
  }

  /**
   * Programa un comando de configuración. Si llega otro del mismo tipo
   * dentro de la ventana, se cancela el pendiente y se programa el último
   * (la función se ejecuta con el ESTADO ACTUAL en el momento del envío,
   * así que el último valor de la ráfaga es el que llega al servicio).
   * @param {string} key  tipo de comando ('level' | 'wave' | 'retune').
   * @param {() => void} fn  envío real del comando.
   */
  schedule(key, fn) {
    const prev = this._timers.get(key);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      this._timers.delete(key);
      this._sent.set(key, (this._sent.get(key) || 0) + 1);
      try {
        fn();
      } catch (_) {
        /* el servicio puede haberse detenido entre la ráfaga y el envío */
      }
    }, this.windowMs);
    this._timers.set(key, t);
  }

  /** Comandos realmente enviados por tipo (diagnóstico). */
  sent(key) {
    return this._sent.get(key) || 0;
  }

  /** ¿Hay comandos pendientes de envío? (diagnóstico). */
  pending() {
    return this._timers.size;
  }

  /** Cancela todos los comandos pendientes (unload/stop). */
  cancelAll() {
    this._timers.forEach((t) => clearTimeout(t));
    this._timers.clear();
  }
}
