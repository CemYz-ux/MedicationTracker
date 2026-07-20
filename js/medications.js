const STORAGE_KEY = "medications";

/**
 * Validates a raw interval value (string or number) on its own, so add-time
 * and edit-time validation share one code path. Returns a human-readable
 * error message, or `null` when the value is a valid positive, finite number.
 */
export function validateInterval(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return "Interval (hours) is required.";
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "Interval (hours) must be a positive number.";
  }
  return null;
}

/**
 * Reads the medication list from the given storage. Never throws — a
 * missing or corrupted value (first run, or leftover data from a prior
 * schema) is treated as an empty list. Records left over from the old
 * {id, name, dose, time} schema (no valid intervalHours) are discarded
 * rather than migrated, since a clock time cannot become an interval.
 */
export function loadMedications(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (medication) =>
        medication &&
        typeof medication === "object" &&
        Number.isFinite(medication.intervalHours) &&
        medication.intervalHours > 0
    );
  } catch {
    return [];
  }
}

export function saveMedications(medications, storage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(medications));
}

/**
 * Validates just the Name and Dose fields, shared by `validateMedication`
 * (Add, which also validates Interval) and `updateMedicationDetails` (Edit,
 * MED-17, which never touches Interval — see that function's doc comment).
 */
export function validateNameAndDose({ name, dose }) {
  const errors = [];
  if (!name || !name.trim()) errors.push("Name is required.");
  if (!dose || !dose.trim()) errors.push("Dose is required.");
  return errors;
}

export function validateMedication({ name, dose, intervalHours }) {
  const errors = validateNameAndDose({ name, dose });
  const intervalError = validateInterval(intervalHours);
  if (intervalError) errors.push(intervalError);
  return errors;
}

/**
 * Returns a new list with the medication appended. Throws with a
 * human-readable message if the medication is invalid. `lastTakenAt` is
 * always created as `null` — it is populated later by MED-7's GO control.
 */
export function addMedication(medications, medication) {
  const errors = validateMedication(medication);
  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
  const newMedication = {
    id:
      medication.id ??
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    name: medication.name.trim(),
    dose: medication.dose.trim(),
    intervalHours: Number(medication.intervalHours),
    lastTakenAt: null,
  };
  return [...medications, newMedication];
}

/**
 * Returns a new list where the medication matching `id` has its
 * intervalHours replaced. Every other field — including lastTakenAt and
 * cooldownIntervalHours — is preserved untouched, so editing the interval
 * never disturbs a running cooldown (that recomputation only ever happens
 * via `logDose`/GO, never here). Throws a human-readable error on invalid
 * input; the caller should retain the previously saved value in that case.
 *
 * MED-32 relocated this function's *control* from the card's own inline
 * input into the Edit dialog (alongside Name/Dose), but the function itself
 * is unchanged — still Interval-only, still called independently of
 * `updateMedicationDetails` from the Edit dialog's submit handler.
 */
export function updateMedicationInterval(medications, id, newIntervalHours) {
  const error = validateInterval(newIntervalHours);
  if (error) {
    throw new Error(error);
  }
  return medications.map((medication) =>
    medication.id === id
      ? { ...medication, intervalHours: Number(newIntervalHours) }
      : medication
  );
}

export function removeMedication(medications, id) {
  return medications.filter((medication) => medication.id !== id);
}

/**
 * Returns a new list where the medication matching `id` has its `name` and
 * `dose` replaced (trimmed, like `addMedication`). Every other field —
 * `intervalHours`, `lastTakenAt`, `cooldownIntervalHours` — is preserved
 * untouched, so editing Name/Dose never disturbs a running cooldown or its
 * countdown/fill (MED-17's central invariant, the same discipline
 * `updateMedicationInterval` already applies to the Interval field). This
 * function deliberately has no
 * `intervalHours` parameter at all: even though MED-32 moved Interval's
 * *control* into the same Edit dialog this function backs, Interval's
 * validation and storage write is still a separate, unchanged call to
 * `updateMedicationInterval` — the Edit dialog's submit handler (`js/app.js`)
 * calls both this function and that one rather than merging them into one, so
 * neither pure function needed to grow a parameter it didn't already have.
 *
 * Throws a human-readable error (joined, like `addMedication`) when Name or
 * Dose is empty; the caller should retain the previously saved values in
 * that case. A no-op (returns an equivalent list) if `id` doesn't match any
 * medication, mirroring `removeMedication`/`updateMedicationInterval`.
 */
