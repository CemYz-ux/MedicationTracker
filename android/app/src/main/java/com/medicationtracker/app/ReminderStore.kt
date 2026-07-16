package com.medicationtracker.app

import android.content.Context

/**
 * Minimal persisted mirror of "what's currently in cooldown", independent of the WebView's
 * own localStorage. Needed so [BootCompletedReceiver] can re-arm alarms after a reboot
 * (AlarmManager alarms don't survive one) without spinning up a WebView just to read the
 * web app's storage — the native side keeps just enough (id, name, due time) to reschedule.
 */
class ReminderStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    data class Reminder(val id: String, val name: String, val dueAtMillis: Long)

    fun put(id: String, name: String, dueAtMillis: Long) {
        val ids = (prefs.getStringSet(KEY_IDS, emptySet()) ?: emptySet()) + id
        prefs.edit()
            .putStringSet(KEY_IDS, ids)
            .putString(nameKey(id), name)
            .putLong(dueKey(id), dueAtMillis)
            .apply()
    }

    fun remove(id: String) {
        val ids = (prefs.getStringSet(KEY_IDS, emptySet()) ?: emptySet()) - id
        prefs.edit()
            .putStringSet(KEY_IDS, ids)
            .remove(nameKey(id))
            .remove(dueKey(id))
            .apply()
    }

    fun all(): List<Reminder> {
        val ids = prefs.getStringSet(KEY_IDS, emptySet()) ?: emptySet()
        return ids.mapNotNull { id ->
            val due = prefs.getLong(dueKey(id), -1L)
            val name = prefs.getString(nameKey(id), null)
            if (due >= 0 && name != null) Reminder(id, name, due) else null
        }
    }

    private fun nameKey(id: String) = "name_$id"
    private fun dueKey(id: String) = "due_$id"

    companion object {
        private const val PREFS_NAME = "medication_reminders"
        private const val KEY_IDS = "ids"
    }
}
