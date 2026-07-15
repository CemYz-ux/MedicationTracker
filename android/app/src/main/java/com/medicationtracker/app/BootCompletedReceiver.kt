package com.medicationtracker.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** AlarmManager alarms don't survive a reboot, so re-arm every still-pending reminder from ReminderStore. */
class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            ReminderScheduler(context).rescheduleAll()
        }
    }
}
