import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isAndroidBridgeAvailable,
  syncReminders,
  cancelReminder,
} from "../../js/androidBridge.js";

// This suite runs under Vitest's "node" environment (see vitest.config.js),
// so `window` doesn't exist unless a test puts it there itself — that
// absence is exactly what "running as a normal website" looks like, and is
// what every bridge-unavailable test below relies on. Restored after every
// test so bridge-available tests never leak into each other or into
// unrelated suites.
afterEach(() => {
  delete globalThis.window;
});

function createCooldownMedication(overrides = {}) {
  const now = Date.now();
  return {
    id: "1",
    name: "Aspirin",
    dose: "100mg",
    intervalHours: 8,
    lastTakenAt: new Date(now - 60 * 60 * 1000).toISOString(), // logged 1h ago
    cooldownIntervalHours: 8, // 8h cooldown snapshot, 7h remaining
    ...overrides,
  };
}

function createActiveMedication(overrides = {}) {
  return {
    id: "2",
    name: "Ibuprofen",
    dose: "200mg",
    intervalHours: 6,
    lastTakenAt: null,
    ...overrides,
  };
}

describe("isAndroidBridgeAvailable", () => {
  it("returns false when window doesn't exist at all", () => {
    expect(isAndroidBridgeAvailable()).toBe(false);
  });

  it("returns false when window exists but has no AndroidBridge", () => {
    globalThis.window = {};
    expect(isAndroidBridgeAvailable()).toBe(false);
  });

  it("returns true when window.AndroidBridge exists", () => {
    globalThis.window = { AndroidBridge: {} };
    expect(isAndroidBridgeAvailable()).toBe(true);
  });
});

describe("syncReminders — bridge unavailable", () => {
  it("is a complete no-op and never throws when window doesn't exist", () => {
    const medications = [createCooldownMedication(), createActiveMedication()];
    expect(() => syncReminders(medications)).not.toThrow();
  });

  it("never calls scheduleReminder/cancelReminder when window has no AndroidBridge", () => {
    const scheduleReminder = vi.fn();
    const cancelReminderMock = vi.fn();
    globalThis.window = { AndroidBridge: undefined };
    const medications = [createCooldownMedication(), createActiveMedication()];

    syncReminders(medications);

    expect(scheduleReminder).not.toHaveBeenCalled();
    expect(cancelReminderMock).not.toHaveBeenCalled();
  });
});

describe("cancelReminder — bridge unavailable", () => {
  it("is a complete no-op and never throws when window doesn't exist", () => {
    expect(() => cancelReminder("1")).not.toThrow();
  });
});

describe("syncReminders — bridge available", () => {
  function installMockBridge() {
    const scheduleReminder = vi.fn();
    const cancelReminderMock = vi.fn();
    globalThis.window = {
      AndroidBridge: { scheduleReminder, cancelReminder: cancelReminderMock },
    };
    return { scheduleReminder, cancelReminderMock };
  }

  it("calls cancelReminder for an Active (not-in-cooldown) medication", () => {
    const { scheduleReminder, cancelReminderMock } = installMockBridge();
    const medication = createActiveMedication();

    syncReminders([medication]);

    expect(cancelReminderMock).toHaveBeenCalledWith(medication.id);
    expect(scheduleReminder).not.toHaveBeenCalled();
  });

  it("calls scheduleReminder with the correct computed dueAtMillis for a Cooldown medication", () => {
    const { scheduleReminder, cancelReminderMock } = installMockBridge();
    const lastTakenAtMs = Date.parse("2026-07-15T10:00:00.000Z");
    const medication = createCooldownMedication({
      lastTakenAt: new Date(lastTakenAtMs).toISOString(),
      cooldownIntervalHours: 8,
    });
    const now = lastTakenAtMs + 60 * 60 * 1000; // 1h into the 8h cooldown

    syncReminders([medication], now);

    const expectedDueAtMillis = lastTakenAtMs + 8 * 60 * 60 * 1000;
    expect(scheduleReminder).toHaveBeenCalledWith(
      medication.id,
      medication.name,
      expectedDueAtMillis
    );
    expect(cancelReminderMock).not.toHaveBeenCalled();
  });

  it("uses cooldownIntervalHours, not the live intervalHours, so editing the interval mid-cooldown never changes dueAtMillis", () => {
    const { scheduleReminder } = installMockBridge();
    const lastTakenAtMs = Date.parse("2026-07-15T10:00:00.000Z");
    // Logged with an 8h interval, then edited up to 24h mid-cooldown
    // (MED-5/MED-8/MED-32's invariant): cooldownIntervalHours still holds
    // the original 8h snapshot that governs the already-running cooldown.
    const medication = createCooldownMedication({
      lastTakenAt: new Date(lastTakenAtMs).toISOString(),
      cooldownIntervalHours: 8,
      intervalHours: 24,
    });
    const now = lastTakenAtMs + 60 * 60 * 1000;

    syncReminders([medication], now);

    const dueAtMillisFromCooldownSnapshot = lastTakenAtMs + 8 * 60 * 60 * 1000;
    const dueAtMillisFromLiveInterval = lastTakenAtMs + 24 * 60 * 60 * 1000;
    expect(scheduleReminder).toHaveBeenCalledWith(
      medication.id,
      medication.name,
      dueAtMillisFromCooldownSnapshot
    );
    expect(scheduleReminder).not.toHaveBeenCalledWith(
      medication.id,
      medication.name,
      dueAtMillisFromLiveInterval
    );
  });

  it("syncs every medication in the list independently", () => {
    const { scheduleReminder, cancelReminderMock } = installMockBridge();
    const cooldown = createCooldownMedication({ id: "a" });
    const active = createActiveMedication({ id: "b" });

    syncReminders([cooldown, active]);

    expect(scheduleReminder).toHaveBeenCalledTimes(1);
    expect(scheduleReminder).toHaveBeenCalledWith(
      "a",
      cooldown.name,
      expect.any(Number)
    );
    expect(cancelReminderMock).toHaveBeenCalledWith("b");
  });
});

describe("cancelReminder — bridge available", () => {
  it("delegates to window.AndroidBridge.cancelReminder with the given id", () => {
    const cancelReminderMock = vi.fn();
    globalThis.window = { AndroidBridge: { cancelReminder: cancelReminderMock } };

    cancelReminder("some-id");

    expect(cancelReminderMock).toHaveBeenCalledWith("some-id");
  });
});
