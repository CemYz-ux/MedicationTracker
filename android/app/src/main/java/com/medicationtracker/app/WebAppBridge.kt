package com.medicationtracker.app

import android.content.Context
import android.webkit.JavascriptInterface

/**
 * Exposed to the web app as `window.AndroidBridge` (see MainActivity.addJavascriptInterface).
 * The web app calls these whenever a medication's cooldown state changes — dose logged,
 * tap-cancelled, Reset, or deleted — via js/androidBridge.js in the repo root. Kept minimal:
 * just enough for the native alarm/notification layer to know what's due and when, since the
 * medication's own name/dose/interval definition stays owned by the web app's localStorage.
 */
class WebAppBridge(private val context: Context) {
    private val scheduler = ReminderScheduler(context)

    /** @param dueAtMillis epoch-millis timestamp (matches JS `Date.now()`-style values). */
    @JavascriptInterface
    fun scheduleReminder(id: String, name: String, dueAtMillis: Long) {
        scheduler.schedule(id, name, dueAtMillis)
    }

    @JavascriptInterface
    fun cancelReminder(id: String) {
        scheduler.cancel(id)
    }
}
