import type { APIRoute } from "astro";
import { db } from "../../lib/db";
import { getPlannedCoursesDetailed, getSelectedSessions, getSessionsForCourse, PlannerError, selectSession } from "../../lib/planner";

// Same shape as api/planned-courses.ts. planner.ts's selectSession has no
// capacity check of its own (see planner.ts) — a full session is rejected
// here, before selectSession is ever called, so the rule holds against a
// direct POST and not just a hidden Select button. A session that is already
// the current selection is always allowed through (idempotent re-select),
// which is the only way a full session can ever end up selected.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const plannedCourseId = Number(form.get("plannedCourseId"));
  const classSessionId = Number(form.get("classSessionId"));
  const redirectTo = String(form.get("redirectTo") ?? "/timetable/");

  const target = new URL(redirectTo, request.url);

  if (!Number.isInteger(plannedCourseId) || !Number.isInteger(classSessionId)) {
    target.searchParams.set("plannerStatus", "error");
    target.searchParams.set("plannerMessage", "Missing planned course or session.");
    return redirect(target.pathname + target.search, 303);
  }

  const plannedCourse = getPlannedCoursesDetailed(db).find((pc) => pc.id === plannedCourseId);
  if (!plannedCourse) {
    target.searchParams.set("plannerStatus", "error");
    target.searchParams.set("plannerMessage", "Unknown planned course.");
    return redirect(target.pathname + target.search, 303);
  }

  const session = getSessionsForCourse(db, plannedCourse.courseCode).find((s) => s.id === classSessionId);
  if (!session) {
    target.searchParams.set("plannerStatus", "error");
    target.searchParams.set("plannerMessage", "Unknown session for this course.");
    return redirect(target.pathname + target.search, 303);
  }

  const alreadySelected = getSelectedSessions(db).some(
    (s) => s.plannedCourseId === plannedCourseId && s.session.id === classSessionId,
  );

  if (!alreadySelected && session.enrolledCount >= session.capacity) {
    target.searchParams.set("plannerStatus", "error");
    target.searchParams.set("plannerMessage", "This session is full.");
    return redirect(target.pathname + target.search, 303);
  }

  try {
    selectSession(db, plannedCourseId, classSessionId);
    target.searchParams.set("plannerStatus", "success");
    target.searchParams.set("plannerMessage", `Selected ${session.sessionCode} for ${plannedCourse.courseCode}.`);
  } catch (error) {
    target.searchParams.set("plannerStatus", "error");
    target.searchParams.set(
      "plannerMessage",
      error instanceof PlannerError ? error.message : "Could not select session.",
    );
  }

  return redirect(target.pathname + target.search, 303);
};
