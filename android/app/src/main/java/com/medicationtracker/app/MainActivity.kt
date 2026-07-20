package com.medicationtracker.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

/**
 * Thin WebView shell around the existing static web app, loaded live from its
 * GitHub Pages deployment (see android/README.md — there is deliberately no bundled
 * offline copy). All medication CRUD/cooldown logic stays in the web app; this class
 * only wires up the WebView itself, the notification-permission prompt, and keeps
 * navigation confined to our own origin (see [RestrictedWebViewClient]). Reminder
 * scheduling is handled by [WebAppBridge], which the web app calls via
 * `window.AndroidBridge`. A `SwipeRefreshLayout` (see `activity_main.xml`) wraps the
 * WebView so a pull-down gesture can manually force past the cache-first
 * `LOAD_CACHE_ELSE_NETWORK` mode below (MED-41) — the only other new UI on top of the
 * otherwise chrome-free fullscreen WebView.
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

        val swipeRefreshLayout = findViewById<SwipeRefreshLayout>(R.id.swipeRefreshLayout)
        val webView = findViewById<WebView>(R.id.webView)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        // Best-effort offline reuse: prefer whatever's already cached and only hit the
        // network if nothing's cached, rather than the default mode which typically fails
        // outright on a fresh launch with no network. Not a guaranteed offline mode — still
        // fails on a genuine first-ever launch with no network, and is subject to GitHub
        // Pages' cache headers and Android's disk-cache eviction. The pull-to-refresh
        // gesture below is the user-facing escape hatch for when this mode serves a stale
        // page; it does not change this setting.
        webView.settings.cacheMode = WebSettings.LOAD_CACHE_ELSE_NETWORK
        webView.webViewClient = RestrictedWebViewClient(
            onMainFrameLoadFinished = { swipeRefreshLayout.isRefreshing = false }
        )
        webView.addJavascriptInterface(WebAppBridge(applicationContext), "AndroidBridge")
        webView.loadUrl(APP_URL)

        swipeRefreshLayout.setColorSchemeResources(R.color.brand_green)
        swipeRefreshLayout.setOnRefreshListener {
            // MED-41: manual, one-off bypass of LOAD_CACHE_ELSE_NETWORK for when a new web
            // deploy is stuck behind a stale cached snapshot. clearCache(true) clears only
            // the HTTP resource cache (the cached HTML/CSS/JS responses) — per the WebView
            // API contract this is distinct from DOM/Web Storage, so localStorage (where all
            // medication records live) is untouched. cacheMode itself is left set to
            // LOAD_CACHE_ELSE_NETWORK for every subsequent ordinary launch; this is not a
            // permanent mode change. The refresh spinner is stopped from
            // RestrictedWebViewClient once the reload genuinely finishes (or fails), not on
            // a fixed timer.
            webView.clearCache(true)
            webView.loadUrl(APP_URL)
        }
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
     *
     * Also reports back when the main-frame navigation genuinely settles — finished
     * ([onPageFinished]), failed ([onReceivedError]), or was intercepted and handed off to
     * an external browser ([shouldOverrideUrlLoading]) — via [onMainFrameLoadFinished],
     * which MED-41's pull-to-refresh gesture uses to stop the refresh spinner. From the
     * spinner's perspective, a hand-off is just as settled an outcome as a genuine finish:
     * if the pull-to-refresh reload's `loadUrl(APP_URL)` were ever intercepted here instead
     * of reaching [onPageFinished]/[onReceivedError] (e.g. APP_URL redirecting outside
     * [ALLOWED_HOST]/[ALLOWED_PATH_PREFIX]), neither of those callbacks would fire and the
     * spinner would spin forever with no self-healing path. `onPageFinished` is only ever
     * invoked for the main frame (per the WebViewClient contract), but `onReceivedError` and
     * `shouldOverrideUrlLoading` can also fire for sub-resources/sub-frames, so both are
     * explicitly filtered to `request.isForMainFrame` to avoid stopping the spinner early on
     * an unrelated failed image/script load or a hypothetical future iframe navigation. Each
     * of the three paths is mutually exclusive for a given navigation attempt (a load either
     * finishes, errors, or gets intercepted — never more than one), so
     * [onMainFrameLoadFinished] fires exactly once per attempt.
     */
    private class RestrictedWebViewClient(
        private val onMainFrameLoadFinished: () -> Unit
    ) : WebViewClient() {
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
            if (request.isForMainFrame) {
                onMainFrameLoadFinished()
            }
            view.context.startActivity(Intent(Intent.ACTION_VIEW, uri))
            return true
        }

        override fun onPageFinished(view: WebView, url: String?) {
            super.onPageFinished(view, url)
            onMainFrameLoadFinished()
        }

        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: WebResourceError
        ) {
            super.onReceivedError(view, request, error)
            if (request.isForMainFrame) {
                onMainFrameLoadFinished()
            }
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
