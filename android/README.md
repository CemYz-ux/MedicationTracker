# MedicationTracker — Android wrapper

A thin native Android app that wraps the existing static web app (`../index.html`,
`../css/`, `../js/`) in a `WebView`, so it can be installed as an `.apk` and get real
background notifications when a medication's cooldown ends — something the pure web app
can't do reliably (see below).

## Why this exists, and why it isn't just a WebView

Android suspends a backgrounded app's JS timers (and can kill the process outright) under
Doze/battery-optimization, so the web app's own periodic re-check (`COOLDOWN_TICK_MS`)
can't be trusted to fire a notification while the app isn't in the foreground — that's true
for *any* app, WebView or fully native, since it's an OS-level restriction on the process,
not the UI framework. The fix is to hand scheduling off to real OS primitives:

1. The web app calls `window.AndroidBridge.scheduleReminder(id, name, dueAtMillis)` /
   `cancelReminder(id)` (see `../js/androidBridge.js`) whenever a medication's cooldown
   state changes.
2. `WebAppBridge.kt` receives that call and hands it to `ReminderScheduler`, which arms an
   `AlarmManager` alarm (`setExactAndAllowWhileIdle`, falling back to the inexact
   `setAndAllowWhileIdle` if the user hasn't granted the "Alarms & reminders" special
   permission) and mirrors the schedule into `ReminderStore` (SharedPreferences).
3. When the alarm fires, `ReminderAlarmReceiver` posts a system notification via
   `NotificationHelper`, independent of whether the app/WebView is even open.
4. `BootCompletedReceiver` re-arms every still-pending reminder from `ReminderStore` after a
   reboot, since `AlarmManager` alarms don't survive one and the native side keeps just
   enough state (id, name, due time) to do this without needing a live WebView to read the
   web app's own `localStorage`.

## Building

**This project has never been compiled in this environment.** The sandbox this was
scaffolded in has no Android SDK, no Gradle, and only JDK 11 (modern Android Gradle Plugin
needs JDK 17+) — so nothing here has been verified to actually build, install, or run.
Everything was written by hand against the standard, documented Android APIs, but treat the
first real build as an actual test, not a formality.

1. Open this `android/` folder directly in Android Studio (not the repo root). Let it sync
   — it will generate the missing Gradle wrapper jar/`gradlew` scripts on first sync and
   flag any AGP/Kotlin/dependency version mismatches via its own upgrade assistant.
2. Build → Make Project, or `./gradlew assembleDebug` from this folder once the wrapper
   exists. Output APK lands in `app/build/outputs/apk/debug/`.
3. Install on a device/emulator and grant the notification permission prompt on first
   launch (Android 13+).

## Keeping the bundled web app in sync

`app/src/main/assets/www/` is a **snapshot copy**, not a live reference, of the repo root's
`index.html`/`css/`/`js/`. After any change to the web app that should ship in the Android
build, re-sync from the repo root:

```
npm run sync:android
```

Then rebuild the APK. Forgetting this step means the Android app silently keeps shipping
stale web app code.

## Design choices worth knowing about

- **Package** `com.medicationtracker.app`, **minSdk 26** (required for notification
  channels anyway), **targetSdk 34**. Easy to change later, not load-bearing.
- **Bundled assets, not the live GitHub Pages URL** — matches the web app's existing
  no-backend/offline/localStorage-only architecture (`../architecture/decisions/0001-static-site-no-backend.md`)
  rather than reintroducing a network dependency the app has never had.
- **Exact-alarm permission is optional, not required** — `SCHEDULE_EXACT_ALARM`/
  `USE_EXACT_ALARM` are declared, but the code checks `canScheduleExactAlarms()` and falls
  back to inexact-but-Doze-aware scheduling if the user hasn't granted it (a notification a
  few minutes late is an acceptable degradation; a crash or a silent no-op is not).
- **OEM battery optimization is out of this code's control.** Some manufacturers (Xiaomi,
  Huawei, OnePlus, etc.) aggressively kill background alarms regardless of the APIs used
  here. If reminders prove unreliable on a specific device, the user likely needs to
  manually exempt the app from battery optimization in system settings — there's no
  in-app fix for this.
- **No release signing/ProGuard minification configured yet** — this is a debug-buildable
  scaffold, not a Play-Store-ready release config.
- **Launcher icon is a placeholder** vector (`res/drawable/ic_launcher_foreground.xml`), not
  a designed asset.