export function updateMedicationDetails(medications, id, { name, dose }) {
  const errors = validateNameAndDose({ name, dose });
  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
  return medications.map((medication) =>
    medication.id === id
      ? { ...medication, name: name.trim(), dose: dose.trim() }
      : medication
  );
}

/**
 * Returns a new list where the medication matching `id` has `lastTakenAt`
 * set to the current time, recorded as an ISO string so it round-trips
 * through JSON/localStorage the same way every other field does. Every
 * other field — and every other medication in the list — is left untouched,
 * so logging one dose can never affect another medication's state (MED-7).
 *
 * Also snapshots the medication's *current* `intervalHours` into
 * `cooldownIntervalHours`. This is what the cooldown math below reads —
 * not the live, editable `intervalHours` — so that editing the interval
 * mid-cooldown (MED-5) can never retroactively change a countdown that's
 * already running (MED-8 AC). The next GO press re-snapshots it from
 * whatever `intervalHours` is at that later point.
 *
 * `now` (epoch millis) is injectable for deterministic tests; it defaults to
 * `Date.now()`. This story only records the timestamp — it does not decide
 * whether GO *should* be pressable (that's the DOM layer, reading
 * `lastTakenAt`) and it does not compute cooldown/reactivation (MED-9).
 *
 * If `id` does not match any medication, the returned list is equivalent to
 * the input (no-op), mirroring `removeMedication`'s behavior.
 */
export function logDose(medications, id, now = Date.now()) {
  const takenAt = new Date(now).toISOString();
  return medications.map((medication) =>
    medication.id === id
      ? {
          ...medication,
          lastTakenAt: takenAt,
          cooldownIntervalHours: medication.intervalHours,
        }
      : medication
  );
}

/**
 * The interval (in hours) that governs the medication's *current* cooldown.
 * Prefers the snapshot taken by `logDose` (`cooldownIntervalHours`) over the
 * live, editable `intervalHours`, so a later edit never disturbs a running
 * cooldown's timing (MED-5/MED-8). Falls back to `intervalHours` for
 * medications logged before this field existed, or that have never been
 * logged at all.
 */
function cooldownIntervalHoursFor(medication) {
  const snapshot = medication.cooldownIntervalHours;
  return Number.isFinite(snapshot) && snapshot > 0
    ? snapshot
    : medication.intervalHours;
}

/**
 * The exact moment (epoch ms) `medication`'s current cooldown ends — its
 * "wear off" instant: `lastTakenAt` plus `cooldownIntervalHoursFor`'s
 * snapshotted interval. `isInCooldown` and `getCooldownRemainingMs` both
 * compare `now` against this value; `formatLastTakenLabel` (MED-38) uses it
 * as the zero-point for the Active-state "time since wear-off" reading,
 * deliberately *not* `lastTakenAt` itself (the moment the dose was taken,
 * which is a different instant — see that function's own doc comment for
 * why the distinction matters).
 *
 * Only meaningful when `medication.lastTakenAt` is truthy and parseable —
 * callers must guard that themselves (see `isInCooldown`'s and
 * `formatLastTakenLabel`'s own checks). A falsy `lastTakenAt` does *not*
 * make this come back `NaN`: `new Date(null).getTime()` is epoch 0, so a
 * never-taken medication would otherwise produce a small, meaningless
 * "ready at" timestamp in the far past — the null check has to happen
 * before calling this, not be inferred from its return value.
 *
 * Exported for `formatLastTakenLabel`'s use (MED-38); every other caller in
 * this module is internal.
 */
