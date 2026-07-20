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
  isInCooldown,
  getCooldownRemainingMs,
  getCooldownTotalMs,
  getCooldownProgress,
  formatDuration,
  formatCountdown,
  formatRemainingLabel,
  formatIntervalLabel,
  formatRelativeTime,
  formatLastTakenLabel,
  cooldownReadyAt,
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

  it("does not seed a pausedRemainingMs field (MED-34 — the Paused state and its field are gone entirely)", () => {
    const result = addMedication([], { name: "Aspirin", dose: "100mg", intervalHours: 8 });
    expect(result[0]).not.toHaveProperty("pausedRemainingMs");
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

describe("formatRemainingLabel (MED-33)", () => {
  it('formats as "{remaining} left", with seconds, using the same remaining-time math as formatCountdown', () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const med = {
      id: "1",
      name: "Aspirin",
      dose: "100mg",
      intervalHours: 5,
      cooldownIntervalHours: 5,
      lastTakenAt: new Date(takenAt).toISOString(),
    };
    const now = takenAt + (1 * 3600 + 47 * 60 + 15) * 1000; // 3h12m45s left
    expect(formatRemainingLabel(med, now)).toBe("3h 12m 45s left");
  });

  it("never includes the total-interval segment formatCountdown's longer wording uses", () => {
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
    expect(formatRemainingLabel(med, now)).toBe("45s left");
  });

  it("returns null when the medication is not in cooldown, mirroring formatCountdown's contract", () => {
    const med = {
      id: "1",
      name: "Aspirin",
      dose: "100mg",
      intervalHours: 5,
      lastTakenAt: null,
    };
    expect(formatRemainingLabel(med, Date.now())).toBeNull();
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

// --- MED-34: revert Paused (MED-32) to tap-to-cancel; add interval readout -

describe("the Paused state is fully removed, not just unreachable (MED-34 AC4)", () => {
  it("pauseCooldown, resumeCooldown, and isPaused are no longer exported", async () => {
    const module = await import("../../js/medications.js");
    expect(module.pauseCooldown).toBeUndefined();
    expect(module.resumeCooldown).toBeUndefined();
    expect(module.isPaused).toBeUndefined();
  });

  it("addMedication no longer seeds a pausedRemainingMs field", () => {
    const [result] = addMedication([], { name: "Aspirin", dose: "100mg", intervalHours: 8 });
    expect(result).not.toHaveProperty("pausedRemainingMs");
  });

  it("stopCooldown no longer writes a pausedRemainingMs field", () => {
    const takenAt = new Date("2026-07-12T00:00:00.000Z").getTime();
    const med = {
      id: "1",
      name: "Aspirin",
      intervalHours: 8,
      cooldownIntervalHours: 8,
      lastTakenAt: new Date(takenAt).toISOString(),
    };
    const [result] = stopCooldown([med], "1", takenAt + 60 * 60 * 1000);
    expect(result).not.toHaveProperty("pausedRemainingMs");
  });
});

describe("a leftover pausedRemainingMs field from before MED-34 is inert (AC5 — no migration, just ignored)", () => {
  it("isInCooldown ignores a stale pausedRemainingMs on a never-logged (Active) legacy record", () => {
    const legacyActive = {
      id: "1",
      name: "Aspirin",
      intervalHours: 8,
      lastTakenAt: null,
      pausedRemainingMs: 4 * 60 * 60 * 1000, // stale value from before this story shipped
    };
    expect(isInCooldown(legacyActive, Date.now())).toBe(false);
  });

  it("isInCooldown/getCooldownRemainingMs derive from lastTakenAt as usual on a running-cooldown legacy record, regardless of a stale pausedRemainingMs value", () => {
    const takenAt = new Date("2026-07-12T00:00:00.000Z").getTime();
    const legacyRunning = {
      id: "1",
      name: "Aspirin",
      intervalHours: 8,
      cooldownIntervalHours: 8,
      lastTakenAt: new Date(takenAt).toISOString(),
      pausedRemainingMs: 30 * 60 * 1000, // stale — well under the real remaining time
    };
    const twoHoursIn = takenAt + 2 * 60 * 60 * 1000;

    expect(isInCooldown(legacyRunning, twoHoursIn)).toBe(true);
    // Reflects the real elapsed time (6h remaining of 8h), not the stale
    // pausedRemainingMs (30m) that would have been read pre-MED-34.
    expect(getCooldownRemainingMs(legacyRunning, twoHoursIn)).toBe(6 * 60 * 60 * 1000);
  });

  it("isInCooldown correctly reactivates a legacy record with a stale pausedRemainingMs once its real interval has elapsed", () => {
    const takenAt = new Date("2026-07-01T00:00:00.000Z").getTime();
    const legacy = {
      id: "1",
      name: "Aspirin",
      intervalHours: 1,
      cooldownIntervalHours: 1,
      lastTakenAt: new Date(takenAt).toISOString(),
      pausedRemainingMs: 30 * 60 * 1000, // this field pre-MED-34 would have kept this "paused" forever
    };
    const thirtyDaysLater = takenAt + 30 * 24 * 60 * 60 * 1000;

    expect(isInCooldown(legacy, thirtyDaysLater)).toBe(false);
    expect(getCooldownRemainingMs(legacy, thirtyDaysLater)).toBe(0);
    expect(getCooldownProgress(legacy, thirtyDaysLater)).toBe(0);
  });
});

describe("tapping a Cooldown medication cancels immediately and reverts to Active (MED-34 AC2 — reuses stopCooldown, not reimplemented)", () => {
  it("stopCooldown cancels a running cooldown the same way regardless of MED-32's now-removed Paused state ever having existed", () => {
    const takenAt = new Date("2026-07-12T00:00:00.000Z").getTime();
    const med = {
      id: "1",
      name: "Aspirin",
      intervalHours: 8,
      cooldownIntervalHours: 8,
      lastTakenAt: new Date(takenAt).toISOString(),
    };
    const oneHourIn = takenAt + 60 * 60 * 1000;
    expect(isInCooldown(med, oneHourIn)).toBe(true);

    const [result] = stopCooldown([med], "1", oneHourIn);

    expect(result.lastTakenAt).toBeNull();
    expect(isInCooldown(result, oneHourIn)).toBe(false);
  });

  it("natural interval elapse still reverts Cooldown to Active on its own, untouched by MED-34 (MED-9/MED-10)", () => {
    const now = new Date("2026-07-12T00:00:00.000Z").getTime();
    const med = {
      id: "1",
      name: "Aspirin",
      intervalHours: 1,
      cooldownIntervalHours: 1,
      lastTakenAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    };
    expect(isInCooldown(med, now)).toBe(false);
  });
});

describe("formatIntervalLabel (MED-34)", () => {
  it('formats a whole-hour interval as "Every Xh"', () => {
    expect(formatIntervalLabel(8)).toBe("Every 8h");
    expect(formatIntervalLabel(1)).toBe("Every 1h");
  });

  it('formats a fractional interval as "Every Xh Ym"', () => {
    expect(formatIntervalLabel(4.5)).toBe("Every 4h 30m");
  });

  it('formats a sub-hour interval as "Every Ym"', () => {
    expect(formatIntervalLabel(0.5)).toBe("Every 30m");
  });

  it("reflects the live intervalHours, not a cooldown snapshot — it takes a raw number, not a medication object", () => {
    // Distinct from formatCountdown's "of Wh remaining" segment, which reads
    // cooldownIntervalHours instead — this readout is deliberately a plain
    // number-in, string-out function so callers always pass the medication's
    // *current* intervalHours (see js/app.js's updateCooldownDisplay).
    expect(formatIntervalLabel(6)).toBe("Every 6h");
  });
});

describe("formatRelativeTime (MED-38)", () => {
  it('returns "Not yet taken" when lastTakenAt is null', () => {
    expect(formatRelativeTime(null, Date.now())).toBe("Not yet taken");
  });

  it('returns "Not yet taken" when lastTakenAt is undefined', () => {
    expect(formatRelativeTime(undefined, Date.now())).toBe("Not yet taken");
  });

  it('returns "Not yet taken" for an unparseable lastTakenAt (corrupted storage), mirroring isInCooldown\'s own guard', () => {
    expect(formatRelativeTime("not a date", Date.now())).toBe("Not yet taken");
  });

  it('returns "Just now" at zero elapsed time', () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    expect(formatRelativeTime(new Date(takenAt).toISOString(), takenAt)).toBe("Just now");
  });

  it('returns "Just now" for any elapsed time under a minute', () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const now = takenAt + 59_000;
    expect(formatRelativeTime(new Date(takenAt).toISOString(), now)).toBe("Just now");
  });

  it('formats exactly one elapsed minute as "1m ago"', () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const now = takenAt + 60_000;
    expect(formatRelativeTime(new Date(takenAt).toISOString(), now)).toBe("1m ago");
  });

  it("rounds down (floor), not up, so a partial extra minute isn't claimed yet — the opposite rounding direction from formatDuration's countdown use", () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const now = takenAt + 65_000; // 1m 5s elapsed
    expect(formatRelativeTime(new Date(takenAt).toISOString(), now)).toBe("1m ago");
  });

  it('formats minutes under an hour as "Xm ago"', () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const now = takenAt + 45 * 60_000;
    expect(formatRelativeTime(new Date(takenAt).toISOString(), now)).toBe("45m ago");
  });

  it('formats a whole hour with no minutes remainder as "Xh ago", omitting "0m"', () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const now = takenAt + 3 * 3600_000;
    expect(formatRelativeTime(new Date(takenAt).toISOString(), now)).toBe("3h ago");
  });

  it('formats hours plus a minutes remainder as "Xh Ym ago"', () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const now = takenAt + 3 * 3600_000 + 12 * 60_000;
    expect(formatRelativeTime(new Date(takenAt).toISOString(), now)).toBe("3h 12m ago");
  });

  it('formats a whole day with no hours remainder as "Xd ago", omitting "0h"', () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const now = takenAt + 24 * 3600_000;
    expect(formatRelativeTime(new Date(takenAt).toISOString(), now)).toBe("1d ago");
  });

  it('formats a day plus an hours remainder as "Xd Yh ago", dropping the minutes component entirely', () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const now = takenAt + 25 * 3600_000 + 30 * 60_000; // 1d 1h 30m elapsed
    expect(formatRelativeTime(new Date(takenAt).toISOString(), now)).toBe("1d 1h ago");
  });

  it("defaults now to Date.now() when not passed", () => {
    const takenAt = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(takenAt)).toBe("5m ago");
  });
});

