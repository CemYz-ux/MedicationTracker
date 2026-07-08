import { describe, it, expect } from "vitest";
import {
  loadMedications,
  saveMedications,
  addMedication,
  updateMedicationInterval,
  removeMedication,
  validateMedication,
  validateInterval,
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
