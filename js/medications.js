const STORAGE_KEY = "medications";

/**
 * Reads the medication list from the given storage. Never throws — a
 * missing or corrupted value (first run, or leftover data from a prior
 * schema) is treated as an empty list.
 */
export function loadMedications(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMedications(medications, storage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(medications));
}

export function validateMedication({ name, dose, time }) {
  const errors = [];
  if (!name || !name.trim()) errors.push("Name is required.");
  if (!dose || !dose.trim()) errors.push("Dose is required.");
  if (!time || !time.trim()) errors.push("Time is required.");
  return errors;
}

/**
 * Returns a new list with the medication appended. Throws with a
 * human-readable message if the medication is invalid.
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
    time: medication.time.trim(),
  };
  return [...medications, newMedication];
}

export function removeMedication(medications, id) {
  return medications.filter((medication) => medication.id !== id);
}
