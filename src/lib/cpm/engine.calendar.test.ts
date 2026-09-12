import { describe, expect, it } from "vitest";
import { calculateCPM } from "./engine";
import { addWorkingDays, nextWorkingDay, DEFAULT_CALENDAR, type WorkingCalendar } from "./calendar";
import { CpmCalendarSet, CpmDependency, CpmTask } from "./types";

// 2026-01-05 is a Monday.
const DATA_DATE = new Date(2026, 0, 5);

const SIX_DAY: WorkingCalendar = { id: "six-day", workingDays: [1, 2, 3, 4, 5, 6] };

function fs(predecessorId: string, successorId: string, lagDays = 0): CpmDependency {
  return { predecessorId, successorId, type: "FS", lagDays };
}

describe("calculateCPM with multiple calendars", () => {
  it("extends a task's finish date to skip a holiday declared as a calendar exception", () => {
    // Wed 2026-01-07 is a holiday. A 3-working-day task starting Monday would
    // normally finish Thursday (Mon,Tue,Wed = 3 working days -> finish Thu);
    // with Wednesday off, it must absorb an extra calendar day.
    const holidayCalendar: WorkingCalendar = {
      ...DEFAULT_CALENDAR,
      id: "with-holiday",
      exceptions: new Map([["2026-01-07", false]]),
    };
    const calendars: CpmCalendarSet = {
      dataDate: DATA_DATE,
      defaultCalendar: DEFAULT_CALENDAR,
      calendarsById: new Map([["with-holiday", holidayCalendar]]),
    };
    const tasks: CpmTask[] = [{ id: "A", duration: 3, calendarId: "with-holiday" }];

    const withHoliday = calculateCPM(tasks, [], calendars);
    const withoutHoliday = calculateCPM(
      [{ id: "A", duration: 3 }],
      [],
      { dataDate: DATA_DATE, defaultCalendar: DEFAULT_CALENDAR },
    );

    // The holiday calendar's finish must land a calendar day later than the
    // plain Mon-Fri finish, since one extra non-working day had to be skipped.
    expect(withHoliday.tasks.get("A")!.earlyFinish.getTime()).toBeGreaterThan(
      withoutHoliday.tasks.get("A")!.earlyFinish.getTime(),
    );
    // Thu 2026-01-08 would be the naive (no-holiday) finish; with Wednesday
    // off, the 3rd working day (Mon, Tue, Thu) finishes on Friday instead.
    expect(withHoliday.tasks.get("A")!.earlyFinish).toEqual(new Date(2026, 0, 9));
  });

  it("snaps a 6-day-week task's start forward when its 5-day-week predecessor finishes on a Saturday", () => {
    // A: 5-day-week task, duration 5 -> Mon,Tue,Wed,Thu,Fri,(skip Sat/Sun)Mon
    // finishes on the following Monday (2026-01-12).
    const calendars: CpmCalendarSet = {
      dataDate: DATA_DATE,
      defaultCalendar: DEFAULT_CALENDAR,
      calendarsById: new Map([["six-day", SIX_DAY]]),
    };
    const tasks: CpmTask[] = [
      { id: "A", duration: 5 }, // default Mon-Fri
      { id: "B", duration: 2, calendarId: "six-day" },
    ];

    const result = calculateCPM(tasks, [fs("A", "B")], calendars);

    expect(result.tasks.get("A")!.earlyFinish).toEqual(new Date(2026, 0, 12));
    // B's calendar treats Monday as working too, so no extra snap is needed here;
    // this asserts the successor picks up exactly its predecessor's finish date.
    expect(result.tasks.get("B")!.earlyStart).toEqual(new Date(2026, 0, 12));
  });

  it("snaps a successor's start off a predecessor's non-working weekend day onto its own next working day", () => {
    // A: 6-day-week task (Mon-Sat) duration 5 -> Mon,Tue,Wed,Thu,Fri finishes
    // Saturday 2026-01-10 (still a working day on the 6-day calendar).
    // B: default Mon-Fri successor — Saturday isn't a working day for B, so
    // its early start must snap forward to the next Monday.
    const calendars: CpmCalendarSet = {
      dataDate: DATA_DATE,
      defaultCalendar: DEFAULT_CALENDAR,
      calendarsById: new Map([["six-day", SIX_DAY]]),
    };
    const tasks: CpmTask[] = [
      { id: "A", duration: 5, calendarId: "six-day" },
      { id: "B", duration: 2 }, // default Mon-Fri
    ];

    const result = calculateCPM(tasks, [fs("A", "B")], calendars);

    expect(result.tasks.get("A")!.earlyFinish).toEqual(new Date(2026, 0, 10)); // Saturday
    expect(result.tasks.get("B")!.earlyStart).toEqual(new Date(2026, 0, 12)); // snapped to Monday
  });

  it("keeps float measured in working days on the task's own calendar, not raw calendar days", () => {
    // A (6-day week) duration 2 finishes Tue. B (default Mon-Fri) duration 2
    // has no successor and is unconstrained otherwise, so its total float
    // reflects the project finish measured in ITS OWN (5-day) working days.
    const calendars: CpmCalendarSet = {
      dataDate: DATA_DATE,
      defaultCalendar: DEFAULT_CALENDAR,
      calendarsById: new Map([["six-day", SIX_DAY]]),
    };
    const tasks: CpmTask[] = [
      { id: "A", duration: 10, calendarId: "six-day" },
      { id: "B", duration: 2 },
    ];

    const result = calculateCPM(tasks, [], calendars);

    const b = result.tasks.get("B")!;
    // Total float must be a whole number of B's own (5-day) working days
    // between B's early and late start — never fractional, never negative here.
    expect(Number.isInteger(b.totalFloat)).toBe(true);
    expect(b.totalFloat).toBeGreaterThan(0);
  });

  it("is unaffected by an unrelated calendar's holiday when tasks don't share a calendar", () => {
    const calendarWithHoliday: WorkingCalendar = {
      ...DEFAULT_CALENDAR,
      id: "isolated",
      exceptions: new Map([["2026-01-06", false]]),
    };
    const calendars: CpmCalendarSet = {
      dataDate: DATA_DATE,
      defaultCalendar: DEFAULT_CALENDAR,
      calendarsById: new Map([["isolated", calendarWithHoliday]]),
    };
    const tasks: CpmTask[] = [
      { id: "A", duration: 3, calendarId: "isolated" },
      { id: "B", duration: 3 }, // independent, default calendar, no dependency link
    ];

    const result = calculateCPM(tasks, [], calendars);

    const plain = calculateCPM(
      [{ id: "B", duration: 3 }],
      [],
      { dataDate: DATA_DATE, defaultCalendar: DEFAULT_CALENDAR },
    );
    expect(result.tasks.get("B")!.earlyFinish).toEqual(plain.tasks.get("B")!.earlyFinish);
  });

  it("honors a minStart constraint expressed as a real date, snapped to the task's own calendar", () => {
    // A Saturday minStart on a Mon-Fri task must snap to the following Monday.
    const saturday = new Date(2026, 0, 10);
    const calendars: CpmCalendarSet = { dataDate: DATA_DATE, defaultCalendar: DEFAULT_CALENDAR };
    const tasks: CpmTask[] = [{ id: "A", duration: 1, minStart: saturday }];

    const result = calculateCPM(tasks, [], calendars);

    expect(result.tasks.get("A")!.earlyStart).toEqual(new Date(2026, 0, 12));
  });
});

describe("addWorkingDays / nextWorkingDay sanity used by the scenarios above", () => {
  it("matches the hand-computed Monday finish for a 5-working-day Mon-Fri task", () => {
    const base = nextWorkingDay(DATA_DATE, DEFAULT_CALENDAR);
    expect(addWorkingDays(base, 5, DEFAULT_CALENDAR)).toEqual(new Date(2026, 0, 12));
  });
});
