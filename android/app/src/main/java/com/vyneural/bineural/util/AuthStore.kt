package com.vyneural.bineural.util

import android.content.Context

/**
 * Sesión guardada por el WebView vía bridge (STORE_AUTH/CLEAR_AUTH) para que
 * el worker de sincronización en segundo plano pueda autenticarse contra el
 * backend aunque la app esté cerrada. Access token + refresh token (mismo
 * par que rota el WebView) + ids mínimos; nunca claves privadas.
 */
object AuthStore {
    private const val PREFS = "bineural_auth"

    fun token(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString("access_token", null)
            ?.takeIf { it.isNotBlank() }

    fun refreshToken(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString("refresh_token", null)
            ?.takeIf { it.isNotBlank() }

    fun userId(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("user_id", null)

    fun email(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("email", null)

    fun save(context: Context, token: String?, refreshToken: String?, userId: String?, email: String?) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("access_token", token)
            .putString("refresh_token", refreshToken)
            .putString("user_id", userId)
            .putString("email", email)
            .apply()
    }

    /** Actualiza solo el par de tokens (rotación), sin tocar user_id/email. */
    fun saveTokens(context: Context, token: String?, refreshToken: String?) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("access_token", token)
            .putString("refresh_token", refreshToken)
            .apply()
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }
}
