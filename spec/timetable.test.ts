import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from "vitest";
import { classSessions } from "../src/lib/schema";

// HTTP-level tests for Session Selection / Timetable (Checkpoint 5): choosing,
// changing and removing a session, the full-session block enforced at the API
// (not just a hidden button), and conflict display. Runs against the same
// built server + throwaway database as spec/requirements.test.ts — see
// spec/global-setup.ts. `/timetable/<plannedCourseId>` is deliberately not in
// spec/routes.ts (its id is runtime-generated, not a stable seeded value like
// /requirements/foundation) — this file covers it instead, using real ids
// created through the normal add-to-plan flow.
const baseUrl = inject("baseUrl");
const dbPath = inject("dbPath");

const post = (path: string, body: URLSearchParams) =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { origin: baseUrl },
    body,
    redirect: "manual",
  });

const get = async (path: string) => (await fetch(new URL(path, baseUrl))).text();

function extractTargetRequirementId(html: string): number {
  const match = html.match(/name="targetRequirementId" value="(\d+)"/);
  if (!match) throw new Error("no add-to-plan form found on the page");
  return Number(match[1]);
}

function extractPlannedCourseId(html: string, courseCode: string): number {
  const rowStart = html.indexOf(`<td>${courseCode}</td>`);
  if (rowStart === -1) throw new Error(`no planned row for ${courseCode}`);
  const rowEnd = html.indexOf("</tr>", rowStart);
  const match = html.slice(rowStart, rowEnd).match(/\/timetable\/(\d+)/);
  if (!match) throw new Error(`no timetable link for ${courseCode}`);
  return Number(match[1]);
}

function extractSessionId(html: string, sessionCode: string): number {
  const cellIndex = html.indexOf(`<td>${sessionCode}</td>`);
  if (cellIndex === -1) throw new Error(`no session row for ${sessionCode}`);
  const trStart = html.lastIndexOf("<tr", cellIndex);
  const match = html.slice(trStart, cellIndex).match(/data-session-id="(\d+)"/);
  if (!match) throw new Error(`no session id for ${sessionCode}`);
  return Number(match[1]);
}

function extractFullSessionId(html: string): number {
  const match = html.match(/data-session-id="(\d+)" data-full="true"/);
  if (!match) throw new Error("no full session row found");
  return Number(match[1]);
}

async function planCourse(courseCode: string, requirementKey: string) {
  const detail = await get(`/requirements/${requirementKey}`);
  const targetRequirementId = extractTargetRequirementId(detail);
  return post(
    "/api/planned-courses",
    new URLSearchParams({ courseCode, targetRequirementId: String(targetRequirementId), redirectTo: "/requirements/" }),
  );
}

async function removePlanned(courseCode: string) {
  await post("/api/planned-courses/remove", new URLSearchParams({ courseCode, redirectTo: "/requirements/" }));
}

async function selectSessionHttp(plannedCourseId: number, classSessionId: number) {
  return post(
    "/api/planned-sessions",
    new URLSearchParams({
      plannedCourseId: String(plannedCourseId),
      classSessionId: String(classSessionId),
      redirectTo: `/timetable/${plannedCourseId}`,
    }),
  );
}

// The seed data's only genuine overlap is COMP6261 LEC1 vs COMP8600 LEC1 (see
// src/lib/seed.ts), but COMP6261 LEC1 is also the seeded full session — once
// the full-session block below is in place, that pair can never actually be
// selected through the UI/API, so it can't demonstrate conflict display
// end-to-end. This inserts one extra, non-full, overlapping session directly
// into this test run's own throwaway database (never touching
// src/lib/seed.ts) purely so this file can select two genuinely conflicting
// sessions the same way a real user would.
let extraSessionClient: Database.Database;

beforeAll(async () => {
  // The root "/" page global-setup health-checks is pure static markup — it
  // never imports src/lib/db.ts, so it proves the HTTP server is listening
  // but not that migrations have run yet (that happens lazily, on first
  // import of a route that touches the db). A real request to such a route
  // forces that import before this file opens its own raw connection to the
  // same file, or the table below wouldn't exist yet.
  await get("/requirements/");

  extraSessionClient = new Database(dbPath);
  extraSessionClient.pragma("busy_timeout = 5000");
  drizzle(extraSessionClient)
    .insert(classSessions)
    .values({
      courseCode: "MATH6005",
      sessionCode: "LEC1",
      dayOfWeek: "THU",
      startMinutes: 900,
      endMinutes: 1020,
      location: "Test-only overlap fixture",
      capacity: 40,
      enrolledCount: 5,
    })
    .onConflictDoNothing()
    .run();
});

afterAll(() => {
  extraSessionClient.close();
});

