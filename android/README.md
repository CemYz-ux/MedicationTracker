# MedicationTracker — Android wrapper

A thin native Android app that wraps the existing static web app, loaded live from its
GitHub Pages deployment (`https://cemyz-ux.github.io/MedicationTracker/`) in a `WebView`,
so it can be installed as an `.apk` and get real background notifications when a
medication's cooldown ends — something the pure web app can't do reliably (see below).

**Requires network connectivity to open, in general.** This is a deliberate product
decision: one codebase, no asset-sync step, no bundled offline copy shipped in the APK.
The WebView always loads the live Pages URL (`MainActivity.APP_URL`); the one exception is
`WebSettings.LOAD_CACHE_ELSE_NETWORK` (set in `MainActivity.onCreate`), which makes the
WebView prefer whatever response is already in its disk cache and only hit the network if
nothing's cached. That's best-effort reuse of whatever was last loaded, not a real offline
mode — it still fails on a genuine first-ever launch with no network, and is subject to
GitHub Pages' own cache headers and Android's disk-cache eviction, so don't rely on it.

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

## Keeping the web app in sync

There's nothing to keep in sync — the WebView loads `https://cemyz-ux.github.io/MedicationTracker/`
directly, the same deployment everyone else uses. Ship a change by merging it to `main` and
letting the existing GitHub Pages deploy pick it up as usual; the Android app picks up the
new version the next time it's opened with connectivity. No separate Android build or
asset-sync step is needed just to ship a web app change.

## Design choices worth knowing about

- **Package** `com.medicationtracker.app`, **minSdk 26** (required for notification
  channels anyway), **targetSdk 34**. Easy to change later, not load-bearing.
- **Live GitHub Pages URL, not bundled assets** — one codebase, no asset-sync step, no
  bundled offline copy. This intentionally reintroduces a network dependency the pure web
  app has never had (`../architecture/decisions/0001-static-site-no-backend.md` still holds
  for the *backend* — this is just about where the static files are fetched from). The
  WebView's cache mode is set to `LOAD_CACHE_ELSE_NETWORK`, so a launch with no network can
  still succeed if a prior load left something in the disk cache — but that's best-effort
  reuse, not a guarantee. On a genuine first-ever launch with no network (or once the cache
  is evicted), the WebView simply fails to load.
- **Navigation is locked to our own origin** — `MainActivity.RestrictedWebViewClient`
  only lets the WebView navigate within `cemyz-ux.github.io/MedicationTracker/`; anything
  else opens in an external browser instead. This matters because `WebAppBridge` is
  registered via `addJavascriptInterface`, which exposes it to *any* page the WebView
  loads — restricting navigation is what keeps the native bridge unreachable from
  untrusted content now that the WebView loads live pages instead of a locked-down local
  bundle.
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