export function cooldownReadyAt(medication) {
  const takenAtMs = new Date(medication.lastTakenAt).getTime();
  return takenAtMs + cooldownIntervalHoursFor(medication) * 60 * 60 * 1000;
}

/**
 * True when `medication` was logged and its interval (as it stood at the
 * moment GO was pressed — see `logDose`) has not yet fully elapsed, i.e.
 * `now < lastTakenAt + cooldownIntervalHours`. A medication that has never
 * been logged (`lastTakenAt` is `null`) is never in cooldown. `now` (epoch
 * millis) is injectable for deterministic tests; it defaults to `Date.now()`.
 *
 * A truthy but unparseable `lastTakenAt` (corrupted storage) makes
 * `cooldownReadyAt` come back `NaN`; that's treated as not-in-cooldown too,
 * via an explicit guard rather than relying on `now < NaN` evaluating to
 * `false` (MED-10 AC4) — the outcome is unchanged, but it's now deliberate.
 *
 * MED-34: a leftover `pausedRemainingMs` field on a medication record saved
 * before this story shipped (MED-32's now-removed Paused state) is never
 * read here — this function only ever looks at `lastTakenAt`/
 * `cooldownIntervalHours`, so a stale `pausedRemainingMs` value is simply
 * inert and can never resurrect paused-looking behavior.
 */
export function isInCooldown(medication, now = Date.now()) {
  if (!medication.lastTakenAt) return false;
  const readyAt = cooldownReadyAt(medication);
  if (Number.isNaN(readyAt)) return false;
  return now < readyAt;
}

/**
 * Returns a new list where the medication matching `id` has its cooldown
 * cancelled early: `lastTakenAt` and the interval snapshot `logDose` took
 * alongside it are both cleared back to `null` — their pre-GO shape.
 * `isInCooldown` treats a falsy `lastTakenAt` as never-logged and returns
 * `false` immediately (see its own doc comment), so that alone is enough to
 * make every other cooldown-derived *display* value (countdown text, fill,
 * GO's enabled state) come back exactly as they would for a medication that
 * reached Active by natural elapse (MED-9) — the raw stored shape is not
 * identical, since natural elapse leaves the original `cooldownIntervalHours`
 * snapshot in place while Stop nulls it out; nothing today reads that field
 * for an Active medication, so the difference is inert, but a future reader
 * shouldn't assume the two paths produce identical stored data. There is
 * deliberately no separate "stopped" flag: MED-11's AC requires Stop's
 * *derived* result to be indistinguishable from natural elapse, and this
 * app's architecture is "derive status fresh from stored data every time,"
 * not "track a status flag" (confirmed working correctly across MED-8/9/10).
 *
 * A later GO press re-populates both fields from scratch using whatever
 * `intervalHours` is set at that later moment (see `logDose`) — Stop never
 * touches `intervalHours` itself, so an edit made after Stop and before the
 * next GO press governs the next cooldown, not whatever was in effect
 * before Stop was pressed (MED-11 AC4).
 *
 * A no-op (returns an equivalent list) if `id` doesn't match any
 * medication, or if the medication is not currently in cooldown — mirrors
 * `removeMedication`'s not-found behavior, and guards a Stop control that's
 * momentarily stale (e.g. the medication reactivated on its own an instant
 * before the click was processed).
 *
 * MED-32 reused this function, unreimplemented, as the "Revert to Active"
 * control's handler inside the Edit dialog. MED-34 removed that dedicated
 * control (and the Paused state it existed to revert *from*) and reuses this
 * same function again instead, still unreimplemented: tapping a Cooldown
 * card now calls this directly (`js/app.js`'s `handleCardTap`), producing the
 * exact same immediate cancel-and-revert-to-Active outcome the button used
 * to.
 *
 * `now` (epoch millis) is injectable for deterministic tests; it defaults
 * to `Date.now()`.
 */
export function stopCooldown(medications, id, now = Date.now()) {
  return medications.map((medication) =>
    medication.id === id && isInCooldown(medication, now)
      ? {
          ...medication,
          lastTakenAt: null,
          cooldownIntervalHours: null,
        }
      : medication
  );
}

