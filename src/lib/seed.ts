import { and, eq } from "drizzle-orm";
import type { db as Db } from "./db";
import {
  classSessions,
  courseRequirements,
  courses,
  degrees,
  requirements,
  specialisationCourses,
  specialisations,
} from "./schema";

// Reference data for the 2026 ANU Master of Computing (7706XMCOMP) planner
// demo. This is a carefully selected slice, not the ANU course catalogue —
// see the Crit 7 brief for the scope constraints. Idempotent: every insert
// is keyed on the table's natural unique constraint (see schema.ts) and
// uses onConflictDoNothing, so running this twice never duplicates rows.

type RuleType = "FIXED_COURSES" | "MIN_UNITS" | "MAX_UNITS" | "MIN_8000_UNITS";

type CourseSeed = {
  code: string;
  title: string;
  units: number;
  level: number;
  isProjectCourse?: boolean;
};

const COURSE_SEEDS: CourseSeed[] = [
  { code: "COMP6120", title: "Advanced Topics in Software Engineering", units: 6, level: 6000 },
  { code: "COMP6442", title: "Web Application Development", units: 6, level: 6000 },
  { code: "COMP7710", title: "Computer Networks", units: 12, level: 7000 },
  { code: "COMP8280", title: "Human-Computer Interaction", units: 6, level: 8000 },
  { code: "MATH6005", title: "Foundations of Mathematics", units: 6, level: 6000 },
  { code: "COMP6260", title: "Foundations of Artificial Intelligence", units: 6, level: 6000 },
  { code: "COMP6261", title: "Introduction to Machine Learning", units: 6, level: 6000 },
  { code: "COMP6490", title: "Neural Networks, Deep Learning and Bayesian Learning", units: 6, level: 6000 },
  { code: "COMP6528", title: "Bayesian and Deep Learning", units: 6, level: 6000 },
  { code: "COMP6670", title: "Introduction to Theoretical Computer Science", units: 6, level: 6000 },
  { code: "COMP8600", title: "Statistical Machine Learning", units: 6, level: 8000 },
  { code: "COMP8650", title: "Statistical Natural Language Processing", units: 6, level: 8000 },
  { code: "COMP8880", title: "Network Science and Applications", units: 6, level: 8000 },
  { code: "ENGN8100", title: "Software Engineering Studio", units: 6, level: 8000 },
  // Official 2026 MComp project-course list. COMP8715 is 6 units and must be
  // completed twice, in consecutive semesters, to count as a 12-unit project
  // — this seed does not model that cross-semester constraint yet.
  { code: "COMP8715", title: "Advanced Computing Team Project", units: 6, level: 8000, isProjectCourse: true },
  { code: "COMP8830", title: "Computing Internship", units: 12, level: 8000, isProjectCourse: true },
  // Software Development's official 2026 optional list — only the codes
  // were given to us, not titles/units/level, so all three are placeholders
  // pending confirmation against the ANU catalogue; see the seed report.
  { code: "COMP6240", title: "COMP6240 (title to be confirmed)", units: 6, level: 6000 },
  { code: "COMP6331", title: "COMP6331 (title to be confirmed)", units: 6, level: 6000 },
  { code: "COMP6390", title: "COMP6390 (title to be confirmed)", units: 6, level: 6000 },
  { code: "INFS8004", title: "INFS8004 (title to be confirmed)", units: 6, level: 8000 },
  { code: "INFS8205", title: "INFS8205 (title to be confirmed)", units: 6, level: 8000 },
  { code: "LAWS8445", title: "LAWS8445 (title to be confirmed)", units: 6, level: 8000 },
  { code: "MGMT7020", title: "MGMT7020 (title to be confirmed)", units: 6, level: 7000 },
  { code: "REGN8014", title: "REGN8014 (title to be confirmed)", units: 6, level: 8000 },
];

type RequirementSeed = {
  key: string;
  name: string;
  ruleType: RuleType;
  requiredUnits: number | null;
  courseCodes: string[];
};

