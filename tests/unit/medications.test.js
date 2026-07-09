import { describe, it, expect } from "vitest";
import {
  loadMedications,
  saveMedications,
  addMedication,
  updateMedicationInterval,
  removeMedication,
  validateMedication,
  validateInterval,
  logDose,
  isInCooldown,
  getCooldownRemainingMs,
  getCooldownTotalMs,
  getCooldownProgress,
  formatDuration,
  formatCountdown,
} from "../../js/medications.js";

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

describe("loadMedications", () => {
  it("returns an empty array when storage is empty", () => {
    expect(loadMedications(createMemoryStorage())).toEqual([]);
  });

  it("returns an empty array when stored data is corrupted JSON", () => {
    const storage = createMemoryStorage();
    storage.setItem("medications", "{not-json");
    expect(loadMedications(storage)).toEqual([]);
  });

  it("returns an empty array when stored data is not an array", () => {
    const storage = createMemoryStorage();
    storage.setItem("medications", JSON.stringify({ not: "an array" }));
    expect(loadMedications(storage)).toEqual([]);
  });

  it("returns stored medications when present", () => {
    const storage = createMemoryStorage();
    const meds = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
    ];
    storage.setItem("medications", JSON.stringify(meds));
    expect(loadMedications(storage)).toEqual(meds);
  });

  it("discards old-schema records that have a time field but no intervalHours", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "medications",
      JSON.stringify([{ id: "1", name: "Aspirin", dose: "100mg", time: "08:00" }])
    );
    expect(loadMedications(storage)).toEqual([]);
  });

  it("discards records with a non-positive or non-numeric intervalHours", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "medications",
      JSON.stringify([
        { id: "1", name: "A", dose: "1mg", intervalHours: 0 },
        { id: "2", name: "B", dose: "1mg", intervalHours: -4 },
        { id: "3", name: "C", dose: "1mg", intervalHours: "not-a-number" },
      ])
    );
    expect(loadMedications(storage)).toEqual([]);
  });

  it("keeps valid records and drops invalid ones from the same list", () => {
    const storage = createMemoryStorage();
    const valid = { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 6, lastTakenAt: null };
    storage.setItem(
      "medications",
      JSON.stringify([valid, { id: "2", name: "Old", dose: "5mg", time: "08:00" }])
    );
    expect(loadMedications(storage)).toEqual([valid]);
  });
});

describe("saveMedications", () => {
  it("round-trips through loadMedications", () => {
    const storage = createMemoryStorage();
    const meds = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
    ];
    saveMedications(meds, storage);
    expect(loadMedications(storage)).toEqual(meds);
  });
});

describe("validateInterval", () => {
  it("requires a value", () => {
    expect(validateInterval("")).toBe("Interval (hours) is required.");
    expect(validateInterval(null)).toBe("Interval (hours) is required.");
    expect(validateInterval(undefined)).toBe("Interval (hours) is required.");
    expect(validateInterval("   ")).toBe("Interval (hours) is required.");
  });

  it("rejects non-numeric values", () => {
    expect(validateInterval("abc")).toBe("Interval (hours) must be a positive number.");
  });

  it("rejects zero and negative values", () => {
    expect(validateInterval(0)).toBe("Interval (hours) must be a positive number.");
    expect(validateInterval(-2)).toBe("Interval (hours) must be a positive number.");
    expect(validateInterval("-4.5")).toBe("Interval (hours) must be a positive number.");
  });

  it("accepts a positive decimal value", () => {
    expect(validateInterval(4.5)).toBeNull();
    expect(validateInterval("4.5")).toBeNull();
  });
});

describe("validateMedication", () => {
  it("requires name, dose, and intervalHours", () => {
    expect(validateMedication({ name: "", dose: "", intervalHours: "" })).toHaveLength(3);
  });

  it("rejects whitespace-only fields", () => {
    expect(
      validateMedication({ name: "  ", dose: "100mg", intervalHours: 8 })
    ).toEqual(["Name is required."]);
  });

  it("rejects a non-numeric interval", () => {
    expect(
      validateMedication({ name: "Aspirin", dose: "100mg", intervalHours: "abc" })
    ).toEqual(["Interval (hours) must be a positive number."]);
  });

  it("rejects a zero or negative interval", () => {
    expect(
      validateMedication({ name: "Aspirin", dose: "100mg", intervalHours: 0 })
    ).toEqual(["Interval (hours) must be a positive number."]);
  });

  it("passes for a fully filled medication", () => {
    expect(
      validateMedication({ name: "Aspirin", dose: "100mg", intervalHours: 8 })
    ).toEqual([]);
  });
});

