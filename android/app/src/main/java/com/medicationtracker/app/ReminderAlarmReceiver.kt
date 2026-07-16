package com.medicationtracker.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class ReminderAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(EXTRA_ID) ?: return
        val name = intent.getStringExtra(EXTRA_NAME) ?: context.getString(R.string.app_name)
        NotificationHelper(context).showReadyNotification(id, name)
        // The alarm already fired — drop it from the store so a stale reboot-reschedule
        // doesn't re-notify for a dose the user may have already logged since.
        ReminderStore(context).remove(id)
    }

    companion object {
        const val EXTRA_ID = "medication_id"
        const val EXTRA_NAME = "medication_name"
    }
}
