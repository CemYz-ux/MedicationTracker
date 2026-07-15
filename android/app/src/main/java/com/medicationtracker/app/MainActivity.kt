package com.medicationtracker.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

/**
 * Thin WebView shell around the existing static web app (bundled offline in
 * assets/www, copied from the repo root — see android/README.md for the sync step).
 * All medication CRUD/cooldown logic stays in the web app; this class only wires up
 * the WebView itself and the notification-permission prompt. Reminder scheduling is
 * handled by [WebAppBridge], which the web app calls via `window.AndroidBridge`.
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
        webView.webViewClient = WebViewClient()
        webView.addJavascriptInterface(WebAppBridge(applicationContext), "AndroidBridge")
        webView.loadUrl("file:///android_asset/www/index.html")
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
}