describe("addMedication", () => {
  it("adds a valid medication to the list with lastTakenAt null", () => {
    const result = addMedication([], { name: "Aspirin", dose: "100mg", intervalHours: 8 });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "Aspirin",
      dose: "100mg",
      intervalHours: 8,
      lastTakenAt: null,
    });
    expect(result[0].id).toBeTruthy();
  });

  it("stores intervalHours as a number even when given a numeric string", () => {
    const result = addMedication([], { name: "Aspirin", dose: "100mg", intervalHours: "4.5" });
    expect(result[0].intervalHours).toBe(4.5);
  });

  it("trims whitespace from name and dose", () => {
    const result = addMedication([], { name: " Aspirin ", dose: " 100mg ", intervalHours: 8 });
    expect(result[0]).toMatchObject({ name: "Aspirin", dose: "100mg" });
  });

  it("throws when required fields are missing", () => {
    expect(() => addMedication([], { name: "", dose: "", intervalHours: "" })).toThrow(
      "Name is required. Dose is required. Interval (hours) is required."
    );
  });

  it("throws when interval is zero or negative", () => {
    expect(() => addMedication([], { name: "Aspirin", dose: "100mg", intervalHours: 0 })).toThrow(
      "Interval (hours) must be a positive number."
    );
  });

  it("does not mutate the original list", () => {
    const original = [];
    addMedication(original, { name: "Aspirin", dose: "100mg", intervalHours: 8 });
    expect(original).toHaveLength(0);
  });
});

describe("updateMedicationInterval", () => {
  it("updates only the intervalHours of the matching medication", () => {
    const meds = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
    ];
    const result = updateMedicationInterval(meds, "1", 6);
    expect(result[0].intervalHours).toBe(6);
  });

  it("preserves lastTakenAt and every other field untouched (AC 11-13 invariant)", () => {
    const meds = [
      {
        id: "1",
        name: "Aspirin",
        dose: "100mg",
        intervalHours: 8,
        lastTakenAt: "2026-07-08T10:00:00.000Z",
      },
    ];
    const result = updateMedicationInterval(meds, "1", 12);
    expect(result[0]).toEqual({
      id: "1",
      name: "Aspirin",
      dose: "100mg",
      intervalHours: 12,
      lastTakenAt: "2026-07-08T10:00:00.000Z",
    });
  });

  it("does not affect other medications in the list", () => {
    const meds = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
      { id: "2", name: "Ibuprofen", dose: "200mg", intervalHours: 6, lastTakenAt: null },
    ];
    const result = updateMedicationInterval(meds, "1", 4);
    expect(result[1]).toEqual(meds[1]);
  });

  it("accepts a numeric string and stores it as a number", () => {
    const meds = [{ id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null }];
    const result = updateMedicationInterval(meds, "1", "5.5");
    expect(result[0].intervalHours).toBe(5.5);
  });

  it("throws on a non-numeric or non-positive value and does not mutate the list", () => {
    const meds = [{ id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null }];
    expect(() => updateMedicationInterval(meds, "1", "abc")).toThrow(
      "Interval (hours) must be a positive number."
    );
    expect(() => updateMedicationInterval(meds, "1", 0)).toThrow(
      "Interval (hours) must be a positive number."
    );
    expect(meds[0].intervalHours).toBe(8);
  });

  it("does not mutate the original list", () => {
    const meds = [{ id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null }];
    updateMedicationInterval(meds, "1", 4);
    expect(meds[0].intervalHours).toBe(8);
  });
});

describe("removeMedication", () => {
  it("removes a medication by id", () => {
    const meds = [
      { id: "1", name: "A" },
      { id: "2", name: "B" },
    ];
    expect(removeMedication(meds, "1")).toEqual([{ id: "2", name: "B" }]);
  });

  it("returns an equivalent list when the id is not found", () => {
    const meds = [{ id: "1", name: "A" }];
    expect(removeMedication(meds, "nope")).toEqual(meds);
  });
});

