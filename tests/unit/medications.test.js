import { describe, it, expect } from "vitest";
import {
  loadMedications,
  saveMedications,
  addMedication,
  removeMedication,
  validateMedication,
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
    const meds = [{ id: "1", name: "Aspirin", dose: "100mg", time: "08:00" }];
    storage.setItem("medications", JSON.stringify(meds));
    expect(loadMedications(storage)).toEqual(meds);
  });
});

describe("saveMedications", () => {
  it("round-trips through loadMedications", () => {
    const storage = createMemoryStorage();
    const meds = [{ id: "1", name: "Aspirin", dose: "100mg", time: "08:00" }];
    saveMedications(meds, storage);
    expect(loadMedications(storage)).toEqual(meds);
  });
});

describe("validateMedication", () => {
  it("requires name, dose, and time", () => {
    expect(validateMedication({ name: "", dose: "", time: "" })).toHaveLength(3);
  });

  it("rejects whitespace-only fields", () => {
    expect(validateMedication({ name: "  ", dose: "100mg", time: "08:00" })).toEqual([
      "Name is required.",
    ]);
  });

  it("passes for a fully filled medication", () => {
    expect(
      validateMedication({ name: "Aspirin", dose: "100mg", time: "08:00" })
    ).toEqual([]);
  });
});

describe("addMedication", () => {
  it("adds a valid medication to the list", () => {
    const result = addMedication([], { name: "Aspirin", dose: "100mg", time: "08:00" });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Aspirin", dose: "100mg", time: "08:00" });
    expect(result[0].id).toBeTruthy();
  });

  it("trims whitespace from fields", () => {
    const result = addMedication([], { name: " Aspirin ", dose: " 100mg ", time: " 08:00 " });
    expect(result[0]).toMatchObject({ name: "Aspirin", dose: "100mg", time: "08:00" });
  });

  it("throws when required fields are missing", () => {
    expect(() => addMedication([], { name: "", dose: "", time: "" })).toThrow(
      "Name is required. Dose is required. Time is required."
    );
  });

  it("does not mutate the original list", () => {
    const original = [];
    addMedication(original, { name: "Aspirin", dose: "100mg", time: "08:00" });
    expect(original).toHaveLength(0);
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