describe("cooldownReadyAt (MED-38, exported per Jira comment 10320)", () => {
  it("returns lastTakenAt plus the snapshotted cooldownIntervalHours, not the live intervalHours", () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const med = {
      lastTakenAt: new Date(takenAt).toISOString(),
      intervalHours: 2, // edited mid-cooldown — should NOT be what governs this
      cooldownIntervalHours: 8, // the snapshot taken when the cooldown started
    };
    expect(cooldownReadyAt(med)).toBe(takenAt + 8 * 3600_000);
  });

  it("falls back to intervalHours when cooldownIntervalHours is absent (a medication logged before that field existed)", () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const med = { lastTakenAt: new Date(takenAt).toISOString(), intervalHours: 4 };
    expect(cooldownReadyAt(med)).toBe(takenAt + 4 * 3600_000);
  });
});

describe("formatLastTakenLabel (MED-38, corrected per Jira comment 10320)", () => {
  it('returns "Not yet taken" when lastTakenAt is null', () => {
    const med = { lastTakenAt: null, intervalHours: 8 };
    expect(formatLastTakenLabel(med, Date.now())).toBe("Not yet taken");
  });

  it('returns "Not yet taken" when lastTakenAt is undefined', () => {
    const med = { intervalHours: 8 };
    expect(formatLastTakenLabel(med, Date.now())).toBe("Not yet taken");
  });

  it('reads "Just now" the instant a cooldown ends — measured from wear-off (cooldownReadyAt), not the original dose timestamp, the core scope correction', () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const med = {
      lastTakenAt: new Date(takenAt).toISOString(),
      intervalHours: 8,
      cooldownIntervalHours: 8,
    };
    const wearOffAt = takenAt + 8 * 3600_000;
    // Exactly at wear-off: zero elapsed since cooldownReadyAt, even though
    // 8h have elapsed since the dose itself — the pre-correction bug would
    // have shown "8h ago" here instead.
    expect(formatLastTakenLabel(med, wearOffAt)).toBe("Just now");
  });

  it('counts up from "Just now" as real Active time passes after wear-off', () => {
    const takenAt = new Date("2026-07-09T00:00:00.000Z").getTime();
    const med = {
      lastTakenAt: new Date(takenAt).toISOString(),
      intervalHours: 8,
      cooldownIntervalHours: 8,
    };
    const wearOffAt = takenAt + 8 * 3600_000;
    expect(formatLastTakenLabel(med, wearOffAt + 5 * 60_000)).toBe("5m ago");
    expect(formatLastTakenLabel(med, wearOffAt + 3 * 3600_000)).toBe("3h ago");
  });

  it("defaults now to Date.now() when not passed", () => {
    const med = {
      lastTakenAt: new Date(Date.now() - 8 * 3600_000).toISOString(),
      intervalHours: 8,
      cooldownIntervalHours: 8,
    };
    // Wear-off is exactly now (8h dose + 8h interval), so this should read
    // "Just now", not "8h ago".
    expect(formatLastTakenLabel(med)).toBe("Just now");
  });
});
