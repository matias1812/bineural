package com.vyneural.bineural

import android.content.Intent
import android.content.pm.ActivityInfo
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import com.vyneural.bineural.audio.AudioForegroundService
import com.vyneural.bineural.bridge.AndroidBridge
import com.vyneural.bineural.diag.Diagnostics
import com.vyneural.bineural.lifecycle.LifecycleManager
import com.vyneural.bineural.notifications.AlarmScheduler
import com.vyneural.bineural.notifications.NotificationHelper
import com.vyneural.bineural.permissions.PermissionManager
import com.vyneural.bineural.util.BineuralLog

/**
 * Shell Android (P1): carga la web Vyneural desde assets locales (offline,
 * sin servidor) y le inyecta `window.AndroidBridge` con el contrato exacto de
 * `src/platform/native-bridge.js`. UN WebView, UN servicio de audio, UNA
 * sesión — cero duplicación.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var scheduler: AlarmScheduler
    private lateinit var permissions: PermissionManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        scheduler = AlarmScheduler(this)
        permissions = PermissionManager(this)
        NotificationHelper.ensureChannels(this)
        Diagnostics.bridgeStatus = "PENDING"

        webView = WebView(this)
        setContentView(webView)
        val s = webView.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        s.allowFileAccess = true
        s.useWideViewPort = true
        // Los módulos ES del build de Vite se cargan en modo CORS y el origen
        // file:// es opaco: sin esto Chromium bloquea los .js en silencio y la
        // app se queda en la pantalla de carga. Solo habilita file→file (la
        // app es 100% offline; nada externo necesita acceso universal).
        s.allowFileAccessFromFileURLs = true

        webView.addJavascriptInterface(AndroidBridge(this, scheduler, permissions), "AndroidBridgeNative")

        // Push de eventos nativos al JS: cambios de audio focus (llamadas, otro
        // audio, Bluetooth) para el log de interferencias del HUD / /diagnostico.
        AudioForegroundService.onFocusStateChange = { label ->
            pushToWeb("window.dispatchEvent(new CustomEvent('vyneural:audiofocus',{detail:{state:'$label'}}))")
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                if (url.startsWith("file:///android_asset/bineural/")) return false
                // Enlaces externos (GitHub, Instagram, fuentes): abrir en el
                // navegador del sistema, nunca dentro de la WebView.
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    } catch (e: Exception) {
                        BineuralLog.e("webview", "no external browser for $url")
                    }
                    return true
                }
                val path = request.url.path ?: "/"
                val page = path.trim('/').ifEmpty { "index" }
                loadLocalPage(page)
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                injectBridge()
                Diagnostics.bridgeStatus = if (view.url?.startsWith("file://") == true) "CONNECTED" else "ERROR"
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    BineuralLog.e("webview", "error ${error.errorCode} → ${request.url}")
                    loadLocalPage("index")
                }
            }
        }

        loadLocalPage("index")
    }

    /** Envía JavaScript al WebView (eventos nativos → JS). */
    fun pushToWeb(js: String) {
        webView.post { webView.evaluateJavascript(js, null) }
    }

    /** Pantalla completa (immersive): oculta/muestra las barras del sistema. */
    fun setImmersiveMode(enabled: Boolean) {
        Diagnostics.immersiveActive = enabled
        runOnUiThread {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val controller = window.insetsController
                if (enabled) controller?.hide(WindowInsets.Type.systemBars())
                else controller?.show(WindowInsets.Type.systemBars())
            } else {
                @Suppress("DEPRECATION")
                window.decorView.systemUiVisibility = if (enabled) {
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                        View.SYSTEM_UI_FLAG_FULLSCREEN or
                        View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                        View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                } else {
                    View.SYSTEM_UI_FLAG_VISIBLE
                }
            }
        }
    }

    /** Rotación: portrait / landscape / sensor (libera). */
    fun setOrientation(mode: String) {
        runOnUiThread {
            requestedOrientation = when (mode) {
                "portrait" -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                "landscape" -> ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                else -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            }
        }
    }

    /** Carga una página local (MPA de Vite): /privacidad → privacidad.html. */
    private fun loadLocalPage(page: String) {
        val clean = page.replace(Regex("[^A-Za-z0-9_-]"), "").ifEmpty { "index" }
        webView.loadUrl("file:///android_asset/bineural/$clean.html")
    }

    /** Inyecta window.AndroidBridge con el contrato exacto del JS (P0). */
    private fun injectBridge() {
        val js = """
            if (!window.AndroidBridge) {
              window.AndroidBridge = {
                version: AndroidBridgeNative.getVersion(),
                postMessage: function (m) {
                  try { return JSON.parse(AndroidBridgeNative.postMessage(JSON.stringify(m))); } catch (e) { return null; }
                },
                getPlatformInfo: function () {
                  try { return JSON.parse(AndroidBridgeNative.getPlatformInfo()); } catch (e) { return null; }
                }
              };
            }
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        LifecycleManager.onResume()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
        LifecycleManager.onPause()
    }

    override fun onStop() {
        super.onStop()
        LifecycleManager.onStop()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        this.permissions.onRequestPermissionsResult(requestCode, grantResults)
    }
}
