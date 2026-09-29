import type { APIRoute } from "astro";
import { db } from "../../../lib/db";
import { removePlannedCourse } from "../../../lib/planner";

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const courseCode = String(form.get("courseCode") ?? "").trim();
  const redirectTo = String(form.get("redirectTo") ?? "/requirements/");

  const target = new URL(redirectTo, request.url);

  if (courseCode) {
    removePlannedCourse(db, courseCode);
    target.searchParams.set("plannerStatus", "success");
    target.searchParams.set("plannerMessage", `Removed ${courseCode} from your plan.`);
  }

  return redirect(target.pathname + target.search, 303);
};
