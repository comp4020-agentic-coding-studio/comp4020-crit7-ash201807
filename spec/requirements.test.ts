import { afterEach, describe, expect, inject, it } from "vitest";

// HTTP-level tests for the Degree Requirements UI (Checkpoint 4): the
// requirements list, requirement detail pages, and the add/remove-to-plan
// actions. Runs against the built server + its throwaway seeded database,
// same as spec/guestbook.test.ts — see spec/global-setup.ts.
const baseUrl = inject("baseUrl");

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

async function removePlanned(courseCode: string) {
  await post("/api/planned-courses/remove", new URLSearchParams({ courseCode, redirectTo: "/requirements/" }));
}

describe("/requirements", () => {
  it("loads and shows the seeded degree and its requirements", async () => {
    const res = await fetch(new URL("/requirements/", baseUrl));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Master of Computing");
    expect(html).toContain("Foundation");
    expect(html).toContain("Machine Learning");
  });
});

describe("/requirements/[key]", () => {
  it("shows the requirement's eligible courses", async () => {
    const res = await fetch(new URL("/requirements/foundation", baseUrl));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("COMP6260");
    expect(html).toContain("MATH6005");
  });

  it("404s for an unknown requirement key", async () => {
    const res = await fetch(new URL("/requirements/not-a-real-requirement", baseUrl));
    expect(res.status).toBe(404);
  });
});

describe("adding and removing a planned course", () => {
  afterEach(async () => {
    await removePlanned("COMP6670");
  });

  it("persists a valid addition and reflects it in requirement progress", async () => {
    const detailBefore = await get("/requirements/machine-learning-units");
    const targetRequirementId = extractTargetRequirementId(detailBefore);

    const res = await post(
      "/api/planned-courses",
      new URLSearchParams({
        courseCode: "COMP6670",
        targetRequirementId: String(targetRequirementId),
        redirectTo: "/requirements/machine-learning-units",
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("plannerStatus=success");

    const detailAfter = await get("/requirements/machine-learning-units");
    expect(detailAfter).toContain("6 / 24 units");

    const listPage = await get("/requirements/");
    expect(listPage).toContain("COMP6670");
  });

  it("rejects a course that is not eligible for the target requirement", async () => {
    const detail = await get("/requirements/foundation");
    const foundationId = extractTargetRequirementId(detail);

    // COMP8600 is not in the foundation pool.
    const res = await post(
      "/api/planned-courses",
      new URLSearchParams({
        courseCode: "COMP8600",
        targetRequirementId: String(foundationId),
        redirectTo: "/requirements/foundation",
      }),
    );
    expect(res.headers.get("location")).toContain("plannerStatus=error");

    const listPage = await get("/requirements/");
    expect(listPage).not.toContain("COMP8600");
  });

  it("rejects a duplicate planned course", async () => {
    const detail = await get("/requirements/machine-learning-units");
    const targetRequirementId = extractTargetRequirementId(detail);
    const body = new URLSearchParams({
      courseCode: "COMP6670",
      targetRequirementId: String(targetRequirementId),
      redirectTo: "/requirements/machine-learning-units",
    });

    const first = await post("/api/planned-courses", body);
    expect(first.headers.get("location")).toContain("plannerStatus=success");

    const second = await post("/api/planned-courses", body);
    expect(second.headers.get("location")).toContain("plannerStatus=error");
  });

  it("removing a planned course persists", async () => {
    const detail = await get("/requirements/machine-learning-units");
    const targetRequirementId = extractTargetRequirementId(detail);
    await post(
      "/api/planned-courses",
      new URLSearchParams({
        courseCode: "COMP6670",
        targetRequirementId: String(targetRequirementId),
        redirectTo: "/requirements/machine-learning-units",
      }),
    );

    await removePlanned("COMP6670");

    const listPage = await get("/requirements/");
    expect(listPage).not.toContain("COMP6670");
  });
});
