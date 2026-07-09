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

export function validateMedication({ name, dose, intervalHours }) {
  const errors = [];
  if (!name || !name.trim()) errors.push("Name is required.");
  if (!dose || !dose.trim()) errors.push("Dose is required.");
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
 * intervalHours replaced. Every other field — including lastTakenAt and any
 * future status — is preserved untouched, so editing the interval never
 * disturbs a running cooldown (that recomputation is exclusively GO's job,
 * see MED-7). Throws a human-readable error on invalid input; the caller
 * should retain the previously saved value in that case.
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