describe("choosing, changing and removing a session", () => {
  afterEach(async () => {
    await removePlanned("COMP6260");
  });

  it("selecting a session shows it on My Plan and the Timetable", async () => {
    await planCourse("COMP6260", "foundation");
    const plan = await get("/requirements/");
    const plannedCourseId = extractPlannedCourseId(plan, "COMP6260");

    const chooseSession = await get(`/timetable/${plannedCourseId}`);
    const lec1Id = extractSessionId(chooseSession, "LEC1");

    const res = await selectSessionHttp(plannedCourseId, lec1Id);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("plannerStatus=success");

    const planAfter = await get("/requirements/");
    expect(planAfter).toContain("Session selected: Monday 09:00–10:00");
    expect(planAfter).toContain(`/timetable/${plannedCourseId}`);

    const timetable = await get("/timetable/");
    expect(timetable).toContain("COMP6260");
    expect(timetable).toContain("LEC1");
  });

  it("selecting a different session replaces the previous selection", async () => {
    await planCourse("COMP6260", "foundation");
    const plan = await get("/requirements/");
    const plannedCourseId = extractPlannedCourseId(plan, "COMP6260");

    const chooseSession = await get(`/timetable/${plannedCourseId}`);
    const lec1Id = extractSessionId(chooseSession, "LEC1");
    const lec2Id = extractSessionId(chooseSession, "LEC2");

    await selectSessionHttp(plannedCourseId, lec1Id);
    await selectSessionHttp(plannedCourseId, lec2Id);

    const timetable = await get("/timetable/");
    expect(timetable).toContain("LEC2");
    expect(timetable).not.toContain("LEC1");

    const chooseAfter = await get(`/timetable/${plannedCourseId}`);
    expect(chooseAfter).toContain("Selected");
  });

  it("removing a selection clears it from My Plan and the Timetable, and persists across a fresh request", async () => {
    await planCourse("COMP6260", "foundation");
    const plan = await get("/requirements/");
    const plannedCourseId = extractPlannedCourseId(plan, "COMP6260");

    const chooseSession = await get(`/timetable/${plannedCourseId}`);
    const lec1Id = extractSessionId(chooseSession, "LEC1");
    await selectSessionHttp(plannedCourseId, lec1Id);

    const removeRes = await post(
      "/api/planned-sessions/remove",
      new URLSearchParams({ plannedCourseId: String(plannedCourseId), redirectTo: `/timetable/${plannedCourseId}` }),
    );
    expect(removeRes.status).toBe(303);

    // A fresh, independent GET (not following the redirect) — proves the
    // removal was persisted to the database, not just reflected in the
    // response that made the change.
    const timetable = await get("/timetable/");
    expect(timetable).not.toContain("COMP6260");

    const planAfter = await get("/requirements/");
    expect(planAfter).toContain("No session selected");
    expect(planAfter).toContain("Choose session");
  });
});

describe("a full session cannot be selected", () => {
  afterEach(async () => {
    await removePlanned("COMP6261");
  });

  it("shows a Full badge with no Select button, and rejects a direct POST to select it", async () => {
    await planCourse("COMP6261", "machine-learning-units");
    const plan = await get("/requirements/");
    const plannedCourseId = extractPlannedCourseId(plan, "COMP6261");

    const chooseSession = await get(`/timetable/${plannedCourseId}`);
    expect(chooseSession).toContain("Full");
    expect(chooseSession).not.toContain(">Select<");

    // Bypass the UI entirely: POST directly, the way a crafted request would.
    const fullSessionId = extractFullSessionId(chooseSession);
    const res = await selectSessionHttp(plannedCourseId, fullSessionId);
    expect(res.headers.get("location")).toContain("plannerStatus=error");

    const timetable = await get("/timetable/");
    expect(timetable).not.toContain("COMP6261");
  });
});

describe("timetable conflicts", () => {
  afterEach(async () => {
    await removePlanned("MATH6005");
    await removePlanned("ENGN8100");
  });

  it("displays a conflict when two selected sessions overlap", async () => {
    await planCourse("MATH6005", "foundation");
    await planCourse("ENGN8100", "further-comp-engn");

    const plan = await get("/requirements/");
    const mathId = extractPlannedCourseId(plan, "MATH6005");
    const engnId = extractPlannedCourseId(plan, "ENGN8100");

    const mathChoose = await get(`/timetable/${mathId}`);
    const mathSessionId = extractSessionId(mathChoose, "LEC1");
    const engnChoose = await get(`/timetable/${engnId}`);
    const engnSessionId = extractSessionId(engnChoose, "LEC1");

    await selectSessionHttp(mathId, mathSessionId);
    await selectSessionHttp(engnId, engnSessionId);

    const timetable = await get("/timetable/");
    expect(timetable).toContain("conflict");
    expect(timetable).toContain("MATH6005");
    expect(timetable).toContain("ENGN8100");
    expect(timetable).toContain("Thursday");
  });
});
