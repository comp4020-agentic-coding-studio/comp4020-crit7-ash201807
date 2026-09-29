import type { ClassSession } from "./schema";

// Presentation helpers for a class session — display logic, not data access,
// so it lives beside planner.ts rather than inside it (same split as
// requirement-labels.ts). Shared by the timetable pages and My Plan.

const DAY_NAMES: Record<string, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

export function formatDayOfWeek(day: string): string {
  return DAY_NAMES[day] ?? day;
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function formatSessionTime(session: ClassSession): string {
  return `${formatDayOfWeek(session.dayOfWeek)} ${formatMinutes(session.startMinutes)}–${formatMinutes(session.endMinutes)}`;
}

// enrolledCount >= capacity is the schema's own definition of "full" (see
// schema.ts) — this just names it for callers.
export function isFull(session: ClassSession): boolean {
  return session.enrolledCount >= session.capacity;
}