/**
 * Milliseconds remaining until `medication`'s cooldown ends, clamped to 0
 * once it has elapsed (or if it was never logged).
 *
 * MED-34: no longer reads a leftover `pausedRemainingMs` field (MED-32's
 * now-removed Paused state) — remaining time is always derived fresh from
 * `lastTakenAt`/`cooldownIntervalHours`, so a stale value left over in
 * localStorage from before this story shipped is simply inert.
 */
export function getCooldownRemainingMs(medication, now = Date.now()) {
  if (!medication.lastTakenAt) return 0;
  return Math.max(0, cooldownReadyAt(medication) - now);
}

/**
 * The total length (in milliseconds) of `medication`'s current cooldown —
 * i.e. the interval that was active when GO was last pressed, not
 * necessarily the live `intervalHours`. Meaningful even when not currently
 * in cooldown (reflects whatever the last logged interval was).
 */
export function getCooldownTotalMs(medication) {
  return cooldownIntervalHoursFor(medication) * 60 * 60 * 1000;
}

/**
 * Fraction (0–1) of `medication`'s cooldown that remains, for driving the
 * card's fill: 1 the instant GO is pressed, receding toward 0 as time
 * passes, and exactly 0 once cooldown has ended. Always 0 when not
 * currently in cooldown, per the "Active cards show no fill" AC.
 */
export function getCooldownProgress(medication, now = Date.now()) {
  if (!isInCooldown(medication, now)) return 0;
  const totalMs = getCooldownTotalMs(medication);
  if (totalMs <= 0) return 0;
  return getCooldownRemainingMs(medication, now) / totalMs;
}

/**
 * Formats a non-negative duration in milliseconds as a short human-readable
 * string. Two precisions are supported:
 *
 * - Default (`includeSeconds: false`): hours/minutes only — "3h 12m", "45m",
 *   or "5h" when the minutes component is zero. Rounds up to the nearest
 *   minute (`Math.ceil`) rather than truncating, so a still-running duration
 *   never displays a misleading "0m" in its final seconds. This is what the
 *   *total* portion of `formatCountdown` uses (MED-8) — it's a static label,
 *   not a live-updating value, so second-level precision there would just be
 *   noise (MED-29 AC).
 * - `includeSeconds: true`: hours/minutes/seconds, exact to the second —
 *   "3h 12m 45s", "12m 45s", or "45s". Rounds up to the nearest second
 *   (`Math.ceil`), the same discipline as the minute-rounded default, one
 *   level finer. This is what the *remaining* portion of `formatCountdown`
 *   uses (MED-29), so the seconds digit genuinely counts down live.
 *
 * Zero-value components are omitted from both ends: leading zero components
 * (largest units) are dropped entirely, and trailing zero components
 * (smallest units) are dropped too — but at least one component is always
 * kept, so a fully-elapsed duration still renders ("0m" / "0s") rather than
 * an empty string. A zero component *between* two non-zero components (e.g.
 * 3h 0m 45s) is kept, since it isn't part of either the leading or trailing
 * zero run.
 */
export function formatDuration(ms, { includeSeconds = false } = {}) {
  if (!includeSeconds) {
    const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  }

  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const units = [
    { value: hours, suffix: "h" },
    { value: minutes, suffix: "m" },
    { value: seconds, suffix: "s" },
  ];

  let start = 0;
  while (start < units.length - 1 && units[start].value === 0) start++;
  let end = units.length - 1;
  while (end > start && units[end].value === 0) end--;

  return units
    .slice(start, end + 1)
    .map((unit) => `${unit.value}${unit.suffix}`)
    .join(" ");
}

