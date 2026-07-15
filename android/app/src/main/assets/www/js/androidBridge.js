import { isInCooldown } from "./medications.js";

/**
 * True only when this page is running inside the native Android WebView
 * wrapper, which injects `window.AndroidBridge` before the page loads. On a
 * normal website (GitHub Pages, `npm run dev`, every existing test) this is
 * `undefined`, so every other export in this module is a no-op there —
 * purely additive, zero behavior change outside the wrapper.
 */
export function isAndroidBridgeAvailable() {
  return typeof window !== "undefined" && Boolean(window.AndroidBridge);
}

/**
 * Re-syncs every medication's native reminder with its current cooldown
 * state: schedules a native OS notification for `dueAtMillis` (epoch millis,
 * same semantics as `Date.now()`) if the medication is currently in
 * cooldown, or cancels any pending reminder if it isn't. A complete no-op
 * when the bridge isn't available (see `isAndroidBridgeAvailable`).
 *
 * Deliberately reads `cooldownIntervalHours` — the snapshot `logDose` takes
 * when GO is pressed — not the live, editable `intervalHours`, mirroring
 * `isInCooldown`/`getCooldownTotalMs`'s own discipline (MED-5/MED-8/MED-32):
 * editing the interval mid-cooldown must never disturb an already-running
 * cooldown's timing, and that includes the native alarm scheduled for it.
 *
 * `now` (epoch millis) is injectable for deterministic tests; it defaults to
 * `Date.now()`.
 */
export function syncReminders(medications, now = Date.now()) {
  if (!isAndroidBridgeAvailable()) return;

  for (const medication of medications) {
    if (isInCooldown(medication, now)) {
      const dueAtMillis =
        new Date(medication.lastTakenAt).getTime() +
        medication.cooldownIntervalHours * 60 * 60 * 1000;
      window.AndroidBridge.scheduleReminder(medication.id, medication.name, dueAtMillis);
    } else {
      window.AndroidBridge.cancelReminder(medication.id);
    }
  }
}

/**
 * Thin, no-op-safe wrapper around `window.AndroidBridge.cancelReminder`, for
 * the delete path: `syncReminders` only ever iterates the *current* medication
 * list, so it can never reach an id that's just been removed from it — this
 * standalone call is what actually cancels that now-orphaned native alarm.
 * A complete no-op when the bridge isn't available.
 */
export function cancelReminder(id) {
  if (!isAndroidBridgeAvailable()) return;
  window.AndroidBridge.cancelReminder(id);
}
