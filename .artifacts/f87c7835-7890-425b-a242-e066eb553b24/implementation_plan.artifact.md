# Refinamiento de APK, Web y PWA (Solución de Interferencias y Alarmas)

Se ha identificado que la interferencia de audio es causada por peticiones redundantes de Audio Focus en cada evento de retune (slider). Además, las alarmas disparan ráfagas al reiniciar si estaban vencidas, y el flujo de permisos en el WebView no distingue correctamente el estado "denegado permanentemente".

## User Review Required

> [!IMPORTANT]
> Se requiere verificar que el comando `RETUNE_BACKGROUND_AUDIO` en el bridge nativo sea reconocido correctamente por la versión actual de la APK tras el despliegue de los cambios en el JS.

## Proposed Changes

### Android Native (Kotlin)

---

#### [MODIFY] [BridgeCommands.kt](file:///C:/Users/matia/OneDrive/Desktop/bineural/android/app/src/main/java/com/vyneural/bineural/bridge/BridgeCommands.kt)
- Añadir `RETUNE_BACKGROUND_AUDIO` a la whitelist de comandos permitidos.

#### [MODIFY] [AndroidBridge.kt](file:///C:/Users/matia/OneDrive/Desktop/bineural/android/app/src/main/java/com/vyneural/bineural/bridge/AndroidBridge.kt)
- Implementar el manejo de `RETUNE_BACKGROUND_AUDIO` llamando a `AudioForegroundService.retune()`.
- Actualizar el handshake para incluir información sobre estas nuevas capacidades.

#### [MODIFY] [AudioFocusHelper.kt](file:///C:/Users/matia/OneDrive/Desktop/bineural/android/app/src/main/java/com/vyneural/bineural/audio/AudioFocusHelper.kt)
- Hacer que `request()` sea idempotente, evitando pedir el foco si ya se tiene (`Diagnostics.focusState == "GAIN"`).

#### [MODIFY] [AlarmScheduler.kt](file:///C:/Users/matia/OneDrive/Desktop/bineural/android/app/src/main/java/com/vyneural/bineural/notifications/AlarmScheduler.kt)
- Modificar `schedule()` para que las alarmas vencidas (`atMs < now`) se descarten en lugar de reprogramarse para `now + 1s`.
- Asegurar que `rescheduleAll()` ignore alarmas antiguas tras un reinicio.

#### [MODIFY] [PermissionManager.kt](file:///C:/Users/matia/OneDrive/Desktop/bineural/android/app/src/main/java/com/vyneural/bineural/permissions/PermissionManager.kt)
- Implementar persistencia (SharedPreferences) para rastrear si se ha solicitado un permiso al menos una vez.
- Devolver `DENIED_PERMANENTLY` cuando el permiso está denegado y `shouldShowRequestPermissionRationale` es falso después de haberlo pedido al menos una vez.

#### [MODIFY] [AudioForegroundService.kt](file:///C:/Users/matia/OneDrive/Desktop/bineural/android/app/src/main/java/com/vyneural/bineural/audio/AudioForegroundService.kt)
- Migrar llamadas de `startService` a `ContextCompat.startForegroundService` donde sea necesario para cumplir con los requisitos de Android 8+ en segundo plano.

### Web (JavaScript / PWA)

---

#### [MODIFY] [native-bridge.js](file:///C:/Users/matia/OneDrive/Desktop/bineural/src/platform/native-bridge.js)
- Añadir `RETUNE_BACKGROUND_AUDIO` a la lista de comandos y exponer el método en el adaptador.

#### [MODIFY] [main.js](file:///C:/Users/matia/OneDrive/Desktop/bineural/src/main.js)
- Actualizar `syncNativeAudioRetune()` para usar `retuneBackgroundAudio` en lugar de `startBackgroundAudio` cuando la sesión ya está activa.

#### [MODIFY] [notifications.js](file:///C:/Users/matia/OneDrive/Desktop/bineural/src/notifications.js)
- Integrar la petición de permisos a través del bridge nativo cuando se detecte la plataforma Android APK.

## Verification Plan

### Automated Tests
- No hay tests automatizados configurados para el bridge nativo en este entorno, se requiere compilación manual.
- Comando de compilación: `cd android && ./gradlew assembleDebug`.

### Manual Verification
1. **Audio Focus:** Mover los sliders de frecuencia mientras suena la sesión en la APK. El audio no debe presentar "clicks" ni cortes.
2. **Alarmas:** Programar una alarma para el pasado, reiniciar el dispositivo (o forzar `rescheduleAll`). Verificar que no se dispare inmediatamente.
3. **Permisos:** Denegar el permiso de notificaciones con "No volver a preguntar". La UI web debe mostrar un botón que lleve a Ajustes del sistema.
4. **Foreground:** Verificar que el audio continúe sonando al minimizar la app y cambiar a otras aplicaciones pesadas.
