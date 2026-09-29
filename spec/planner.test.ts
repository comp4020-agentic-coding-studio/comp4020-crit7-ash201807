import { existsSync, mkdtempSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  addPlannedCourse,
  getDegree,
  getEligibleCoursesForRequirement,
  getPlannedCourses,
  getRequirementProgress,
  getRequirementsForDegree,
  getSelectedSessions,
  getSessionsForCourse,
  getTimetableConflicts,
  PlannerError,
  removePlannedCourse,
  removeSelectedSession,
  selectSession,
} from "../src/lib/planner";
import { seedPlannerData } from "../src/lib/seed";

// Unit tests for the planner query/service layer (src/lib/planner.ts), run
// against an isolated throwaway SQLite database — not the running app, so
// this file doesn't use the HTTP-level `inject("baseUrl")` that the rest of
// spec/ relies on (see spec/global-setup.ts). Each test gets a freshly
// migrated + seeded database so tests can't leak planned_courses/
// planned_sessions state into one another.

const dbPath = join(mkdtempSync(join(tmpdir(), "planner-spec-")), "test.db");

function freshDb() {
  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(dbPath + suffix)) unlinkSync(dbPath + suffix);
  }
  const client = new Database(dbPath);
  client.pragma("journal_mode = WAL");
  const db = drizzle(client);
  migrate(db, { migrationsFolder: "./drizzle" });
  seedPlannerData(db);
  return { client, db };
}

let ctx: ReturnType<typeof freshDb>;

beforeEach(() => {
  ctx = freshDb();
});

// better-sqlite3 holds an open file handle for the connection's lifetime,
// and Windows (unlike POSIX) refuses to unlink a file that's still open —
// so the previous test's database must be closed before the next test's
// freshDb() tries to delete it.
afterEach(() => {
  ctx.client.close();
});

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(dbPath + suffix)) unlinkSync(dbPath + suffix);
  }
});

function findRequirement(key: string) {
  const degree = getDegree(ctx.db);
  if (!degree) throw new Error("degree not seeded");
  const requirement = getRequirementsForDegree(ctx.db, degree.id).find((r) => r.key === key);
  if (!requirement) throw new Error(`requirement not seeded: ${key}`);
  return requirement;
}

describe("getDegree / getRequirementsForDegree", () => {
  test("returns the seeded 2026 MComp degree", () => {
    const degree = getDegree(ctx.db);
    expect(degree).toMatchObject({ code: "7706XMCOMP", year: 2026, name: "Master of Computing" });
  });

  test("returns both degree-wide and specialisation requirements", () => {
    const degree = getDegree(ctx.db)!;
    const reqs = getRequirementsForDegree(ctx.db, degree.id);
    const keys = reqs.map((r) => r.key);
    expect(keys).toContain("compulsory"); // degree-wide
    expect(keys).toContain("machine-learning-units"); // specialisation-scoped
  });
});

describe("requirement progress: empty plan", () => {
  test("a MIN_UNITS requirement reports zero progress", () => {
    const progress = getRequirementProgress(ctx.db, findRequirement("compulsory"));
    expect(progress.unitsCounted).toBe(0);
    expect(progress.isSatisfied).toBe(false);
  });

  test("a MIN_8000_UNITS requirement reports zero progress", () => {
    const progress = getRequirementProgress(ctx.db, findRequirement("comp8000-24u"));
    expect(progress.unitsCounted).toBe(0);
    expect(progress.isSatisfied).toBe(false);
  });
});

describe("addPlannedCourse", () => {
  test("adding an eligible course increases requirement progress", () => {
    const requirement = findRequirement("foundation"); // MIN_UNITS, 6u, pool: COMP6260, MATH6005
    const before = getRequirementProgress(ctx.db, requirement);
    expect(before.unitsCounted).toBe(0);

    addPlannedCourse(ctx.db, { courseCode: "COMP6260", targetRequirementId: requirement.id });

    const after = getRequirementProgress(ctx.db, findRequirement("foundation"));
    expect(after.unitsCounted).toBe(6);
    expect(after.isSatisfied).toBe(true);
  });

  test("rejects a course that is not eligible for the target requirement", () => {
    const requirement = findRequirement("foundation");
    // COMP8600 is not in the foundation pool.
    expect(() => addPlannedCourse(ctx.db, { courseCode: "COMP8600", targetRequirementId: requirement.id })).toThrow(
      PlannerError,
    );
    expect(getPlannedCourses(ctx.db)).toHaveLength(0);
  });

  test("rejects an unknown course code", () => {
    const requirement = findRequirement("foundation");
    expect(() => addPlannedCourse(ctx.db, { courseCode: "NOPE0000", targetRequirementId: requirement.id })).toThrow(
      PlannerError,
    );
  });

  test("prevents duplicate planned courses", () => {
    const foundation = findRequirement("foundation");
    const compulsory = findRequirement("compulsory");
    addPlannedCourse(ctx.db, { courseCode: "COMP6260", targetRequirementId: foundation.id });
    // COMP6260 is eligible for both, but is already planned — should be
    // rejected even against a different (also-eligible) requirement.
    expect(() =>
      addPlannedCourse(ctx.db, { courseCode: "COMP6260", targetRequirementId: compulsory.id }),
    ).toThrow(PlannerError);
    expect(getPlannedCourses(ctx.db)).toHaveLength(1);
  });

  test("a planned course only counts toward its targeted requirement, not every eligible one", () => {
    // COMP6260 is eligible for both "foundation" and "compulsory", but is
    // only targeted at "foundation" here.
    const foundation = findRequirement("foundation");
    addPlannedCourse(ctx.db, { courseCode: "COMP6260", targetRequirementId: foundation.id });

    const compulsoryProgress = getRequirementProgress(ctx.db, findRequirement("compulsory"));
    expect(compulsoryProgress.unitsCounted).toBe(0);
  });
});

