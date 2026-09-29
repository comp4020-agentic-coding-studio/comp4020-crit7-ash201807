import { sql } from "drizzle-orm";
import {
  index,
  int,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.

// Starter guestbook table — untouched; the starter's messages API/UI still
// reads and writes this.
export const messages = sqliteTable("messages", {
  id: int().primaryKey({ autoIncrement: true }),
  body: text().notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type Message = typeof messages.$inferSelect;

// --- MyANU Planner ---
//
// Progress and timetable conflicts are computed at read time from these
// tables — nothing derived is stored, so there's nothing to keep in sync.

export const degrees = sqliteTable(
  "degrees",
  {
    id: int().primaryKey({ autoIncrement: true }),
    code: text().notNull(),
    name: text().notNull(),
    year: int().notNull(),
    // Display only — the real ANU buckets overlap and aren't additive, so
    // this is never summed against or arithmetically enforced.
    totalUnits: int("total_units").notNull(),
  },
  (t) => [uniqueIndex("degrees_code_year_unique").on(t.code, t.year)],
);

export type Degree = typeof degrees.$inferSelect;

export const specialisations = sqliteTable(
  "specialisations",
  {
    id: int().primaryKey({ autoIncrement: true }),
    degreeId: int("degree_id")
      .notNull()
      .references(() => degrees.id),
    key: text().notNull(),
    name: text().notNull(),
  },
  (t) => [uniqueIndex("specialisations_degree_key_unique").on(t.degreeId, t.key)],
);

export type Specialisation = typeof specialisations.$inferSelect;

// One rule vocabulary shared by degree-wide and specialisation-scoped
// requirements: `specialisationId` null means degree-wide, set means it
// belongs to that specialisation. `key` is the idempotent-seeding handle.
export const requirements = sqliteTable(
  "requirements",
  {
    id: int().primaryKey({ autoIncrement: true }),
    degreeId: int("degree_id")
      .notNull()
      .references(() => degrees.id),
    specialisationId: int("specialisation_id").references(() => specialisations.id),
    key: text().notNull(),
    name: text().notNull(),
    // FIXED_COURSES | MIN_UNITS | MAX_UNITS | MIN_8000_UNITS
    ruleType: text("rule_type").notNull(),
    // Threshold for the three unit-based rule types; unused (display-only)
    // for FIXED_COURSES.
    requiredUnits: int("required_units"),
  },
  (t) => [
    uniqueIndex("requirements_degree_key_unique").on(t.degreeId, t.key),
    index("requirements_degree_id_idx").on(t.degreeId),
    index("requirements_specialisation_id_idx").on(t.specialisationId),
  ],
);

export type Requirement = typeof requirements.$inferSelect;

export const courses = sqliteTable("courses", {
  code: text().primaryKey(),
  title: text().notNull(),
  units: int().notNull(),
  level: int().notNull(),
  isProjectCourse: int("is_project_course").notNull().default(0),
});

export type Course = typeof courses.$inferSelect;

// Eligibility (many-to-many): a course may be eligible for several
// requirements. Which one it actually counts toward is recorded on
// plannedCourses.targetRequirementId, not here.
export const courseRequirements = sqliteTable(
  "course_requirements",
  {
    requirementId: int("requirement_id")
      .notNull()
      .references(() => requirements.id),
    courseCode: text("course_code")
      .notNull()
      .references(() => courses.code),
  },
  (t) => [
    primaryKey({ columns: [t.requirementId, t.courseCode] }),
    index("course_requirements_course_code_idx").on(t.courseCode),
  ],
);

// Eligibility (many-to-many): which courses belong to a specialisation's
// pool, kept separate from FIXED_COURSES/MIN_UNITS eligibility above so an
// arbitrary COMP course is never treated as e.g. a Software Development
// course just by naming convention.
export const specialisationCourses = sqliteTable(
  "specialisation_courses",
  {
    specialisationId: int("specialisation_id")
      .notNull()
      .references(() => specialisations.id),
    courseCode: text("course_code")
      .notNull()
      .references(() => courses.code),
  },
  (t) => [primaryKey({ columns: [t.specialisationId, t.courseCode] })],
);

export const classSessions = sqliteTable(
  "class_sessions",
  {
    id: int().primaryKey({ autoIncrement: true }),
    courseCode: text("course_code")
      .notNull()
      .references(() => courses.code),
    sessionCode: text("session_code").notNull(),
    dayOfWeek: text("day_of_week").notNull(),
    // Minutes since midnight — makes overlap arithmetic trivial.
    startMinutes: int("start_minutes").notNull(),
    endMinutes: int("end_minutes").notNull(),
    location: text(),
    capacity: int().notNull(),
    // Static seed value; enrolledCount >= capacity is how a "full" session
    // is derived — no live seat competition.
    enrolledCount: int("enrolled_count").notNull().default(0),
  },
  (t) => [
    uniqueIndex("class_sessions_course_session_unique").on(t.courseCode, t.sessionCode),
    index("class_sessions_course_code_idx").on(t.courseCode),
  ],
);

export type ClassSession = typeof classSessions.$inferSelect;

// A course can only be planned once, period — it counts toward the one
// requirement targetRequirementId names, never two at once.
export const plannedCourses = sqliteTable(
  "planned_courses",
  {
    id: int().primaryKey({ autoIncrement: true }),
    courseCode: text("course_code")
      .notNull()
      .references(() => courses.code),
    targetRequirementId: int("target_requirement_id")
      .notNull()
      .references(() => requirements.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex("planned_courses_course_code_unique").on(t.courseCode),
    index("planned_courses_target_requirement_id_idx").on(t.targetRequirementId),
  ],
);

export type PlannedCourse = typeof plannedCourses.$inferSelect;

// One selected session per planned course — picking a different one
// replaces the row rather than adding a second. The invariant that the
// session's course must match the planned course's course isn't
// SQLite-CHECK-able across tables, so it's enforced in the query layer.
export const plannedSessions = sqliteTable(
  "planned_sessions",
  {
    id: int().primaryKey({ autoIncrement: true }),
    plannedCourseId: int("planned_course_id")
      .notNull()
      .references(() => plannedCourses.id, { onDelete: "cascade" }),
    classSessionId: int("class_session_id")
      .notNull()
      .references(() => classSessions.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex("planned_sessions_planned_course_id_unique").on(t.plannedCourseId),
    index("planned_sessions_class_session_id_idx").on(t.classSessionId),
  ],
);

export type PlannedSession = typeof plannedSessions.$inferSelect;
