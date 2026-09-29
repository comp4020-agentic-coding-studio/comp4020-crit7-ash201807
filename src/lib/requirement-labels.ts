import type { RequirementProgress } from "./planner";

// Presentation strings for a requirement's rule/progress — display logic, not
// data access, so it lives beside planner.ts rather than inside it. Shared by
// src/pages/requirements.astro and src/pages/requirements/[key].astro.

export function describeRule(progress: RequirementProgress): string {
  const units = progress.requirement.requiredUnits ?? 0;
  switch (progress.requirement.ruleType) {
    case "FIXED_COURSES":
      return "Complete all of the listed courses";
    case "MIN_UNITS":
      return `Minimum ${units} units`;
    case "MAX_UNITS":
      return `Maximum ${units} units count toward this requirement`;
    case "MIN_8000_UNITS":
      return `Minimum ${units} units at 8000-level`;
    default:
      return "";
  }
}

export function describeProgress(progress: RequirementProgress): string {
  const units = progress.requirement.requiredUnits ?? 0;
  if (progress.requirement.ruleType === "FIXED_COURSES") {
    const poolSize = progress.plannedCourses.length + progress.missingFixedCourses.length;
    return `${progress.plannedCourses.length} of ${poolSize} courses complete`;
  }
  if (progress.requirement.ruleType === "MAX_UNITS") {
    return `${progress.unitsCounted} / ${units} units used`;
  }
  return `${progress.unitsCounted} / ${units} units`;
}

export type RequirementStatus = "complete" | "incomplete" | "ok" | "warning";

export function statusOf(progress: RequirementProgress): RequirementStatus {
  if (progress.requirement.ruleType === "MAX_UNITS") {
    return progress.isOverLimit ? "warning" : "ok";
  }
  return progress.isSatisfied ? "complete" : "incomplete";
}

export function statusLabel(status: RequirementStatus): string {
  switch (status) {
    case "complete":
      return "Complete";
    case "incomplete":
      return "In progress";
    case "warning":
      return "Over limit";
    case "ok":
      return "OK";
  }
}
