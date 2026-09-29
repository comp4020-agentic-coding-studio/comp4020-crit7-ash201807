import type { APIRoute } from "astro";
import { db } from "../../../lib/db";
import { removeSelectedSession } from "../../../lib/planner";

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const plannedCourseId = Number(form.get("plannedCourseId"));
  const redirectTo = String(form.get("redirectTo") ?? "/timetable/");

  const target = new URL(redirectTo, request.url);

  if (Number.isInteger(plannedCourseId)) {
    removeSelectedSession(db, plannedCourseId);
    target.searchParams.set("plannerStatus", "success");
    target.searchParams.set("plannerMessage", "Removed session selection.");
  }

  return redirect(target.pathname + target.search, 303);
};
