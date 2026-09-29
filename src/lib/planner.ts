import { and, eq } from "drizzle-orm";
import type { db as Db } from "./db";
import {
  type ClassSession,
  classSessions,
  type Course,
  courseRequirements,
  courses,
  type Degree,
  degrees,
  type PlannedCourse,
  plannedCourses,
  type PlannedSession,
  plannedSessions,
  type Requirement,
  requirements,
  type Specialisation,
  specialisationCourses,
  specialisations,
} from "./schema";

// Query/service layer for the MyANU Planner MVP. Every function here takes a
// db handle as its first argument (rather than importing the src/lib/db
// singleton directly) so this module stays a plain type-level dependency of
// src/lib/db — importing it never triggers db.ts's side-effecting top-level
// migrate() — and so tests can point it at an isolated throwaway database,
// matching the pattern established in src/lib/seed.ts.
//
// No UI or API routes are wired up yet; this module is pure query/service
// logic against the existing Drizzle schema.

type RuleType = "FIXED_COURSES" | "MIN_UNITS" | "MAX_UNITS" | "MIN_8000_UNITS";

export class PlannerError extends Error {}

// The single seeded degree for this MVP — see src/lib/seed.ts.
const DEGREE_CODE = "7706XMCOMP";
const DEGREE_YEAR = 2026;

// --- 1. Degree ---

export function getDegree(db: typeof Db): Degree | undefined {
  return db
    .select()
    .from(degrees)
    .where(and(eq(degrees.code, DEGREE_CODE), eq(degrees.year, DEGREE_YEAR)))
    .get();
}

// --- 2. Requirements ---

export function getRequirementsForDegree(db: typeof Db, degreeId: number): Requirement[] {
  return db.select().from(requirements).where(eq(requirements.degreeId, degreeId)).all();
}

export function getRequirementsForSpecialisation(db: typeof Db, specialisationId: number): Requirement[] {
  return db.select().from(requirements).where(eq(requirements.specialisationId, specialisationId)).all();
}

export function getRequirementByKey(db: typeof Db, degreeId: number, key: string): Requirement | undefined {
  return db
    .select()
    .from(requirements)
    .where(and(eq(requirements.degreeId, degreeId), eq(requirements.key, key)))
    .get();
}

export function getSpecialisationsForDegree(db: typeof Db, degreeId: number): Specialisation[] {
  return db.select().from(specialisations).where(eq(specialisations.degreeId, degreeId)).all();
}

// --- 3. Requirement progress (computed at read time — nothing is stored) ---

export type RequirementProgress = {
  requirement: Requirement;
  plannedCourses: Array<{ code: string; units: number; level: number }>;
  // Units counted toward this requirement's rule (for MIN_8000_UNITS, only
  // the 8000+-level courses among plannedCourses are counted here).
  unitsCounted: number;
  // Meaning depends on ruleType: for FIXED_COURSES, every eligible course is
  // planned against this requirement; for MIN_UNITS/MIN_8000_UNITS,
  // unitsCounted has reached requiredUnits. MAX_UNITS is a constraint, not a
  // completion target, so it is always true — see isOverLimit instead.
  isSatisfied: boolean;
  // Only meaningful for MAX_UNITS: unitsCounted has exceeded requiredUnits.
  isOverLimit: boolean;
  // Only meaningful for FIXED_COURSES: eligible course codes not yet planned
  // against this requirement.
  missingFixedCourses: string[];
};

export function getRequirementProgress(db: typeof Db, requirement: Requirement): RequirementProgress {
  const planned = db
    .select({ code: courses.code, units: courses.units, level: courses.level })
    .from(plannedCourses)
    .innerJoin(courses, eq(plannedCourses.courseCode, courses.code))
    .where(eq(plannedCourses.targetRequirementId, requirement.id))
    .all();

  const requiredUnits = requirement.requiredUnits ?? 0;
  const totalUnits = planned.reduce((sum, p) => sum + p.units, 0);

  switch (requirement.ruleType as RuleType) {
    case "FIXED_COURSES": {
      const pool = getEligibleCoursesForRequirement(db, requirement.id).map((c) => c.code);
      const plannedCodes = new Set(planned.map((p) => p.code));
      const missingFixedCourses = pool.filter((code) => !plannedCodes.has(code));
      return {
        requirement,
        plannedCourses: planned,
        unitsCounted: totalUnits,
        isSatisfied: missingFixedCourses.length === 0,
        isOverLimit: false,
        missingFixedCourses,
      };
    }
    case "MAX_UNITS": {
      return {
        requirement,
        plannedCourses: planned,
        unitsCounted: totalUnits,
        isSatisfied: true,
        isOverLimit: totalUnits > requiredUnits,
        missingFixedCourses: [],
      };
    }
    case "MIN_8000_UNITS": {
      const unitsCounted = planned.filter((p) => p.level >= 8000).reduce((sum, p) => sum + p.units, 0);
      return {
        requirement,
        plannedCourses: planned,
        unitsCounted,
        isSatisfied: unitsCounted >= requiredUnits,
        isOverLimit: false,
        missingFixedCourses: [],
      };
    }
    default: {
      // MIN_UNITS
      return {
        requirement,
        plannedCourses: planned,
        unitsCounted: totalUnits,
        isSatisfied: totalUnits >= requiredUnits,
        isOverLimit: false,
        missingFixedCourses: [],
      };
    }
  }
}

