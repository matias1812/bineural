package com.vyneural.bineural.bridge

/**
 * Whitelist de comandos permitidos. Espejo EXACTO de
 * `src/platform/native-bridge.js` (BRIDGE_COMMANDS). Cualquier comando fuera
 * de esta lista se rechaza con DENIED — jamás se ejecuta algo arbitrario
 * desde el contenido web (P1 security).
 */
object BridgeCommands {
    val ALL: Set<String> = setOf(
        "GET_PLATFORM_CAPABILITIES",
        "START_BACKGROUND_AUDIO",
        "STOP_BACKGROUND_AUDIO",
        "PAUSE_BACKGROUND_AUDIO",
        "RESUME_BACKGROUND_AUDIO",
        "SCHEDULE_ALARM",
        "CANCEL_ALARM",
        "REQUEST_NOTIFICATION_PERMISSION",
        "REQUEST_EXACT_ALARM_PERMISSION",
        "OPEN_EXPERIMENT",
        "OPEN_SETTINGS",
        "SET_FULLSCREEN",
        "SET_ORIENTATION",
        "TEST_NOTIFICATION",
        "SAVE_ICS",
        "SET_WAVE",
        "SET_AUDIO_LEVEL",
        "RETUNE_BACKGROUND_AUDIO",
    )

    fun isAllowed(command: String): Boolean = command in ALL
}
