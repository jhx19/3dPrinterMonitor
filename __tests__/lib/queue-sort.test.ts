import { describe, expect, it } from "vitest";
import { sortQueueByTime } from "@/lib/printer-utils";

describe("sortQueueByTime", () => {
  it("sorts entries by createdAt ascending", () => {
    const waiters = [
      { id: "c", createdAt: "2024-01-01T12:00:00Z" },
      { id: "a", createdAt: "2024-01-01T10:00:00Z" },
      { id: "b", createdAt: "2024-01-01T11:00:00Z" },
    ];
    const sorted = sortQueueByTime(waiters);
    expect(sorted.map((w) => w.id)).toEqual(["a", "b", "c"]);
  });

  it("places null createdAt entries at the end", () => {
    const waiters = [
      { id: "z", createdAt: null },
      { id: "a", createdAt: "2024-01-01T10:00:00Z" },
    ];
    const sorted = sortQueueByTime(waiters);
    expect(sorted[0].id).toBe("a");
    expect(sorted[1].id).toBe("z");
  });

  it("breaks ties by id lexicographically", () => {
    const ts = "2024-01-01T10:00:00Z";
    const waiters = [
      { id: "charlie", createdAt: ts },
      { id: "alice",   createdAt: ts },
      { id: "bob",     createdAt: ts },
    ];
    const sorted = sortQueueByTime(waiters);
    expect(sorted.map((w) => w.id)).toEqual(["alice", "bob", "charlie"]);
  });

  it("does not mutate the original array", () => {
    const waiters = [
      { id: "b", createdAt: "2024-01-01T11:00:00Z" },
      { id: "a", createdAt: "2024-01-01T10:00:00Z" },
    ];
    const original = [...waiters];
    sortQueueByTime(waiters);
    expect(waiters).toEqual(original);
  });

  it("handles an empty array", () => {
    expect(sortQueueByTime([])).toEqual([]);
  });

  it("handles a single entry", () => {
    const waiters = [{ id: "a", createdAt: "2024-01-01T10:00:00Z" }];
    expect(sortQueueByTime(waiters)).toEqual(waiters);
  });
});