export function getRequirementsProgress(db: typeof Db, degreeId: number): RequirementProgress[] {
  return getRequirementsForDegree(db, degreeId).map((requirement) => getRequirementProgress(db, requirement));
}

// --- 4. Eligible courses ---

export function getEligibleCoursesForRequirement(db: typeof Db, requirementId: number): Course[] {
  return db
    .select({
      code: courses.code,
      title: courses.title,
      units: courses.units,
      level: courses.level,
      isProjectCourse: courses.isProjectCourse,
    })
    .from(courseRequirements)
    .innerJoin(courses, eq(courseRequirements.courseCode, courses.code))
    .where(eq(courseRequirements.requirementId, requirementId))
    .all();
}

export function getCoursesForSpecialisation(db: typeof Db, specialisationId: number): Course[] {
  return db
    .select({
      code: courses.code,
      title: courses.title,
      units: courses.units,
      level: courses.level,
      isProjectCourse: courses.isProjectCourse,
    })
    .from(specialisationCourses)
    .innerJoin(courses, eq(specialisationCourses.courseCode, courses.code))
    .where(eq(specialisationCourses.specialisationId, specialisationId))
    .all();
}

// --- 5. Planned courses ---

export function getPlannedCourses(db: typeof Db): PlannedCourse[] {
  return db.select().from(plannedCourses).all();
}

export function addPlannedCourse(
  db: typeof Db,
  params: { courseCode: string; targetRequirementId: number },
): PlannedCourse {
  const { courseCode, targetRequirementId } = params;

  const course = db.select().from(courses).where(eq(courses.code, courseCode)).get();
  if (!course) throw new PlannerError(`Unknown course: ${courseCode}`);

  const requirement = db.select().from(requirements).where(eq(requirements.id, targetRequirementId)).get();
  if (!requirement) throw new PlannerError(`Unknown requirement id: ${targetRequirementId}`);

  const eligible = db
    .select()
    .from(courseRequirements)
    .where(
      and(eq(courseRequirements.requirementId, targetRequirementId), eq(courseRequirements.courseCode, courseCode)),
    )
    .get();
  if (!eligible) {
    throw new PlannerError(`${courseCode} is not eligible for requirement "${requirement.key}"`);
  }

  // Preserves the UNIQUE(course_code) constraint on planned_courses — this
  // check just turns a raw constraint violation into a clear domain error.
  const existing = db.select().from(plannedCourses).where(eq(plannedCourses.courseCode, courseCode)).get();
  if (existing) {
    throw new PlannerError(`${courseCode} is already planned`);
  }

  return db.insert(plannedCourses).values({ courseCode, targetRequirementId }).returning().get();
}

export type PlannedCourseDetail = {
  id: number;
  courseCode: string;
  courseTitle: string;
  units: number;
  targetRequirementId: number;
  targetRequirementName: string;
};

// For the "My Plan" view: a planned course alongside the course/requirement
// names it'd otherwise take a join in the page to look up.
export function getPlannedCoursesDetailed(db: typeof Db): PlannedCourseDetail[] {
  return db
    .select({
      id: plannedCourses.id,
      courseCode: plannedCourses.courseCode,
      courseTitle: courses.title,
      units: courses.units,
      targetRequirementId: plannedCourses.targetRequirementId,
      targetRequirementName: requirements.name,
    })
    .from(plannedCourses)
    .innerJoin(courses, eq(plannedCourses.courseCode, courses.code))
    .innerJoin(requirements, eq(plannedCourses.targetRequirementId, requirements.id))
    .all();
}