const DEGREE_WIDE_REQUIREMENTS: RequirementSeed[] = [
  {
    key: "compulsory",
    name: "Compulsory",
    ruleType: "MIN_UNITS",
    requiredUnits: 30,
    courseCodes: ["COMP6260", "COMP6442", "COMP7710", "COMP8280"],
  },
  {
    key: "foundation",
    name: "Foundation",
    ruleType: "MIN_UNITS",
    requiredUnits: 6,
    courseCodes: ["COMP6260", "MATH6005"],
  },
  {
    key: "comp8000-24u",
    name: "8000-level COMP",
    ruleType: "MIN_8000_UNITS",
    requiredUnits: 24,
    courseCodes: ["COMP8280", "COMP8600", "COMP8650", "COMP8880"],
  },
  {
    key: "project",
    name: "Project",
    ruleType: "MAX_UNITS",
    requiredUnits: 12,
    courseCodes: ["COMP8715", "COMP8830"],
  },
  {
    key: "further-comp-engn",
    name: "Further COMP/ENGN",
    ruleType: "MIN_UNITS",
    requiredUnits: 18,
    courseCodes: ["COMP6120", "ENGN8100", "COMP7710"],
  },
  {
    key: "anu-elective",
    name: "ANU Elective",
    ruleType: "MIN_UNITS",
    requiredUnits: 6,
    // No seeded course represents a genuine ANU elective (deliberately open
    // to almost any ANU course outside the program) — left empty rather than
    // implying Foundation courses satisfy it too.
    courseCodes: [],
  },
];

type SpecialisationSeed = {
  key: string;
  name: string;
  courseCodes: string[];
  requirements: RequirementSeed[];
};

const SPECIALISATIONS: SpecialisationSeed[] = [
  {
    key: "machine-learning",
    name: "Machine Learning",
    courseCodes: ["COMP6261", "COMP6490", "COMP6528", "COMP6670", "COMP8600", "COMP8650", "COMP8880"],
    requirements: [
      {
        key: "machine-learning-units",
        name: "Machine Learning — Total Units",
        ruleType: "MIN_UNITS",
        requiredUnits: 24,
        courseCodes: ["COMP6261", "COMP6490", "COMP6528", "COMP6670", "COMP8600", "COMP8650", "COMP8880"],
      },
      {
        key: "machine-learning-8000",
        name: "Machine Learning — 8000-level",
        ruleType: "MIN_8000_UNITS",
        requiredUnits: 12,
        courseCodes: ["COMP8600", "COMP8650", "COMP8880"],
      },
    ],
  },
  {
    key: "software-development",
    name: "Software Development",
    // Official 2026 pool: the two fixed courses plus the official optional
    // list. The non-project 8000-level COMP courses that satisfy the
    // 8000-level components below are eligible via course_requirements only
    // — not claimed here as "Software Development courses" in general, per
    // the eligibility-vs-fulfilment distinction.
    courseCodes: [
      "COMP6120",
      "ENGN8100",
      "COMP6240",
      "COMP6331",
      "COMP6390",
      "INFS8004",
      "INFS8205",
      "LAWS8445",
      "MGMT7020",
      "REGN8014",
    ],
    requirements: [
      {
        // The official 2026 rule also has a COMP6120-replacement note for
        // MCOMP students (a different fixed course substitutes for COMP6120
        // under some condition). That cross-requirement replacement logic is
        // intentionally out of scope for the Crit 7 MVP — COMP6120 is seeded
        // here as an unconditional fixed course.
        key: "software-development-fixed",
        name: "Software Development — Compulsory Courses",
        ruleType: "FIXED_COURSES",
        requiredUnits: null,
        courseCodes: ["COMP6120", "ENGN8100"],
      },
      {
        // 8000-level component pool: COMP-subject-area only, non-project —
        // ENGN8100 is fixed-course eligible (above) but does not count
        // toward this specifically-COMP 8000-level pool.
        key: "software-development-8000",
        name: "Software Development — Minimum 8000-level",
        ruleType: "MIN_8000_UNITS",
        requiredUnits: 12,
        courseCodes: ["COMP8280", "COMP8600", "COMP8650", "COMP8880"],
      },
      {
        key: "software-development-8000-comp-elective",
        name: "Software Development — 8000-level COMP Elective",
        ruleType: "MIN_UNITS",
        requiredUnits: 6,
        courseCodes: ["COMP8280", "COMP8600", "COMP8650", "COMP8880"],
      },
      {
        key: "software-development-optional-list",
        name: "Software Development — Optional List",
        ruleType: "MAX_UNITS",
        requiredUnits: 12,
        courseCodes: [
          "COMP6240",
          "COMP6331",
          "COMP6390",
          "INFS8004",
          "INFS8205",
          "LAWS8445",
          "MGMT7020",
          "REGN8014",
        ],
      },
      {
        key: "software-development-units",
        name: "Software Development — Total Units",
        ruleType: "MIN_UNITS",
        requiredUnits: 24,
        courseCodes: [
          "COMP6120",
          "ENGN8100",
          "COMP8280",
          "COMP8600",
          "COMP8650",
          "COMP8880",
          "COMP6240",
          "COMP6331",
          "COMP6390",
          "INFS8004",
          "INFS8205",
          "LAWS8445",
          "MGMT7020",
          "REGN8014",
        ],
      },
    ],
  },
];