describe("removePlannedCourse", () => {
  test("removing a planned course decreases progress again", () => {
    const requirement = findRequirement("foundation");
    addPlannedCourse(ctx.db, { courseCode: "COMP6260", targetRequirementId: requirement.id });
    expect(getRequirementProgress(ctx.db, findRequirement("foundation")).unitsCounted).toBe(6);

    removePlannedCourse(ctx.db, "COMP6260");

    expect(getRequirementProgress(ctx.db, findRequirement("foundation")).unitsCounted).toBe(0);
    expect(getPlannedCourses(ctx.db)).toHaveLength(0);
  });
});

describe("eligible courses", () => {
  test("returns exactly the seeded pool for a requirement", () => {
    const foundation = findRequirement("foundation");
    const codes = getEligibleCoursesForRequirement(ctx.db, foundation.id)
      .map((c) => c.code)
      .sort();
    expect(codes).toEqual(["COMP6260", "MATH6005"].sort());
  });
});

describe("class sessions and timetable conflicts", () => {
  test("selecting a session makes it retrievable via getSelectedSessions", () => {
    const foundation = findRequirement("foundation");
    const planned = addPlannedCourse(ctx.db, { courseCode: "COMP6260", targetRequirementId: foundation.id });
    const [session] = getSessionsForCourse(ctx.db, "COMP6260");

    selectSession(ctx.db, planned.id, session.id);

    const selected = getSelectedSessions(ctx.db);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ plannedCourseId: planned.id, courseCode: "COMP6260" });
  });

  test("removing a selected session clears it", () => {
    const foundation = findRequirement("foundation");
    const planned = addPlannedCourse(ctx.db, { courseCode: "COMP6260", targetRequirementId: foundation.id });
    const [session] = getSessionsForCourse(ctx.db, "COMP6260");
    selectSession(ctx.db, planned.id, session.id);

    removeSelectedSession(ctx.db, planned.id);

    expect(getSelectedSessions(ctx.db)).toHaveLength(0);
  });

  test("detects the seeded genuine conflict: COMP6261 LEC1 overlaps COMP8600 LEC1 on WED", () => {
    // Both are eligible for degree-wide requirements: COMP6261 has no
    // degree-wide eligibility, so plan it via a specialisation requirement
    // it IS eligible for instead.
    const mlUnits = findRequirement("machine-learning-units");
    const comp8000 = findRequirement("comp8000-24u");

    const comp6261 = addPlannedCourse(ctx.db, { courseCode: "COMP6261", targetRequirementId: mlUnits.id });
    const comp8600 = addPlannedCourse(ctx.db, { courseCode: "COMP8600", targetRequirementId: comp8000.id });

    const [session6261] = getSessionsForCourse(ctx.db, "COMP6261");
    const [session8600] = getSessionsForCourse(ctx.db, "COMP8600");
    selectSession(ctx.db, comp6261.id, session6261.id);
    selectSession(ctx.db, comp8600.id, session8600.id);

    const conflicts = getTimetableConflicts(ctx.db);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].dayOfWeek).toBe("WED");
    const courseCodes = [conflicts[0].a.courseCode, conflicts[0].b.courseCode].sort();
    expect(courseCodes).toEqual(["COMP6261", "COMP8600"]);
  });

  test("does not report a conflict for non-overlapping sessions", () => {
    // COMP6260 MON 09:00-10:00 and ENGN8100 THU 14:00-16:00 don't overlap.
    const foundation = findRequirement("foundation");
    const furtherCompEngn = findRequirement("further-comp-engn");

    const comp6260 = addPlannedCourse(ctx.db, { courseCode: "COMP6260", targetRequirementId: foundation.id });
    const engn8100 = addPlannedCourse(ctx.db, { courseCode: "ENGN8100", targetRequirementId: furtherCompEngn.id });

    const [session6260] = getSessionsForCourse(ctx.db, "COMP6260");
    const [sessionEngn] = getSessionsForCourse(ctx.db, "ENGN8100");
    selectSession(ctx.db, comp6260.id, session6260.id);
    selectSession(ctx.db, engn8100.id, sessionEngn.id);

    expect(getTimetableConflicts(ctx.db)).toEqual([]);
  });
});

describe("seed idempotency (still holds under the planner layer)", () => {
  test("re-seeding an already-seeded database adds no duplicate rows", () => {
    const before = ctx.client.prepare(`SELECT COUNT(*) AS n FROM courses`).get() as { n: number };
    seedPlannerData(ctx.db);
    const after = ctx.client.prepare(`SELECT COUNT(*) AS n FROM courses`).get() as { n: number };
    expect(after.n).toBe(before.n);
  });
});
