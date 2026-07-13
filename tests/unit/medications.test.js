import { describe, it, expect } from "vitest";
import {
  loadMedications,
  saveMedications,
  addMedication,
  updateMedicationInterval,
  updateMedicationDetails,
  removeMedication,
  validateMedication,
  validateInterval,
  validateNameAndDose,
  logDose,
  stopCooldown,
  pauseCooldown,
  resumeCooldown,
  isPaused,
  isInCooldown,
  getCooldownRemainingMs,
  getCooldownTotalMs,
  getCooldownProgress,
  formatDuration,
  formatCountdown,
  formatCurrentDate,
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

describe("validateNameAndDose", () => {
  it("requires both name and dose", () => {
    expect(validateNameAndDose({ name: "", dose: "" })).toEqual([
      "Name is required.",
      "Dose is required.",
    ]);
  });

  it("rejects whitespace-only fields", () => {
    expect(validateNameAndDose({ name: "  ", dose: "100mg" })).toEqual([
      "Name is required.",
    ]);
  });

  it("passes for fully filled name and dose", () => {
    expect(validateNameAndDose({ name: "Aspirin", dose: "100mg" })).toEqual([]);
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

  it("seeds pausedRemainingMs as null (MED-32) — not paused until explicitly paused", () => {
    const result = addMedication([], { name: "Aspirin", dose: "100mg", intervalHours: 8 });
    expect(result[0].pausedRemainingMs).toBeNull();
    expect(isPaused(result[0])).toBe(false);
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

describe("updateMedicationDetails (MED-17)", () => {
  it("updates only the name and dose of the matching medication (MED-17 AC5)", () => {
    const meds = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
    ];
    const result = updateMedicationDetails(meds, "1", { name: "Ibuprofen", dose: "200mg" });
    expect(result[0]).toMatchObject({ name: "Ibuprofen", dose: "200mg" });
  });

  it("trims whitespace from name and dose", () => {
    const meds = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
    ];
    const result = updateMedicationDetails(meds, "1", { name: " Ibuprofen ", dose: " 200mg " });
    expect(result[0]).toMatchObject({ name: "Ibuprofen", dose: "200mg" });
  });

  it(
    "preserves lastTakenAt, cooldownIntervalHours, and intervalHours untouched — editing " +
      "Name/Dose never disturbs a running cooldown (MED-17's central invariant, mirrors " +
      "updateMedicationInterval's AC 11-13 invariant)",
    () => {
      const meds = [
        {
          id: "1",
          name: "Aspirin",
          dose: "100mg",
          intervalHours: 8,
          cooldownIntervalHours: 8,
          lastTakenAt: "2026-07-08T10:00:00.000Z",
        },
      ];
      const result = updateMedicationDetails(meds, "1", { name: "Ibuprofen", dose: "200mg" });
      expect(result[0]).toEqual({
        id: "1",
        name: "Ibuprofen",
        dose: "200mg",
        intervalHours: 8,
        cooldownIntervalHours: 8,
        lastTakenAt: "2026-07-08T10:00:00.000Z",
      });
    }
  );

  it("does not disturb isInCooldown/remaining time/progress for a medication mid-cooldown", () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const meds = [
      {
        id: "1",
        name: "Aspirin",
        dose: "100mg",
        intervalHours: 8,
        cooldownIntervalHours: 8,
        lastTakenAt: new Date(takenAt).toISOString(),
      },
    ];
    const now = takenAt + 3 * 60 * 60 * 1000;
    const before = {
      inCooldown: isInCooldown(meds[0], now),
      remaining: getCooldownRemainingMs(meds[0], now),
      progress: getCooldownProgress(meds[0], now),
    };

    const result = updateMedicationDetails(meds, "1", { name: "Ibuprofen", dose: "200mg" });

    expect(isInCooldown(result[0], now)).toBe(before.inCooldown);
    expect(getCooldownRemainingMs(result[0], now)).toBe(before.remaining);
    expect(getCooldownProgress(result[0], now)).toBe(before.progress);
  });

  it("leaves an Active (never-logged) medication Active — editing does not start a cooldown", () => {
    const meds = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
    ];
    const result = updateMedicationDetails(meds, "1", { name: "Ibuprofen", dose: "200mg" });
    expect(result[0].lastTakenAt).toBeNull();
    expect(isInCooldown(result[0])).toBe(false);
  });

  it("does not affect other medications in the list (MED-17 AC13)", () => {
    const meds = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
      { id: "2", name: "Ibuprofen", dose: "200mg", intervalHours: 6, lastTakenAt: null },
    ];
    const result = updateMedicationDetails(meds, "1", { name: "Paracetamol", dose: "500mg" });
    expect(result[1]).toEqual(meds[1]);
  });

  it("throws when name or dose is empty and does not mutate the list", () => {
    const meds = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
    ];
    expect(() => updateMedicationDetails(meds, "1", { name: "", dose: "" })).toThrow(
      "Name is required. Dose is required."
    );
    expect(meds[0]).toMatchObject({ name: "Aspirin", dose: "100mg" });
  });

  it("does not mutate the original list on a successful update", () => {
    const meds = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
    ];
    updateMedicationDetails(meds, "1", { name: "Ibuprofen", dose: "200mg" });
    expect(meds[0]).toMatchObject({ name: "Aspirin", dose: "100mg" });
  });

  it("returns an equivalent list when the id is not found", () => {
    const meds = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
    ];
    expect(updateMedicationDetails(meds, "nope", { name: "X", dose: "1mg" })).toEqual(meds);
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

  it("discards a cooldown medication's countdown/timestamp data along with it, with no special-casing vs. an Active medication (MED-12 AC6)", () => {
    const meds = [
      { id: "1", name: "Active one", lastTakenAt: null },
      {
        id: "2",
        name: "Cooldown one",
        lastTakenAt: "2026-07-12T00:00:00.000Z",
        cooldownIntervalHours: 8,
        intervalHours: 8,
      },
    ];
    // Same filter-by-id code path handles both — there is no branch on
    // cooldown status, so a cooldown medication's extra fields are simply
    // gone with the rest of the record, not cleared or migrated specially.
    expect(removeMedication(meds, "2")).toEqual([meds[0]]);
  });

  it("leaves every other medication's data completely unaffected when one of several is deleted (MED-12 AC7)", () => {
    const meds = [
      { id: "1", name: "A", intervalHours: 4, lastTakenAt: null },
      {
        id: "2",
        name: "B",
        intervalHours: 8,
        lastTakenAt: "2026-07-12T00:00:00.000Z",
        cooldownIntervalHours: 8,
      },
      { id: "3", name: "C", intervalHours: 6, lastTakenAt: null },
    ];
    const result = removeMedication(meds, "2");
    expect(result).toEqual([meds[0], meds[2]]);
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

describe("stopCooldown (MED-11)", () => {
  it("cancels an active cooldown by clearing lastTakenAt and the interval snapshot (MED-11 AC2)", () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const meds = [
      {
        id: "1",
        name: "Aspirin",
        dose: "100mg",
        intervalHours: 8,
        cooldownIntervalHours: 8,
        lastTakenAt: new Date(takenAt).toISOString(),
      },
    ];
    const oneHourIn = takenAt + 60 * 60 * 1000;
    expect(isInCooldown(meds[0], oneHourIn)).toBe(true);

    const result = stopCooldown(meds, "1", oneHourIn);

    expect(result[0].lastTakenAt).toBeNull();
    expect(result[0].cooldownIntervalHours).toBeNull();
    expect(isInCooldown(result[0], oneHourIn)).toBe(false);
  });

  it("the resulting state is indistinguishable from a medication that reached Active by natural elapse (MED-11 AC3)", () => {
    const now = new Date("2026-07-09T00:00:00.000Z").getTime();

    const naturallyElapsed = {
      id: "1",
      name: "Aspirin",
      dose: "100mg",
      intervalHours: 8,
      cooldownIntervalHours: 8,
      lastTakenAt: new Date(now - 9 * 60 * 60 * 1000).toISOString(),
    };
    const [stopped] = stopCooldown(
      [
        {
          id: "2",
          name: "Aspirin",
          dose: "100mg",
          intervalHours: 8,
          cooldownIntervalHours: 8,
          lastTakenAt: new Date(now).toISOString(),
        },
      ],
      "2",
      now
    );

    expect(isInCooldown(stopped, now)).toBe(isInCooldown(naturallyElapsed, now));
    expect(getCooldownRemainingMs(stopped, now)).toBe(
      getCooldownRemainingMs(naturallyElapsed, now)
    );
    expect(getCooldownProgress(stopped, now)).toBe(getCooldownProgress(naturallyElapsed, now));
    expect(formatCountdown(stopped, now)).toBe(formatCountdown(naturallyElapsed, now));
  });

  it("is a no-op when the medication is not currently in cooldown (MED-11 AC1 guard)", () => {
    const active = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
    ];
    expect(stopCooldown(active, "1")).toEqual(active);
  });

  it("is a no-op when the id does not match any medication", () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const meds = [
      {
        id: "1",
        name: "Aspirin",
        dose: "100mg",
        intervalHours: 8,
        cooldownIntervalHours: 8,
        lastTakenAt: new Date(takenAt).toISOString(),
      },
    ];
    expect(stopCooldown(meds, "nope", takenAt)).toEqual(meds);
  });

  it("does not affect other medications in the list (isolation across medications)", () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const meds = [
      {
        id: "1",
        name: "Aspirin",
        dose: "100mg",
        intervalHours: 8,
        cooldownIntervalHours: 8,
        lastTakenAt: new Date(takenAt).toISOString(),
      },
      {
        id: "2",
        name: "Ibuprofen",
        dose: "200mg",
        intervalHours: 6,
        cooldownIntervalHours: 6,
        lastTakenAt: new Date(takenAt).toISOString(),
      },
    ];
    const result = stopCooldown(meds, "1", takenAt);
    expect(result[1]).toEqual(meds[1]);
    expect(isInCooldown(result[1], takenAt)).toBe(true);
  });

  it("does not mutate the original list", () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const meds = [
      {
        id: "1",
        name: "Aspirin",
        dose: "100mg",
        intervalHours: 8,
        cooldownIntervalHours: 8,
        lastTakenAt: new Date(takenAt).toISOString(),
      },
    ];
    stopCooldown(meds, "1", takenAt);
    expect(meds[0].lastTakenAt).not.toBeNull();
  });

  it("leaves intervalHours untouched, so a later GO press uses whatever interval is set at that moment (MED-11 AC4)", () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    let meds = [
      {
        id: "1",
        name: "Aspirin",
        dose: "100mg",
        intervalHours: 8,
        cooldownIntervalHours: 8,
        lastTakenAt: new Date(takenAt).toISOString(),
      },
    ];

    meds = stopCooldown(meds, "1", takenAt);
    expect(meds[0].intervalHours).toBe(8);

    meds = updateMedicationInterval(meds, "1", 3);
    const laterTakenAt = takenAt + 60 * 60 * 1000;
    meds = logDose(meds, "1", laterTakenAt);

    expect(meds[0].cooldownIntervalHours).toBe(3);
    expect(getCooldownTotalMs(meds[0])).toBe(3 * 60 * 60 * 1000);
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

describe("reactivation starts a fresh cooldown cycle, no carryover from the prior cycle (MED-9 AC3)", () => {
  it("a second logDose after natural reactivation governs cooldown by the new interval and new timestamp only", () => {
    let meds = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null },
    ];
    const firstTakenAt = new Date("2026-07-09T00:00:00.000Z").getTime();

    // First cycle: GO pressed with an 8h interval.
    meds = logDose(meds, "1", firstTakenAt);
    expect(meds[0].cooldownIntervalHours).toBe(8);

    // Well past the first 8h cycle: medication has naturally reactivated.
    const reactivatedAt = firstTakenAt + 9 * 60 * 60 * 1000;
    expect(isInCooldown(meds[0], reactivatedAt)).toBe(false);

    // Interval changes to 3h while the medication is sitting Active.
    meds = updateMedicationInterval(meds, "1", 3);

    // GO pressed again, with a fresh timestamp — this must start an
    // entirely new cycle, not resume or extend the old 8h one.
    const secondTakenAt = reactivatedAt + 60 * 60 * 1000;
    meds = logDose(meds, "1", secondTakenAt);

    expect(meds[0].lastTakenAt).toBe(new Date(secondTakenAt).toISOString());
    expect(meds[0].cooldownIntervalHours).toBe(3);
    expect(getCooldownTotalMs(meds[0])).toBe(3 * 60 * 60 * 1000);

    // Just before the new 3h window ends: still in cooldown against the
    // *new* cycle. (Stale 8h math would have already reactivated it here.)
    const justBeforeNewReady = secondTakenAt + 3 * 60 * 60 * 1000 - 1;
    expect(isInCooldown(meds[0], justBeforeNewReady)).toBe(true);
    expect(getCooldownRemainingMs(meds[0], justBeforeNewReady)).toBe(1);

    // Exactly at the new 3h boundary: reactivated again, on schedule.
    const newReadyAt = secondTakenAt + 3 * 60 * 60 * 1000;
    expect(isInCooldown(meds[0], newReadyAt)).toBe(false);
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

  // MED-29: `includeSeconds: true` is what `formatCountdown` uses for the
  // *remaining* portion of the countdown text — exact-second precision, with
  // zero-value components omitted from both ends the same way the default
  // hours/minutes format already omits a zero-hours or zero-minutes
  // component, extended one level down for seconds.
  describe("with includeSeconds: true", () => {
    it("formats hours, minutes, and seconds together", () => {
      const ms = (3 * 3600 + 12 * 60 + 45) * 1000;
      expect(formatDuration(ms, { includeSeconds: true })).toBe("3h 12m 45s");
    });

    it("omits the hours component when under an hour remains", () => {
      const ms = (12 * 60 + 45) * 1000;
      expect(formatDuration(ms, { includeSeconds: true })).toBe("12m 45s");
    });

    it("omits both hours and minutes when under a minute remains", () => {
      expect(formatDuration(45 * 1000, { includeSeconds: true })).toBe("45s");
    });

    it("omits a trailing zero-minutes-and-seconds pair on an exact hour boundary", () => {
      expect(formatDuration(8 * 3600 * 1000, { includeSeconds: true })).toBe("8h");
    });

    it("omits a trailing zero-seconds component on an exact minute boundary", () => {
      expect(formatDuration(5 * 60 * 1000, { includeSeconds: true })).toBe("5m");
    });

    it("keeps a zero-minutes component that sits between non-zero hours and seconds", () => {
      const ms = (3 * 3600 + 45) * 1000; // 3h 0m 45s
      expect(formatDuration(ms, { includeSeconds: true })).toBe("3h 0m 45s");
    });

    it("rounds up to the nearest second rather than truncating", () => {
      // 44.5 seconds should read as 45s, not 44s.
      expect(formatDuration(44.5 * 1000, { includeSeconds: true })).toBe("45s");
    });

    it("clamps negative durations to zero", () => {
      expect(formatDuration(-1000, { includeSeconds: true })).toBe("0s");
    });
  });
});

describe("formatCountdown", () => {
  it('formats as "{remaining} of {total} remaining" with seconds in the remaining portion only (MED-29)', () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const med = {
      id: "1",
      name: "Aspirin",
      dose: "100mg",
      intervalHours: 5,
      cooldownIntervalHours: 5,
      lastTakenAt: new Date(takenAt).toISOString(),
    };
    // 1h47m15s elapsed of 5h leaves exactly 3h12m45s remaining — the
    // seconds-inclusive example from the MED-29 acceptance criteria. The
    // total portion ("5h") stays minutes-only, per AC.
    const now = takenAt + (1 * 3600 + 47 * 60 + 15) * 1000;
    expect(formatCountdown(med, now)).toBe("3h 12m 45s of 5h remaining");
  });

  it("omits zero-value components in the remaining portion down to just seconds when under a minute remains", () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const med = {
      id: "1",
      name: "Aspirin",
      dose: "100mg",
      intervalHours: 1,
      cooldownIntervalHours: 1,
      lastTakenAt: new Date(takenAt).toISOString(),
    };
    const now = takenAt + (1 * 3600 - 45) * 1000; // 45s left of a 1h cooldown
    expect(formatCountdown(med, now)).toBe("45s of 1h remaining");
  });

  it("keeps the total portion at minute precision even when remaining includes seconds", () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const med = {
      id: "1",
      name: "Aspirin",
      dose: "100mg",
      intervalHours: 5,
      cooldownIntervalHours: 5,
      lastTakenAt: new Date(takenAt).toISOString(),
    };
    const now = takenAt + 5 * 1000; // 5 seconds elapsed
    expect(formatCountdown(med, now)).toBe("4h 59m 55s of 5h remaining");
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

describe("formatCurrentDate", () => {
  it('formats a date as "Weekday, Month Day"', () => {
    // 2026-07-12 is a Sunday. Use noon UTC so no timezone the CI runner
    // might be in shifts it to an adjacent calendar day.
    const date = new Date("2026-07-12T12:00:00.000Z");
    expect(formatCurrentDate(date)).toBe("Sunday, July 12");
  });

  it("defaults to the current date when called with no argument", () => {
    expect(formatCurrentDate()).toBe(formatCurrentDate(new Date()));
  });
});

// --- MED-32: pause/resume/reset a cooldown --------------------------------

describe("isPaused", () => {
  it("is false when pausedRemainingMs is null", () => {
    expect(isPaused({ id: "1", pausedRemainingMs: null })).toBe(false);
  });

  it("is false when pausedRemainingMs is absent entirely (legacy record)", () => {
    expect(isPaused({ id: "1" })).toBe(false);
  });

  it("is true when pausedRemainingMs is a number, including zero", () => {
    expect(isPaused({ id: "1", pausedRemainingMs: 60_000 })).toBe(true);
    expect(isPaused({ id: "1", pausedRemainingMs: 0 })).toBe(true);
  });
});

describe("pauseCooldown (MED-32)", () => {
  function cooldownMed(overrides = {}) {
    const takenAt = new Date("2026-07-12T00:00:00.000Z").getTime();
    return {
      id: "1",
      name: "Aspirin",
      dose: "100mg",
      intervalHours: 8,
      cooldownIntervalHours: 8,
      lastTakenAt: new Date(takenAt).toISOString(),
      pausedRemainingMs: null,
      ...overrides,
    };
  }

  it("freezes the exact remaining time into pausedRemainingMs, without touching lastTakenAt or cooldownIntervalHours", () => {
    const takenAt = new Date("2026-07-12T00:00:00.000Z").getTime();
    const med = cooldownMed();
    const twoHoursIn = takenAt + 2 * 60 * 60 * 1000;

    const [result] = pauseCooldown([med], "1", twoHoursIn);

    expect(result.pausedRemainingMs).toBe(6 * 60 * 60 * 1000);
    expect(result.lastTakenAt).toBe(med.lastTakenAt);
    expect(result.cooldownIntervalHours).toBe(8);
  });

  it("isInCooldown/getCooldownRemainingMs/getCooldownProgress/formatCountdown all reflect the frozen value immediately after pausing", () => {
    const takenAt = new Date("2026-07-12T00:00:00.000Z").getTime();
    const med = cooldownMed();
    const twoHoursIn = takenAt + 2 * 60 * 60 * 1000;

    const [paused] = pauseCooldown([med], "1", twoHoursIn);

    expect(isInCooldown(paused, twoHoursIn)).toBe(true);
    expect(getCooldownRemainingMs(paused, twoHoursIn)).toBe(6 * 60 * 60 * 1000);
    expect(getCooldownProgress(paused, twoHoursIn)).toBeCloseTo(0.75);
    expect(formatCountdown(paused, twoHoursIn)).toBe("6h of 8h remaining");
  });

  it("is a no-op when the medication is not currently in cooldown (Active)", () => {
    const active = [
      { id: "1", name: "Aspirin", dose: "100mg", intervalHours: 8, lastTakenAt: null, pausedRemainingMs: null },
    ];
    expect(pauseCooldown(active, "1")).toEqual(active);
  });

  it("is a no-op when already paused — does not re-capture a smaller remaining value on top of the frozen one", () => {
    const takenAt = new Date("2026-07-12T00:00:00.000Z").getTime();
    const med = cooldownMed({ pausedRemainingMs: 5 * 60 * 60 * 1000 });
    const muchLater = takenAt + 7 * 60 * 60 * 1000;

    const [result] = pauseCooldown([med], "1", muchLater);

    expect(result.pausedRemainingMs).toBe(5 * 60 * 60 * 1000);
  });

  it("is a no-op when the id does not match any medication", () => {
    const med = cooldownMed();
    expect(pauseCooldown([med], "nope")).toEqual([med]);
  });

  it("does not affect other medications in the list", () => {
    const takenAt = new Date("2026-07-12T00:00:00.000Z").getTime();
    const other = cooldownMed({ id: "2", name: "Ibuprofen" });
    const med = cooldownMed();
    const twoHoursIn = takenAt + 2 * 60 * 60 * 1000;

    const result = pauseCooldown([med, other], "1", twoHoursIn);

    expect(result[1]).toEqual(other);
  });

  it("does not mutate the original list", () => {
    const takenAt = new Date("2026-07-12T00:00:00.000Z").getTime();
    const med = cooldownMed();
    pauseCooldown([med], "1", takenAt + 2 * 60 * 60 * 1000);
    expect(med.pausedRemainingMs).toBeNull();
  });
});

describe("resumeCooldown (MED-32)", () => {
  it("backdates lastTakenAt so the resumed cooldown counts down from exactly the frozen remaining time", () => {
    const med = {
      id: "1",
      name: "Aspirin",
      dose: "100mg",
      intervalHours: 8,
      cooldownIntervalHours: 8,
      lastTakenAt: new Date("2026-07-12T00:00:00.000Z").toISOString(),
      pausedRemainingMs: 6 * 60 * 60 * 1000, // paused with 6h left of an 8h cooldown
    };
    const resumeAt = new Date("2026-07-13T00:00:00.000Z").getTime(); // a day later, in real time

    const [result] = resumeCooldown([med], "1", resumeAt);

    expect(result.pausedRemainingMs).toBeNull();
    expect(getCooldownRemainingMs(result, resumeAt)).toBe(6 * 60 * 60 * 1000);
    expect(isInCooldown(result, resumeAt)).toBe(true);

    // Exactly 6h after resuming, the cooldown ends — proving it counts down
    // from the frozen remainder, not from a restarted 8h or from whatever
    // real time actually elapsed while paused.
    const sixHoursAfterResume = resumeAt + 6 * 60 * 60 * 1000;
    expect(isInCooldown(result, sixHoursAfterResume)).toBe(false);
    expect(isInCooldown(result, sixHoursAfterResume - 1)).toBe(true);
  });

  it("uses the medication's snapshotted cooldownIntervalHours for the resume math, not a live intervalHours edited while paused (MED-8 invariant)", () => {
    const med = {
      id: "1",
      name: "Aspirin",
      dose: "100mg",
      intervalHours: 2, // edited down from 8 while paused
      cooldownIntervalHours: 8, // the snapshot from when GO was originally pressed
      lastTakenAt: new Date("2026-07-12T00:00:00.000Z").toISOString(),
      pausedRemainingMs: 6 * 60 * 60 * 1000,
    };
    const resumeAt = new Date("2026-07-12T05:00:00.000Z").getTime();

    const [result] = resumeCooldown([med], "1", resumeAt);

    // Still 6h remaining against the *original* 8h total, not recomputed
    // against the edited 2h value.
    expect(getCooldownRemainingMs(result, resumeAt)).toBe(6 * 60 * 60 * 1000);
    expect(getCooldownTotalMs(result)).toBe(8 * 60 * 60 * 1000);
  });

  it("is a no-op when the medication is not currently paused", () => {
    const running = [
      {
        id: "1",
        name: "Aspirin",
        dose: "100mg",
        intervalHours: 8,
        cooldownIntervalHours: 8,
        lastTakenAt: new Date("2026-07-12T00:00:00.000Z").toISOString(),
        pausedRemainingMs: null,
      },
    ];
    expect(resumeCooldown(running, "1")).toEqual(running);
  });

  it("is a no-op when the id does not match any medication", () => {
    const med = {
      id: "1",
      pausedRemainingMs: 60_000,
      lastTakenAt: new Date().toISOString(),
      cooldownIntervalHours: 1,
    };
    expect(resumeCooldown([med], "nope")).toEqual([med]);
  });

  it("does not affect other medications in the list", () => {
    const paused = {
      id: "1",
      name: "Aspirin",
      intervalHours: 8,
      cooldownIntervalHours: 8,
      lastTakenAt: new Date("2026-07-12T00:00:00.000Z").toISOString(),
      pausedRemainingMs: 6 * 60 * 60 * 1000,
    };
    const other = {
      id: "2",
      name: "Ibuprofen",
      intervalHours: 6,
      cooldownIntervalHours: 6,
      lastTakenAt: new Date("2026-07-12T00:00:00.000Z").toISOString(),
      pausedRemainingMs: 3 * 60 * 60 * 1000,
    };

    const result = resumeCooldown([paused, other], "1", Date.now());

    expect(result[1]).toEqual(other);
    expect(isPaused(result[1])).toBe(true);
  });

  it("does not mutate the original list", () => {
    const med = {
      id: "1",
      intervalHours: 8,
      cooldownIntervalHours: 8,
      lastTakenAt: new Date("2026-07-12T00:00:00.000Z").toISOString(),
      pausedRemainingMs: 6 * 60 * 60 * 1000,
    };
    resumeCooldown([med], "1", Date.now());
    expect(med.pausedRemainingMs).toBe(6 * 60 * 60 * 1000);
  });
});

describe("a paused medication never auto-reactivates, no matter how much real time passes (MED-9/MED-10 guarantee through MED-32 pausing)", () => {
  it("isInCooldown stays true many days past when the original cooldown would have elapsed", () => {
    const med = {
      id: "1",
      name: "Aspirin",
      intervalHours: 1,
      cooldownIntervalHours: 1,
      lastTakenAt: new Date("2026-07-01T00:00:00.000Z").toISOString(),
      pausedRemainingMs: 30 * 60 * 1000, // paused with 30 minutes left of a 1h cooldown
    };
    const thirtyDaysLater =
      new Date("2026-07-01T00:00:00.000Z").getTime() + 30 * 24 * 60 * 60 * 1000;

    expect(isInCooldown(med, thirtyDaysLater)).toBe(true);
    expect(getCooldownRemainingMs(med, thirtyDaysLater)).toBe(30 * 60 * 1000);
    expect(getCooldownProgress(med, thirtyDaysLater)).toBeCloseTo(0.5);
  });

  it("even a corrupted/unparseable lastTakenAt does not break the paused short-circuit", () => {
    const med = {
      id: "1",
      intervalHours: 1,
      cooldownIntervalHours: 1,
      lastTakenAt: "not-a-valid-date",
      pausedRemainingMs: 60_000,
    };
    expect(() => isInCooldown(med, Date.now())).not.toThrow();
    expect(isInCooldown(med, Date.now())).toBe(true);
    expect(getCooldownRemainingMs(med, Date.now())).toBe(60_000);
  });
});

describe("logDose clears pausedRemainingMs (MED-32 AC4 — Reset from Paused regression guard)", () => {
  it("clears a stale paused snapshot when logDose (Reset, or a fresh tap-on-Active) is called", () => {
    const now = new Date("2026-07-12T00:00:00.000Z").getTime();
    const med = {
      id: "1",
      name: "Aspirin",
      intervalHours: 8,
      cooldownIntervalHours: 8,
      lastTakenAt: new Date("2026-07-11T20:00:00.000Z").toISOString(),
      pausedRemainingMs: 4 * 60 * 60 * 1000,
    };

    const [result] = logDose([med], "1", now);

    expect(result.pausedRemainingMs).toBeNull();
    expect(result.lastTakenAt).toBe(new Date(now).toISOString());
    expect(result.cooldownIntervalHours).toBe(8);
    // A fresh full-length cooldown, not the stale paused fraction.
    expect(getCooldownRemainingMs(result, now)).toBe(8 * 60 * 60 * 1000);
    expect(isPaused(result)).toBe(false);
  });

  it("is inert for an ordinary (never-paused) logDose — pausedRemainingMs stays null", () => {
    const med = { id: "1", name: "Aspirin", intervalHours: 8, lastTakenAt: null, pausedRemainingMs: null };
    const [result] = logDose([med], "1", Date.now());
    expect(result.pausedRemainingMs).toBeNull();
  });
});

describe("stopCooldown clears pausedRemainingMs (MED-32 — Revert to Active from a Paused medication)", () => {
  it("reverting a Paused medication clears pausedRemainingMs, not just lastTakenAt/cooldownIntervalHours", () => {
    const med = {
      id: "1",
      name: "Aspirin",
      intervalHours: 8,
      cooldownIntervalHours: 8,
      lastTakenAt: new Date("2026-07-12T00:00:00.000Z").toISOString(),
      pausedRemainingMs: 4 * 60 * 60 * 1000,
    };
    const now = Date.now();

    const [result] = stopCooldown([med], "1", now);

    expect(result.lastTakenAt).toBeNull();
    expect(result.cooldownIntervalHours).toBeNull();
    expect(result.pausedRemainingMs).toBeNull();
    // The critical regression this guards: without clearing pausedRemainingMs
    // too, isInCooldown's paused short-circuit would keep reading `true`
    // forever, even though lastTakenAt just went back to null.
    expect(isInCooldown(result, now)).toBe(false);
    expect(isPaused(result)).toBe(false);
  });

  it("still correctly reverts an ordinary running (unpaused) cooldown, unaffected by the pausedRemainingMs clear", () => {
    const takenAt = new Date("2026-07-12T00:00:00.000Z").getTime();
    const med = {
      id: "1",
      name: "Aspirin",
      intervalHours: 8,
      cooldownIntervalHours: 8,
      lastTakenAt: new Date(takenAt).toISOString(),
      pausedRemainingMs: null,
    };
    const oneHourIn = takenAt + 60 * 60 * 1000;

    const [result] = stopCooldown([med], "1", oneHourIn);

    expect(result.lastTakenAt).toBeNull();
    expect(result.pausedRemainingMs).toBeNull();
    expect(isInCooldown(result, oneHourIn)).toBe(false);
  });
});

describe("editing Name/Dose/Interval never disturbs pausedRemainingMs (MED-17/MED-5 non-disturbance invariant extended to MED-32 Paused state)", () => {
  const pausedMed = () => ({
    id: "1",
    name: "Aspirin",
    dose: "100mg",
    intervalHours: 8,
    cooldownIntervalHours: 8,
    lastTakenAt: new Date("2026-07-12T00:00:00.000Z").toISOString(),
    pausedRemainingMs: 3 * 60 * 60 * 1000,
  });

  it("updateMedicationDetails (Name/Dose) leaves pausedRemainingMs completely untouched", () => {
    const [result] = updateMedicationDetails([pausedMed()], "1", {
      name: "Buffered Aspirin",
      dose: "150mg",
    });
    expect(result.pausedRemainingMs).toBe(3 * 60 * 60 * 1000);
    expect(isPaused(result)).toBe(true);
  });

  it("updateMedicationInterval leaves pausedRemainingMs completely untouched — only affects a future resume/reset, never the frozen value", () => {
    const [result] = updateMedicationInterval([pausedMed()], "1", 2);
    expect(result.pausedRemainingMs).toBe(3 * 60 * 60 * 1000);
    // The frozen remaining time is still read as-is...
    expect(getCooldownRemainingMs(result, Date.now())).toBe(3 * 60 * 60 * 1000);
    // ...while the edited intervalHours sits ready to govern a future
    // Reset/fresh GO press, and cooldownIntervalHours (what a *resume* would
    // use) is untouched by this edit too.
    expect(result.intervalHours).toBe(2);
    expect(result.cooldownIntervalHours).toBe(8);
  });
});

describe("multi-medication independence for pause/resume/reset/revert (MED-32)", () => {
  it("pausing one medication never affects another's pausedRemainingMs or cooldown state", () => {
    const takenAt = new Date("2026-07-12T00:00:00.000Z").getTime();
    const meds = [
      {
        id: "1",
        name: "Aspirin",
        intervalHours: 8,
        cooldownIntervalHours: 8,
        lastTakenAt: new Date(takenAt).toISOString(),
        pausedRemainingMs: null,
      },
      {
        id: "2",
        name: "Ibuprofen",
        intervalHours: 6,
        cooldownIntervalHours: 6,
        lastTakenAt: new Date(takenAt).toISOString(),
        pausedRemainingMs: null,
      },
    ];
    const twoHoursIn = takenAt + 2 * 60 * 60 * 1000;

    const result = pauseCooldown(meds, "1", twoHoursIn);

    expect(isPaused(result[0])).toBe(true);
    expect(isPaused(result[1])).toBe(false);
    expect(isInCooldown(result[1], twoHoursIn)).toBe(true);
    expect(result[1]).toEqual(meds[1]);
  });

  it("resetting (logDose) one medication never clears another's pausedRemainingMs", () => {
    const takenAt = new Date("2026-07-12T00:00:00.000Z").getTime();
    const meds = [
      {
        id: "1",
        name: "Aspirin",
        intervalHours: 8,
        cooldownIntervalHours: 8,
        lastTakenAt: new Date(takenAt).toISOString(),
        pausedRemainingMs: null,
      },
      {
        id: "2",
        name: "Ibuprofen",
        intervalHours: 6,
        cooldownIntervalHours: 6,
        lastTakenAt: new Date(takenAt).toISOString(),
        pausedRemainingMs: 2 * 60 * 60 * 1000,
      },
    ];

    const result = logDose(meds, "1", takenAt + 60 * 60 * 1000);

    expect(result[1]).toEqual(meds[1]);
    expect(isPaused(result[1])).toBe(true);
  });
});