/**
 * The countdown text shown on a cooldown card, e.g. "3h 12m 45s of 5h
 * remaining" — remaining time (exact to the second, MED-29), then the total
 * interval that was active when GO was pressed (per `getCooldownTotalMs`,
 * unchanged minute precision — MED-29 AC deliberately keeps the total a
 * static, non-live-ticking label). Returns `null` when the medication is not
 * currently in cooldown, so callers know not to render it.
 *
 * Format confirmed by product owner on 2026-07-09 (MED-8 ticket comment):
 * "{remaining} of {total} remaining", not the bare "{remaining} remaining"
 * wording in the story's acceptance-criteria text. MED-29 (2026-07-12) added
 * the seconds component to the remaining portion only, and dropped
 * `COOLDOWN_TICK_MS` (`js/app.js`) from 30s to ~1s so this text — and the
 * card's `--progress` fill — genuinely tick live rather than sitting frozen
 * for up to 29s between refreshes.
 */
export function formatCountdown(medication, now = Date.now()) {
  if (!isInCooldown(medication, now)) return null;
  const remaining = formatDuration(getCooldownRemainingMs(medication, now), {
    includeSeconds: true,
  });
  const total = formatDuration(getCooldownTotalMs(medication));
  return `${remaining} of ${total} remaining`;
}

/**
 * The short "{remaining} left" countdown text shown top-left on a Cooldown
 * card (MED-33), e.g. "2h 15m 30s left" — deliberately shorter than
 * `formatCountdown`'s "{remaining} of {total} remaining" (MED-8/MED-29),
 * which was written for that text's old bottom-right position (MED-18).
 * MED-33 relocated the countdown to a top-left strip shared with the
 * per-card icon row, where the longer "of {total} remaining" phrasing no
 * longer fit the available width — this supersedes it for that position,
 * reusing the exact same remaining-time math (`getCooldownRemainingMs` +
 * `formatDuration`'s `includeSeconds: true` precision) as `formatCountdown`'s
 * own remaining segment so the two can never drift out of sync with each
 * other. `formatCountdown` itself is unchanged and still exported — nothing
 * else in the app reads its output anymore, but no AC asks for its removal.
 * Returns `null` when the medication is not currently in cooldown, mirroring
 * `formatCountdown`'s own contract.
 */
export function formatRemainingLabel(medication, now = Date.now()) {
  if (!isInCooldown(medication, now)) return null;
  const remaining = formatDuration(getCooldownRemainingMs(medication, now), {
    includeSeconds: true,
  });
  return `${remaining} left`;
}

/**
 * MED-34: the always-visible "how often" readout shown on every card
 * (Active or Cooldown alike), e.g. "Every 8h" or "Every 4h 30m" for a
 * fractional interval — reuses `formatDuration`'s existing hours/minutes
 * formatting for consistency with the rest of the card's duration text,
 * rather than a second bespoke formatter.
 *
 * Deliberately takes the raw `intervalHours` number, not a medication
 * object: this is a general "how often is this medication taken" label,
 * distinct from the Cooldown countdown's `cooldownIntervalHours` snapshot
 * (`formatCountdown`'s "of Wh remaining" segment) — it reflects the live,
 * currently-set interval and updates immediately after an Edit-dialog
 * interval change, even mid-cooldown.
 */
export function formatIntervalLabel(intervalHours) {
  return `Every ${formatDuration(intervalHours * 60 * 60 * 1000)}`;
}