type ClassSessionSeed = {
  courseCode: string;
  sessionCode: string;
  dayOfWeek: string;
  startMinutes: number;
  endMinutes: number;
  location: string;
  capacity: number;
  enrolledCount: number;
};

const CLASS_SESSIONS: ClassSessionSeed[] = [
  // Two options for the same course.
  { courseCode: "COMP6260", sessionCode: "LEC1", dayOfWeek: "MON", startMinutes: 540, endMinutes: 600, location: "Hanna Neumann G026", capacity: 100, enrolledCount: 40 },
  { courseCode: "COMP6260", sessionCode: "LEC2", dayOfWeek: "TUE", startMinutes: 540, endMinutes: 600, location: "Hanna Neumann G026", capacity: 100, enrolledCount: 30 },
  // Genuine conflict: both on WED, 10:00-12:00 vs 11:00-13:00 overlap.
  { courseCode: "COMP6261", sessionCode: "LEC1", dayOfWeek: "WED", startMinutes: 600, endMinutes: 720, location: "CSIT N101", capacity: 60, enrolledCount: 60 },
  { courseCode: "COMP8600", sessionCode: "LEC1", dayOfWeek: "WED", startMinutes: 660, endMinutes: 780, location: "CSIT N103", capacity: 50, enrolledCount: 20 },
  { courseCode: "ENGN8100", sessionCode: "LEC1", dayOfWeek: "THU", startMinutes: 840, endMinutes: 960, location: "Ian Ross G049", capacity: 80, enrolledCount: 10 },
];

export function seedPlannerData(db: typeof Db) {
  db.transaction((tx) => {
    tx.insert(degrees)
      .values({ code: "7706XMCOMP", name: "Master of Computing", year: 2026, totalUnits: 96 })
      .onConflictDoNothing()
      .run();
    const degree = tx
      .select()
      .from(degrees)
      .where(and(eq(degrees.code, "7706XMCOMP"), eq(degrees.year, 2026)))
      .get();
    if (!degree) throw new Error("degree seed failed to insert or read back");
    const degreeId = degree.id;

    for (const course of COURSE_SEEDS) {
      tx.insert(courses)
        .values({
          code: course.code,
          title: course.title,
          units: course.units,
          level: course.level,
          isProjectCourse: course.isProjectCourse ? 1 : 0,
        })
        .onConflictDoNothing()
        .run();
    }

    function upsertRequirement(spec: RequirementSeed, specialisationId: number | null) {
      tx.insert(requirements)
        .values({
          degreeId,
          specialisationId,
          key: spec.key,
          name: spec.name,
          ruleType: spec.ruleType,
          requiredUnits: spec.requiredUnits,
        })
        .onConflictDoNothing()
        .run();
      const requirement = tx
        .select()
        .from(requirements)
        .where(and(eq(requirements.degreeId, degreeId), eq(requirements.key, spec.key)))
        .get();
      if (!requirement) throw new Error(`requirement seed failed to insert or read back: ${spec.key}`);
      for (const courseCode of spec.courseCodes) {
        tx.insert(courseRequirements)
          .values({ requirementId: requirement.id, courseCode })
          .onConflictDoNothing()
          .run();
      }
    }

    for (const spec of DEGREE_WIDE_REQUIREMENTS) {
      upsertRequirement(spec, null);
    }

    for (const specialisation of SPECIALISATIONS) {
      tx.insert(specialisations)
        .values({ degreeId: degree.id, key: specialisation.key, name: specialisation.name })
        .onConflictDoNothing()
        .run();
      const specRow = tx
        .select()
        .from(specialisations)
        .where(and(eq(specialisations.degreeId, degree.id), eq(specialisations.key, specialisation.key)))
        .get();
      if (!specRow) throw new Error(`specialisation seed failed to insert or read back: ${specialisation.key}`);

      for (const courseCode of specialisation.courseCodes) {
        tx.insert(specialisationCourses)
          .values({ specialisationId: specRow.id, courseCode })
          .onConflictDoNothing()
          .run();
      }

      for (const spec of specialisation.requirements) {
        upsertRequirement(spec, specRow.id);
      }
    }

    for (const session of CLASS_SESSIONS) {
      tx.insert(classSessions)
        .values({
          courseCode: session.courseCode,
          sessionCode: session.sessionCode,
          dayOfWeek: session.dayOfWeek,
          startMinutes: session.startMinutes,
          endMinutes: session.endMinutes,
          location: session.location,
          capacity: session.capacity,
          enrolledCount: session.enrolledCount,
        })
        .onConflictDoNothing()
        .run();
    }
  });
}
