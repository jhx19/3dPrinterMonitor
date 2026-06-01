import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  formatFilament,
  formatTime,
  normalizeStatus,
} from "@/lib/printer-utils";

// ── normalizeStatus ───────────────────────────────────────────────────────────

describe("normalizeStatus", () => {
  it('returns "printing" for "printing"', () => {
    expect(normalizeStatus("printing")).toBe("printing");
  });

  it('returns "error" for "error"', () => {
    expect(normalizeStatus("error")).toBe("error");
  });

  it('returns "idle" for unknown strings', () => {
    expect(normalizeStatus("unknown")).toBe("idle");
    expect(normalizeStatus("RUNNING")).toBe("idle"); // raw MQTT values are handled in the poller
    expect(normalizeStatus("")).toBe("idle");
  });

  it('returns "idle" for null or undefined', () => {
    expect(normalizeStatus(null)).toBe("idle");
    expect(normalizeStatus(undefined)).toBe("idle");
  });
});

// ── formatTime ────────────────────────────────────────────────────────────────

describe("formatTime", () => {
  it('returns "—" for null', () => {
    expect(formatTime(null)).toBe("—");
  });

  it('returns "—" for NaN', () => {
    expect(formatTime(NaN)).toBe("—");
  });

  it('returns "0m" for 0 or negative', () => {
    expect(formatTime(0)).toBe("0m");
    expect(formatTime(-5)).toBe("0m");
  });

  it("formats minutes only when under 1 hour", () => {
    expect(formatTime(45)).toBe("45m");
    expect(formatTime(1)).toBe("1m");
  });

  it("formats hours and minutes for 60+ minutes", () => {
    expect(formatTime(60)).toBe("1h 0m");
    expect(formatTime(90)).toBe("1h 30m");
    expect(formatTime(125)).toBe("2h 5m");
  });
});

// ── formatFilament ────────────────────────────────────────────────────────────

describe("formatFilament", () => {
  it('returns "—" for null', () => {
    expect(formatFilament(null)).toBe("—");
  });

  it('returns "—" for NaN', () => {
    expect(formatFilament(NaN)).toBe("—");
  });

  it("formats a normal percentage", () => {
    expect(formatFilament(75)).toBe("75%");
    expect(formatFilament(0)).toBe("0%");
    expect(formatFilament(100)).toBe("100%");
  });

  it("clamps values above 100", () => {
    expect(formatFilament(150)).toBe("100%");
  });

  it("clamps values below 0", () => {
    expect(formatFilament(-10)).toBe("0%");
  });

  it("rounds fractional values", () => {
    expect(formatFilament(74.6)).toBe("75%");
    expect(formatFilament(74.4)).toBe("74%");
  });
});

// ── formatCountdown ───────────────────────────────────────────────────────────

describe("formatCountdown", () => {
  it("formats zero as 0:00", () => {
    expect(formatCountdown(0)).toBe("0:00");
  });

  it("formats negative values as 0:00", () => {
    expect(formatCountdown(-5000)).toBe("0:00");
  });

  it("pads seconds with leading zero", () => {
    expect(formatCountdown(65_000)).toBe("1:05");
  });

  it("formats a full 10-minute countdown", () => {
    expect(formatCountdown(600_000)).toBe("10:00");
  });

  it("formats partial minutes correctly", () => {
    expect(formatCountdown(30_000)).toBe("0:30");
    expect(formatCountdown(119_000)).toBe("1:59");
  });
});
