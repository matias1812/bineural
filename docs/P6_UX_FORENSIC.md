# P6 — UX Forensic

> Objetivo: ¿la aplicación *se siente* correctamente diseñada como producto
> completo? Evidencia de los flujos reales recorridos en esta auditoría +
> revisión de código. (P2.5/P2.6 viewport y touch no ejecutables en el entorno
> de escritorio; marcados NOT_TESTED.)

## 1. Primera experiencia (P2.1)

Flujo recorrido en vivo: OPEN → quickstart (modal "¿Qué necesitas ahora?" con 5
opciones) → elegir objetivo → generador → play.

| Pregunta | Evidencia |
|---|---|
| ¿Es evidente qué hacer? | Sí: hero con "Comenzar ahora ↓", quickstart guiado, estado seleccionado resaltado, botón "Comenzar sesión" junto al panel |
| ¿Botones ambiguos? | "Comenzar sesión" cambia a "Pausar sesión" — inequívoco. El menú "Más opciones" agrupa acciones secundarias |
| ¿Estados sin explicación? | Estado de audio siempre visible ("○ En pausa" / "● Reproduciendo") + frecuencia 1/2 + latido |
| ¿Loaders infinitos? | Loader inicial "SINTONIZANDO…" con % y fade mínimo 2.2 s (decorativo, no bloquea) |
| ¿Se entiende cuándo está sincronizado? | /cuenta: "Sincronizado ✓" + "Todo sincronizado: perfil, favoritos, frecuencias, alarmas, itinerarios y push viven en la nube" — **pero este copy es FALSO para alarmas** (P6-FEAT-001) y sobrevende el sync (P6-FEAT-002) |

**Conclusión**: primera experiencia buena; el copy de sincronización sobrevende
capacidades inexistentes → P6-UX-002 (ver registro, P3, ligado a FEAT-001).

## 2. Feedback de audio (P2.2)

| Acción | Feedback visual | Estado real del motor |
|---|---|---|
| Play | botón → "Pausar sesión", "● Reproduciendo", MediaSession playing | ctx running, osc 2, gain>0 — **coincide** |
| Pause | botón → "Comenzar sesión", "○ En pausa" | osc 0, gain piso — **coincide** |
| Stop | "○ En pausa" + resumen | STOPPED, sin servicio — **coincide** |
| Cambio de frecuencia | status 1/2 actualizado + URL | retune en vivo, misma sesión — **coincide** |
| Cambio de estado | tarjeta resaltada + status | retune en vivo — **coincide** |
| Volumen | label % + slider | gain en vivo — **coincide** |

**Ninguna combinación "UI dice X / audio no hace X" observada** (verificado por
probe en R02-R09 y `__uiAudioGuard` en R13).

## 3. Estados imposibles (P2.3)

Ver matriz §4 en `P6_WEB_PWA_APK_MATRIX.md`. Resumen: PLAYING+STOPPED,
STOPPED+engine activo, PAUSED+audible, IDLE+audible no ocurren (máquina de
estados única + probes). SYNCED+petición pendiente: caché TTL 8 s con
invalidación tras mutaciones.

## 4. Error UX (P2.4)

Simulados en vivo: 400 (contraseña incorrecta) y offline (backend muerto).
- 400 → `"la contraseña actual no es correcta"` — limpio, sin stack/excepción/
  SQL/URL interna (R26).
- Offline → las operaciones locales siguen funcionando; el sync falla en
  silencio (sin alertas ni pantallas rotas).
- 401 → refresh único con promesa compartida (`client.js tryRefresh`); sin
  bucle de refresh.
- 500/403/404/429/timeout/DB down: no simulados en vivo; el cliente normaliza
  todo error a `ApiError {status, detail, code}` sin exponer detalles internos
  (revisión de código).

## 5. Mobile UX (P2.5) y touch targets (P2.6) — NOT_TESTED en vivo

Entorno de escritorio sin emulación de viewport (320/360/412dp) ni input táctil.
Revisión de código:
- Controles principales son `<button>` con padding amplio; play/stop/pause son
  un único botón grande del panel.
- Sliders (`<input type=range>`) nativos.
- El doble toque accidental en Play es una PAUSA (toggle) — nunca duplica
  sesión (R10).
- Los controles de alarma/next/previous son chips/buttons accesibles por teclado
  (`tabindex`, `aria-*` presentes en tarjetas).

## 6. Input rápido (P2.7)

| Ráfaga | Resultado |
|---|---|
| PLAY PLAY PLAY | 1 sesión (toggle idempotente) |
| PAUSE PAUSE | 1 pausa |
| STOP STOP STOP | idempotente |
| NEXT ×3 / PREV ×3 | retunes, sin START |
| FAVORITE ×rápido | Set local deduplicado; fav-sync idempotente |
| SAVE ×rápido (frecuencia) | modal one-shot; sin registros duplicados observados |

Evidencia R10: `causal=["RESUME:ui"]`, `playCount:1`, `sessionId` estable.

## 7. Conclusión UX

- Feedback auditivo-visual coherente en todos los flujos principales: **PASS**.
- Copy de sincronización sobrevende (P6-FEAT-001/002) y la lista de itinerarios
  no se refresca tras crear (P6-UX-001): **P3**.
- Mobile/touch: **NOT_TESTED** (pendiente de ejecutar en emulador con
  viewports 320/360/412dp).
