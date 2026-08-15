# Análisis de Diferenciación: APK vs PWA (Vyneural 2026)

Este documento detalla las capacidades reales y refinamientos implementados para distinguir y optimizar el funcionamiento de Vyneural según su entorno de ejecución.

## Matriz de Capacidades y Diferencias

| Característica | PWA (Web / Instalada) | APK (Android Nativo) | Refinamiento Aplicado |
| :--- | :--- | :--- | :--- |
| **Audio Background** | Limitado. El navegador puede suspender el proceso. | **Estable.** Usa un `Foreground Service` nativo. | Bridge `RETUNE` para evitar clics. |
| **Alarmas** | Solo si la pestaña está abierta. | **Persistentes.** Registradas en el `AlarmManager` del SO. | Descarte de alarmas vencidas tras reinicio. |
| **Notificaciones** | Requiere Web Push + Servidor (Back). | **Locales.** Disparadas por el SO sin necesidad de red. | Botón de prueba directa en Permisos. |
| **Rendimiento (FPS)** | Variable según pestaña. | **Optimizado.** WebView dedicado. | Botón de FPS en el menú del reproductor. |
| **Identificación** | Badge "PWA" (si está instalada). | Badge "APK" resaltado. | Badge visual en el header. |

## Refinamientos Implementados

### 1. Control de FPS y Rendimiento
Se ha añadido una opción de **"Rendimiento y FPS"** al menú de tres puntos (⋯) del reproductor. Al activarlo, se despliega un HUD técnico que muestra:
- **FPS (Frames Per Second):** Medición real del bucle de dibujo (EMA).
- **Memoria JS:** Uso de memoria del motor.
- **Estado de Audio:** Estado del Contexto y RMS de salida.
- **Transporte:** Modo de salida (Elemento vs Directo).

### 2. Transparencia en Permisos
El modal de permisos ahora incluye un cuadro de **"Diferencias de plataforma"** que educa al usuario sobre por qué la APK ofrece una experiencia superior en cuanto a alarmas y audio continuo.

### 3. Control Nativo Directo
Para usuarios de la APK, se ha integrado un botón de **"Probar notificación"** dentro del panel de permisos. Esto permite verificar instantáneamente que el canal de alarmas nativo está configurado correctamente sin esperar a que se cumpla un temporizador.

### 4. Estabilidad Visual
- El HUD de rendimiento ahora permanece colapsado por defecto para no ensuciar la experiencia cinematográfica inicial.
- Se ha sincronizado la detección de plataforma entre la home y la página de diagnóstico para mostrar estados honestos y consistentes.

> [!TIP]
> Para la mejor experiencia de meditación profunda (donde la app debe permanecer en segundo plano por +20 min), se recomienda encarecidamente el uso de la **APK**.