describe("logDose", () => {
  it("sets lastTakenAt to the given time, formatted as an ISO string", () => {
    const meds = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
    ];
    const now = new Date("2026-07-09T12:00:00.000Z").getTime();
    const result = logDose(meds, "1", now);
    expect(result[0].lastTakenAt).toBe("2026-07-09T12:00:00.000Z");
  });

  it("defaults to the current time when `now` is not provided", () => {
    const meds = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
    ];
    const before = Date.now();
    const result = logDose(meds, "1");
    const after = Date.now();
    const loggedTime = new Date(result[0].lastTakenAt).getTime();
    expect(loggedTime).toBeGreaterThanOrEqual(before);
    expect(loggedTime).toBeLessThanOrEqual(after);
  });

  it("preserves every other field of the logged medication", () => {
    const meds = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
    ];
    const result = logDose(meds, "1", Date.now());
    expect(result[0]).toMatchObject({
      id: "1",
      name: "Aspirin",
      dose: "100mg",
      intervalHours: 8,
    });
  });

  it("does not affect other medications in the list (isolation across medications)", () => {
    const meds = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
      { id: "2", name: "Ibuprofen", dose: "200mg", intervalHours: 6, lastTakenAt: null },
    ];
    const result = logDose(meds, "1", Date.now());
    expect(result[1]).toEqual(meds[1]);
  });

  it("does not mutate the original list", () => {
    const meds = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
    ];
    logDose(meds, "1", Date.now());
    expect(meds[0].lastTakenAt).toBeNull();
  });

  it("returns an equivalent list when the id is not found", () => {
    const meds = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
    ];
    const result = logDose(meds, "nope", Date.now());
    expect(result).toEqual(meds);
  });

  it("snapshots the current intervalHours into cooldownIntervalHours (MED-8)", () => {
    const meds = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
    ];
    const result = logDose(meds, "1", Date.now());
    expect(result[0].cooldownIntervalHours).toBe(8);
  });
});

describe("isInCooldown", () => {
  const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
  const med = {
    id: "1",
    name: "Aspirin",
    dose: "100mg",
    intervalHours: 1,
    cooldownIntervalHours: 1,
    lastTakenAt: new Date(takenAt).toISOString(),
  };
  const readyAt = takenAt + 60 * 60 * 1000;

  it("is false when the medication has never been logged", () => {
    expect(isInCooldown({ ...med, lastTakenAt: null }, takenAt)).toBe(false);
  });

  it("is true just before the ready time", () => {
    expect(isInCooldown(med, readyAt - 1)).toBe(true);
  });

  it("is false exactly at the ready time (now >= lastTaken + interval)", () => {
    expect(isInCooldown(med, readyAt)).toBe(false);
  });

  it("is false just after the ready time", () => {
    expect(isInCooldown(med, readyAt + 1)).toBe(false);
  });

  it("is true at the moment of logging", () => {
    expect(isInCooldown(med, takenAt)).toBe(true);
  });
});

describe("cooldown math at large elapsed magnitudes (MED-10 AC3)", () => {
  // Locks in that the decision is a plain `now >= readyAt` comparison with
  // no overflow, clamping, or special-casing as elapsed time grows — not
  // just correct for the small (seconds/minutes) magnitudes exercised
  // elsewhere, but also many days past the ready time.
  const takenAt = new Date("2026-07-01T00:00:00.000Z").getTime();
  const med = {
    id: "1",
    name: "Aspirin",
    dose: "100mg",
    intervalHours: 1,
    cooldownIntervalHours: 1,
    lastTakenAt: new Date(takenAt).toISOString(),
  };
  const readyAt = takenAt + 60 * 60 * 1000;
  const thirtyDaysPastReady = readyAt + 30 * 24 * 60 * 60 * 1000;

  it("is false many days past the ready time", () => {
    expect(isInCooldown(med, thirtyDaysPastReady)).toBe(false);
  });

  it("has zero remaining time many days past the ready time", () => {
    expect(getCooldownRemainingMs(med, thirtyDaysPastReady)).toBe(0);
  });

  it("has zero progress many days past the ready time", () => {
    expect(getCooldownProgress(med, thirtyDaysPastReady)).toBe(0);
  });
});

describe("isInCooldown corrupted lastTakenAt guard (MED-10 AC4)", () => {
  it("treats an unparseable lastTakenAt as not-in-cooldown (Active), without throwing", () => {
    const med = {
      id: "1",
      name: "Aspirin",
      dose: "100mg",
      intervalHours: 8,
      cooldownIntervalHours: 8,
      lastTakenAt: "not-a-valid-date",
    };
    expect(() => isInCooldown(med, Date.now())).not.toThrow();
    expect(isInCooldown(med, Date.now())).toBe(false);
  });
});