export function removePlannedCourse(db: typeof Db, courseCode: string): void {
  db.transaction((tx) => {
    const planned = tx.select().from(plannedCourses).where(eq(plannedCourses.courseCode, courseCode)).get();
    if (!planned) return;
    // planned_sessions.planned_course_id has an ON DELETE CASCADE in the
    // schema, but SQLite only enforces that when foreign keys are switched
    // on for the connection, which this app doesn't do — so the cascade is
    // done explicitly here rather than relied upon.
    tx.delete(plannedSessions).where(eq(plannedSessions.plannedCourseId, planned.id)).run();
    tx.delete(plannedCourses).where(eq(plannedCourses.id, planned.id)).run();
  });
}

// --- 6. Class sessions ---

export function getSessionsForCourse(db: typeof Db, courseCode: string): ClassSession[] {
  return db.select().from(classSessions).where(eq(classSessions.courseCode, courseCode)).all();
}

export function selectSession(db: typeof Db, plannedCourseId: number, classSessionId: number): PlannedSession {
  const planned = db.select().from(plannedCourses).where(eq(plannedCourses.id, plannedCourseId)).get();
  if (!planned) throw new PlannerError(`Unknown planned course id: ${plannedCourseId}`);

  const session = db.select().from(classSessions).where(eq(classSessions.id, classSessionId)).get();
  if (!session) throw new PlannerError(`Unknown class session id: ${classSessionId}`);

  // The schema can't CHECK this across tables (see schema.ts), so it's
  // enforced here: a session can only be selected for the course it's for.
  if (session.courseCode !== planned.courseCode) {
    throw new PlannerError(
      `Session ${classSessionId} (${session.courseCode}) does not belong to planned course ${plannedCourseId} (${planned.courseCode})`,
    );
  }

  // One selected session per planned course — a repeat call replaces it
  // rather than adding a second (planned_sessions.planned_course_id is
  // unique).
  return db
    .insert(plannedSessions)
    .values({ plannedCourseId, classSessionId })
    .onConflictDoUpdate({
      target: plannedSessions.plannedCourseId,
      set: { classSessionId },
    })
    .returning()
    .get();
}

export function removeSelectedSession(db: typeof Db, plannedCourseId: number): void {
  db.delete(plannedSessions).where(eq(plannedSessions.plannedCourseId, plannedCourseId)).run();
}

export type SelectedSession = {
  plannedCourseId: number;
  courseCode: string;
  session: ClassSession;
};

export function getSelectedSessions(db: typeof Db): SelectedSession[] {
  return db
    .select({
      plannedCourseId: plannedSessions.plannedCourseId,
      courseCode: plannedCourses.courseCode,
      session: classSessions,
    })
    .from(plannedSessions)
    .innerJoin(plannedCourses, eq(plannedSessions.plannedCourseId, plannedCourses.id))
    .innerJoin(classSessions, eq(plannedSessions.classSessionId, classSessions.id))
    .all();
}

// --- 7. Timetable conflicts (computed at read time — nothing is persisted) ---

export type TimetableConflict = {
  dayOfWeek: string;
  a: { plannedCourseId: number; courseCode: string; sessionCode: string; startMinutes: number; endMinutes: number };
  b: { plannedCourseId: number; courseCode: string; sessionCode: string; startMinutes: number; endMinutes: number };
};

export function getTimetableConflicts(db: typeof Db): TimetableConflict[] {
  const selected = getSelectedSessions(db);
  const conflicts: TimetableConflict[] = [];

  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      const a = selected[i];
      const b = selected[j];
      if (a.session.dayOfWeek !== b.session.dayOfWeek) continue;
      const overlaps = a.session.startMinutes < b.session.endMinutes && b.session.startMinutes < a.session.endMinutes;
      if (!overlaps) continue;
      conflicts.push({
        dayOfWeek: a.session.dayOfWeek,
        a: {
          plannedCourseId: a.plannedCourseId,
          courseCode: a.courseCode,
          sessionCode: a.session.sessionCode,
          startMinutes: a.session.startMinutes,
          endMinutes: a.session.endMinutes,
        },
        b: {
          plannedCourseId: b.plannedCourseId,
          courseCode: b.courseCode,
          sessionCode: b.session.sessionCode,
          startMinutes: b.session.startMinutes,
          endMinutes: b.session.endMinutes,
        },
      });
    }
  }

  return conflicts;
}
