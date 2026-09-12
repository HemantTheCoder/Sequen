import { describe, expect, it } from "vitest";
import {
  DEFAULT_CALENDAR,
  addWorkingDays,
  isWorkingDay,
  nextWorkingDay,
  previousWorkingDay,
  workingDaysBetween,
  type WorkingCalendar,
} from "./calendar";

// 2026-01-05 is a Monday.
const MON = new Date(2026, 0, 5);
const TUE = new Date(2026, 0, 6);
const SAT = new Date(2026, 0, 10);
const SUN = new Date(2026, 0, 11);
const NEXT_MON = new Date(2026, 0, 12);

const SIX_DAY: WorkingCalendar = { id: "six-day", workingDays: [1, 2, 3, 4, 5, 6] };

describe("isWorkingDay", () => {
  it("treats Mon-Fri as working and Sat/Sun as off for the default calendar", () => {
    expect(isWorkingDay(MON, DEFAULT_CALENDAR)).toBe(true);
    expect(isWorkingDay(TUE, DEFAULT_CALENDAR)).toBe(true);
    expect(isWorkingDay(SAT, DEFAULT_CALENDAR)).toBe(false);
    expect(isWorkingDay(SUN, DEFAULT_CALENDAR)).toBe(false);
  });

  it("treats Saturday as working for a 6-day calendar", () => {
    expect(isWorkingDay(SAT, SIX_DAY)).toBe(true);
    expect(isWorkingDay(SUN, SIX_DAY)).toBe(false);
  });

  it("lets an exception turn a working day into a holiday", () => {
    const cal: WorkingCalendar = {
      ...DEFAULT_CALENDAR,
      exceptions: new Map([["2026-01-05", false]]),
    };
    expect(isWorkingDay(MON, cal)).toBe(false);
  });

  it("lets an exception turn an off day into a working day (catch-up shift)", () => {
    const cal: WorkingCalendar = {
      ...DEFAULT_CALENDAR,
      exceptions: new Map([["2026-01-11", true]]),
    };
    expect(isWorkingDay(SUN, cal)).toBe(true);
  });
});

describe("nextWorkingDay / previousWorkingDay", () => {
  it("returns the same date if already working", () => {
    expect(nextWorkingDay(MON, DEFAULT_CALENDAR)).toEqual(MON);
    expect(previousWorkingDay(MON, DEFAULT_CALENDAR)).toEqual(MON);
  });

  it("advances a Saturday to the following Monday", () => {
    expect(nextWorkingDay(SAT, DEFAULT_CALENDAR)).toEqual(NEXT_MON);
  });

  it("rewinds a Sunday to the preceding Friday", () => {
    const FRI = new Date(2026, 0, 9);
    expect(previousWorkingDay(SUN, DEFAULT_CALENDAR)).toEqual(FRI);
  });
});

describe("addWorkingDays", () => {
  it("returns the same date for count 0", () => {
    expect(addWorkingDays(MON, 0, DEFAULT_CALENDAR)).toEqual(MON);
  });

  it("steps forward across a weekend", () => {
    // Mon -> Tue(1) -> Wed(2) -> Thu(3) -> Fri(4) -> Mon(5), skipping Sat/Sun
    const FRI = new Date(2026, 0, 9);
    expect(addWorkingDays(MON, 4, DEFAULT_CALENDAR)).toEqual(FRI);
    expect(addWorkingDays(MON, 5, DEFAULT_CALENDAR)).toEqual(NEXT_MON);
  });

  it("steps backward across a weekend", () => {
    // NEXT_MON stepping back 5 working days lands back on MON
    expect(addWorkingDays(NEXT_MON, -5, DEFAULT_CALENDAR)).toEqual(MON);
  });

  it("is additive: composing two forward steps equals one combined step", () => {
    const a = addWorkingDays(addWorkingDays(MON, 3, DEFAULT_CALENDAR), 4, DEFAULT_CALENDAR);
    const b = addWorkingDays(MON, 7, DEFAULT_CALENDAR);
    expect(a).toEqual(b);
  });

  it("never lands on a non-working day for a 6-day calendar", () => {
    // Sat 2026-01-10 is working under SIX_DAY; stepping 1 from Friday lands on Saturday.
    const FRI = new Date(2026, 0, 9);
    expect(addWorkingDays(FRI, 1, SIX_DAY)).toEqual(SAT);
  });
});

describe("workingDaysBetween", () => {
  it("is 0 for the same date", () => {
    expect(workingDaysBetween(MON, MON, DEFAULT_CALENDAR)).toBe(0);
  });

  it("counts working days only, skipping the weekend", () => {
    expect(workingDaysBetween(MON, NEXT_MON, DEFAULT_CALENDAR)).toBe(5);
  });

  it("is the exact inverse of addWorkingDays", () => {
    const target = addWorkingDays(MON, 11, DEFAULT_CALENDAR);
    expect(workingDaysBetween(MON, target, DEFAULT_CALENDAR)).toBe(11);
  });

  it("is negative when end precedes start", () => {
    expect(workingDaysBetween(NEXT_MON, MON, DEFAULT_CALENDAR)).toBe(-5);
  });
});
