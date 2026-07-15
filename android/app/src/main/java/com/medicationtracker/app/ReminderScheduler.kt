package com.medicationtracker.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Schedules/cancels the OS-level alarm that fires [ReminderAlarmReceiver] once a medication's
 * cooldown ends. Uses exact-and-allow-while-idle timing when the user has granted the
 * "Alarms & reminders" permission (required separately from a manifest permission on
 * Android 12+), and falls back to inexact-but-Doze-aware timing otherwise rather than
 * failing outright — a reminder a few minutes late is fine for this app, a crash is not.
 */
class ReminderScheduler(private val context: Context) {
    private val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    private val store = ReminderStore(context)

    fun schedule(id: String, name: String, dueAtMillis: Long) {
        store.put(id, name, dueAtMillis)
        armAlarm(id, name, dueAtMillis)
    }

    fun cancel(id: String) {
        store.remove(id)
        // The `name` extra doesn't matter here: PendingIntent matching (for both creation
        // dedup and this cancel-lookup) is based on component + request code, not extras.
        alarmManager.cancel(pendingIntentFor(id, name = ""))
    }

    /** Re-arms every still-pending reminder; called by [BootCompletedReceiver] after a reboot. */
    fun rescheduleAll() {
        val now = System.currentTimeMillis()
        store.all().forEach { reminder ->
            if (reminder.dueAtMillis > now) {
                armAlarm(reminder.id, reminder.name, reminder.dueAtMillis)
            } else {
                // Already elapsed while the device was off/rebooting — fire it shortly rather
                // than silently dropping a reminder the user never saw.
                armAlarm(reminder.id, reminder.name, now + IMMEDIATE_FIRE_DELAY_MS)
            }
        }
    }

    private fun armAlarm(id: String, name: String, dueAtMillis: Long) {
        val pendingIntent = pendingIntentFor(id, name)
        val canUseExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            alarmManager.canScheduleExactAlarms()
        if (canUseExact) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, dueAtMillis, pendingIntent)
        } else {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, dueAtMillis, pendingIntent)
        }
    }

    private fun pendingIntentFor(id: String, name: String): PendingIntent {
        val intent = Intent(context, ReminderAlarmReceiver::class.java).apply {
            putExtra(ReminderAlarmReceiver.EXTRA_ID, id)
            putExtra(ReminderAlarmReceiver.EXTRA_NAME, name)
        }
        return PendingIntent.getBroadcast(
            context,
            id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    companion object {
        private const val IMMEDIATE_FIRE_DELAY_MS = 2000L
    }
}
