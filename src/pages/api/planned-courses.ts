import type { APIRoute } from "astro";
import { db } from "../../lib/db";
import { addPlannedCourse, PlannerError } from "../../lib/planner";

// Same shape as api/messages.ts: a plain HTML form POSTs here, the write
// happens against SQLite, and a 303 redirect back to the referring page (from
// the hidden redirectTo field) makes it work with no client-side JavaScript.
// Only the redirect target's path+query are used — never a host it might
// carry — so a crafted redirectTo can't turn this into an open redirect.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const courseCode = String(form.get("courseCode") ?? "").trim();
  const targetRequirementId = Number(form.get("targetRequirementId"));
  const redirectTo = String(form.get("redirectTo") ?? "/requirements/");

  const target = new URL(redirectTo, request.url);

  if (!courseCode || !Number.isInteger(targetRequirementId)) {
    target.searchParams.set("plannerStatus", "error");
    target.searchParams.set("plannerMessage", "Missing course or requirement.");
    return redirect(target.pathname + target.search, 303);
  }

  try {
    addPlannedCourse(db, { courseCode, targetRequirementId });
    target.searchParams.set("plannerStatus", "success");
    target.searchParams.set("plannerMessage", `Added ${courseCode} to your plan.`);
  } catch (error) {
    target.searchParams.set("plannerStatus", "error");
    target.searchParams.set("plannerMessage", error instanceof PlannerError ? error.message : "Could not add course.");
  }

  return redirect(target.pathname + target.search, 303);
};