/**
 * Formats elapsed time since `momentMs` (epoch millis, or any value `new
 * Date()` accepts) as a relative-time string — e.g. "Just now", "12m ago",
 * "3h 5m ago", "1d 2h ago" — or the literal "Not yet taken" when `momentMs`
 * is `null`/falsy or unparseable (corrupted storage), mirroring
 * `isInCooldown`'s own guard for that case.
 *
 * A general "how long ago was this moment" formatter, not tied to any one
 * meaning of "this moment" — MED-38's Active-state top-strip text
 * (`formatLastTakenLabel`, below) is its only caller today, feeding in the
 * medication's wear-off instant (`cooldownReadyAt`) rather than its
 * `lastTakenAt` dose timestamp (see that function's own doc comment for why
 * the distinction matters); nothing here assumes which one it's given.
 *
 * Deliberately a *separate* implementation from `formatDuration`, not a
 * thin wrapper around it, despite the shared "Xh Ym", zero-component-
 * omission phrasing style: `formatDuration` rounds its minutes/seconds *up*
 * (`Math.ceil`) so a live countdown's remaining time never flashes a
 * misleading "0m"/"0s" in its final moments. A "how long ago" readout has
 * the opposite correctness requirement — rounding up would claim *more*
 * time has elapsed than truly has (e.g. 61s ago reading "2m ago"). This
 * function rounds down (`Math.floor`) instead, so "Xm ago" always means "at
 * least X whole minutes have elapsed", the conventional meaning of a
 * relative-time readout. Adds a day-level component (absent from
 * `formatDuration`) since, unlike a cooldown countdown (bounded by a
 * medication's interval, realistically well under a day), this can
 * meaningfully be days ago.
 *
 * `now` (epoch millis) is injectable for deterministic tests; it defaults
 * to `Date.now()`, the same discipline as every other `now`-taking function
 * in this module.
 */
export function formatRelativeTime(momentMs, now = Date.now()) {
  if (!momentMs) return "Not yet taken";
  const takenAtMs = new Date(momentMs).getTime();
  if (Number.isNaN(takenAtMs)) return "Not yet taken";

  const elapsedMs = Math.max(0, now - takenAtMs);
  if (elapsedMs < 60_000) return "Just now";

  const totalMinutes = Math.floor(elapsedMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h ago` : `${days}d ago`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m ago` : `${hours}h ago`;
  }
  return `${minutes}m ago`;
}

/**
 * The Active-state text for the shared top-strip slot (`.cooldown-countdown`
 * in app.js/CSS) that Cooldown's own `formatRemainingLabel` occupies while a
 * cooldown is running — both states now always populate this one slot
 * (MED-38, corrected per Jira comment 10320), rather than a separate line
 * under name/dose.
 *
 * "Not yet taken" for a medication that has never been logged
 * (`medication.lastTakenAt` falsy), checked explicitly here rather than
 * relying on `formatRelativeTime`'s own null handling: `cooldownReadyAt`
 * does *not* produce `NaN`/`null` for a falsy `lastTakenAt` (see its own
 * doc comment), so that check has to happen before calling it, not be
 * inferred from its return value.
 *
 * Otherwise, a relative "time since wear-off" reading — e.g. "Just now",
 * "12m ago" — measured from `cooldownReadyAt` (when the cooldown *ended*),
 * not `lastTakenAt` (when the dose was taken). This is the core of the
 * MED-38 scope correction: the first shipped version measured from the
 * dose timestamp, so the instant a Cooldown naturally reactivated to Active
 * (MED-9/10) it read the full interval length (e.g. "8h ago" for an 8h
 * medication) instead of "Just now". Reusing `cooldownReadyAt` — already
 * computed for `isInCooldown`/`getCooldownRemainingMs` — keeps this in sync
 * with exactly the same wear-off moment those use, rather than re-deriving
 * it.
 *
 * Only meaningful for a medication that isn't currently in cooldown — the
 * caller (`js/app.js`'s `updateCooldownDisplay`) uses `formatRemainingLabel`
 * for this same slot's text while a cooldown is running instead.
 */
export function formatLastTakenLabel(medication, now = Date.now()) {
  if (!medication.lastTakenAt) return "Not yet taken";
  return formatRelativeTime(cooldownReadyAt(medication), now);
}

/**
 * Formats a date as a "Weekday, Month Day" string, e.g. "Sunday, July 12" —
 * used in place of the static "Your medications" heading so the grey list
 * card orients the user to the day it's showing. Defaults to "now" but
 * accepts an explicit `date` so it stays pure/testable rather than reaching
 * for `new Date()` itself.
 *
 * Locale is pinned to "en-US" rather than passed as `undefined` so the
 * output is deterministic regardless of the host OS/browser/CI runner's
 * default locale (the rest of this app's copy is English-only anyway).
 */
export function formatCurrentDate(date = new Date()) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