describe("cooldown interval snapshot freezes against an edit (MED-5/MED-8 invariant)", () => {
  it("computes remaining time against the interval active at logDose time, not a later edit", () => {
    let meds = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
    ];
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();

    meds = logDose(meds, "1", takenAt);
    // Mid-cooldown edit: interval drops from 8 to 2 hours.
    meds = updateMedicationInterval(meds, "1", 2);

    const threeHoursLater = takenAt + 3 * 60 * 60 * 1000;

    // With the *edited* 2h interval, this medication would already have
    // reactivated by now (3h > 2h). The frozen 8h snapshot says otherwise.
    expect(isInCooldown(meds[0], threeHoursLater)).toBe(true);
    expect(getCooldownRemainingMs(meds[0], threeHoursLater)).toBe(
      5 * 60 * 60 * 1000
    );
    expect(getCooldownTotalMs(meds[0])).toBe(8 * 60 * 60 * 1000);

    // The edited value is still there, ready to govern the *next* GO press.
    expect(meds[0].intervalHours).toBe(2);
  });

  it("falls back to intervalHours for a medication logged before cooldownIntervalHours existed", () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const legacyMed = {
      id: "1",
      name: "Aspirin",
      dose: "100mg",
      intervalHours: 4,
      lastTakenAt: new Date(takenAt).toISOString(),
      // No cooldownIntervalHours field at all.
    };
    expect(getCooldownTotalMs(legacyMed)).toBe(4 * 60 * 60 * 1000);
    expect(isInCooldown(legacyMed, takenAt + 60 * 60 * 1000)).toBe(true);
  });
});

describe("getCooldownProgress", () => {
  const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
  const totalMs = 8 * 60 * 60 * 1000;
  const med = {
    id: "1",
    name: "Aspirin",
    dose: "100mg",
    intervalHours: 8,
    cooldownIntervalHours: 8,
    lastTakenAt: new Date(takenAt).toISOString(),
  };

  it("is 1 (100%) at the instant GO is pressed", () => {
    expect(getCooldownProgress(med, takenAt)).toBe(1);
  });

  it("is 0.75 after 25% of the interval has elapsed", () => {
    expect(getCooldownProgress(med, takenAt + totalMs * 0.25)).toBeCloseTo(0.75);
  });

  it("is 0.5 at the halfway point", () => {
    expect(getCooldownProgress(med, takenAt + totalMs * 0.5)).toBeCloseTo(0.5);
  });

  it("is 0.25 after 75% of the interval has elapsed", () => {
    expect(getCooldownProgress(med, takenAt + totalMs * 0.75)).toBeCloseTo(0.25);
  });

  it("is exactly 0 once the interval has fully elapsed", () => {
    expect(getCooldownProgress(med, takenAt + totalMs)).toBe(0);
  });

  it("is 0 for a medication that is not in cooldown", () => {
    expect(getCooldownProgress({ ...med, lastTakenAt: null }, takenAt)).toBe(0);
  });
});

describe("formatDuration", () => {
  it("formats whole hours with no minutes component", () => {
    expect(formatDuration(5 * 60 * 60 * 1000)).toBe("5h");
  });

  it("formats hours and minutes together", () => {
    expect(formatDuration((3 * 60 + 12) * 60 * 1000)).toBe("3h 12m");
  });

  it("formats minutes-only durations with no hours component", () => {
    expect(formatDuration(45 * 60 * 1000)).toBe("45m");
  });

  it("rounds up to the nearest minute rather than truncating", () => {
    // 44 minutes 30 seconds should read as 45m, not 44m.
    expect(formatDuration(44.5 * 60 * 1000)).toBe("45m");
  });

  it("clamps negative durations to zero", () => {
    expect(formatDuration(-1000)).toBe("0m");
  });
});

describe("formatCountdown", () => {
  it('formats as "{remaining} of {total} remaining" (PO-confirmed wording)', () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const med = {
      id: "1",
      name: "Aspirin",
      dose: "100mg",
      intervalHours: 5,
      cooldownIntervalHours: 5,
      lastTakenAt: new Date(takenAt).toISOString(),
    };
    const now = takenAt + (1 * 60 + 48) * 60 * 1000; // 1h48m elapsed of 5h
    expect(formatCountdown(med, now)).toBe("3h 12m of 5h remaining");
  });

  it("returns null when the medication is not in cooldown", () => {
    const med = {
      id: "1",
      name: "Aspirin",
      dose: "100mg",
      intervalHours: 5,
      lastTakenAt: null,
    };
    expect(formatCountdown(med, Date.now())).toBeNull();
  });
});
