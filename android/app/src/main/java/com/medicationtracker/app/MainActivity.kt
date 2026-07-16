package com.medicationtracker.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

/**
 * Thin WebView shell around the existing static web app, loaded live from its
 * GitHub Pages deployment (see android/README.md — there is deliberately no bundled
 * offline copy). All medication CRUD/cooldown logic stays in the web app; this class
 * only wires up the WebView itself, the notification-permission prompt, and keeps
 * navigation confined to our own origin (see [RestrictedWebViewClient]). Reminder
 * scheduling is handled by [WebAppBridge], which the web app calls via
 * `window.AndroidBridge`.
 */
class MainActivity : AppCompatActivity() {

    private val requestNotificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) {
        // No branching needed here: NotificationHelper checks areNotificationsEnabled()
        // before every post, so a denial just means reminders silently don't show,
        // rather than a crash.
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        NotificationHelper(applicationContext).createChannel()
        requestNotificationPermissionIfNeeded()

        val webView = findViewById<WebView>(R.id.webView)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        // Best-effort offline reuse: prefer whatever's already cached and only hit the
        // network if nothing's cached, rather than the default mode which typically fails
        // outright on a fresh launch with no network. Not a guaranteed offline mode — still
        // fails on a genuine first-ever launch with no network, and is subject to GitHub
        // Pages' cache headers and Android's disk-cache eviction.
        webView.settings.cacheMode = WebSettings.LOAD_CACHE_ELSE_NETWORK
        webView.webViewClient = RestrictedWebViewClient()
        webView.addJavascriptInterface(WebAppBridge(applicationContext), "AndroidBridge")
        webView.loadUrl(APP_URL)
    }

    /**
     * Keeps the WebView confined to our own deployed web app. `addJavascriptInterface`
     * exposes [WebAppBridge] to *any* page the WebView navigates to, not just the page
     * it was first loaded with — so now that we load live content instead of a
     * locked-down local bundle, every navigation needs an explicit check. Anything
     * outside [ALLOWED_HOST]/[ALLOWED_PATH_PREFIX] (e.g. an outbound link, if one ever
     * exists) is handed off to an external browser via an ACTION_VIEW intent instead of
     * navigating the WebView itself there, so the native bridge is never reachable from
     * an untrusted origin. This does not run for the initial `loadUrl` call above, only
     * for subsequent navigations (link taps, redirects, etc.).
     */
    private class RestrictedWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(
            view: WebView,
            request: WebResourceRequest
        ): Boolean {
            val uri = request.url
            val isOwnOrigin = uri.host == ALLOWED_HOST &&
                (uri.path ?: "").startsWith(ALLOWED_PATH_PREFIX)
            if (isOwnOrigin) {
                return false
            }
            view.context.startActivity(Intent(Intent.ACTION_VIEW, uri))
            return true
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                requestNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    private companion object {
        const val ALLOWED_HOST = "cemyz-ux.github.io"
        const val ALLOWED_PATH_PREFIX = "/MedicationTracker/"
        const val APP_URL = "https://$ALLOWED_HOST$ALLOWED_PATH_PREFIX"
    }
}
