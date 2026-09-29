# Process overview

## What I built

MyANU Planner: a server-rendered degree and timetable planner for ANU's
Master of Computing. It lets a student browse degree requirements, see which
courses are eligible for each one, build a plan, choose a class session for
each planned course, and view the resulting timetable with any day/time
conflicts. `README.md` describes what the app is and what it does; this file
describes how it was built.

## How I got here

The build progressed as five checkpoints, each one commit, each building only
on the previous (already-tested) layer, followed by a finalisation pass.

### 1. Schema / migration — [`9745653`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-ash201807/commit/9745653)

**Problem:** the starter ships only a guestbook `messages` table; the planner
needed a real relational model for degrees, specialisations, requirements,
courses, class sessions, and a student's plan.

**Implemented:** `src/lib/schema.ts` extended with `degrees`,
`specialisations`, `requirements`, `courses`, `courseRequirements`,
`specialisationCourses`, `classSessions`, `plannedCourses`, and
`plannedSessions`, each with the unique/foreign-key constraints the domain
needs (e.g. `planned_courses_course_code_unique` — a course can only be
planned once; `planned_sessions_planned_course_id_unique` — one selected
session per planned course). The migration was generated with
`pnpm db:generate` and committed alongside the schema
(`drizzle/0001_grey_sabretooth.sql` and its snapshot).

**Verified:** the migration applies automatically at server boot
(`src/lib/db.ts` calls `migrate()` before seeding), so a schema mismatch would
surface immediately on the next `pnpm build`/`pnpm test`.

**Design decisions:** the starter's `messages` table was left untouched rather
than merged into the new schema; progress and timetable conflicts were
deliberately designed to be computed at read time from these tables rather
than stored, so there is nothing derived that can drift out of sync.

**Kept incremental:** schema only — no queries, no UI, no seed data yet.

### 2. Planner seed/reference data — [`fcf2d6f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-ash201807/commit/fcf2d6f)

**Problem:** a schema with no data can't be developed or tested against; the
planner needed real ANU MComp reference data to be meaningful.

**Implemented:** `src/lib/seed.ts` — the 7706XMCOMP degree, its six
degree-wide requirements, the Machine Learning and Software Development
specialisations, and a small hand-authored set of class sessions deliberately
covering a multi-session course, a full session, and a conflicting pair. Every
insert uses `.onConflictDoNothing()` inside a single transaction, so
re-running the seed is safe.

**Verified:** the commit message records that the reference data was
"cross-checked against the official 2026 ANU program and specialisation pages
across two correction rounds" — a real correction against the source data,
not a one-shot guess.

**Design decisions:** a few course titles were left as explicit placeholders
pending catalogue confirmation rather than guessed; a COMP6120-replacement
rule for MCOMP students in the Software Development specialisation was noted
in a comment as deliberately out of scope for this MVP.

**Kept incremental:** seed data only, no query layer built on it yet.

### 3. Planner query/service layer — [`a54cb4f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-ash201807/commit/a54cb4f)

**Problem:** requirement progress, course eligibility, planned-course state,
session queries, and timetable conflicts all needed a single place to be
computed correctly, before any page had to render them.

**Implemented:** `src/lib/planner.ts` — pure read/write query functions over
the schema. The commit message is explicit that this was "No UI or API routes
yet."

**Verified:** `spec/planner.test.ts` (16 tests) was added in the same commit,
testing the query layer directly — degree/requirement loading, progress for
each rule type, add/reject/duplicate/remove for planned courses, eligible
courses, session selection and removal, the seeded genuine conflict pair, and
idempotent re-seeding.

**Kept incremental:** logic was proven correct in isolation, against its own
tests, before anything (UI or API) came to depend on it.

### 4. Requirements and plan UI — [`b530dc6`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-ash201807/commit/b530dc6)

**Problem:** the query layer needed a usable page, and the starter's
guestbook homepage no longer matched the app's actual purpose.

**Implemented:** `/requirements/` (requirement list with progress/status),
`/requirements/[key]` (one requirement's detail, eligible courses, add-to-plan
forms), a "My Plan" section with remove actions, an MCOMP Planner landing page
replacing the guestbook homepage, a `/timetable/` placeholder, two new API
routes (`api/planned-courses`, `api/planned-courses/remove`), two small
additions to `planner.ts`, and `requirement-labels.ts` for status/progress
display strings.

**Verified:** `spec/requirements.test.ts` (7 tests) was added; `spec/
guestbook.test.ts` was deleted in the same commit because it asserted
homepage content that no longer existed after the homepage was replaced —
visible directly in the diff (-60 lines) rather than left to silently rot.

**Design decisions/corrections:** the guestbook *backend*
(`api/messages`, `api/events`) was deliberately left in place but unlinked
from the UI rather than deleted at this point — the commit message says so
explicitly ("just no longer linked from the UI"). This is the origin of the
dead code later flagged in the finalisation audit (see checkpoint 6).

**Kept incremental:** one vertical slice — list, detail, add, remove — built
only on the already-tested query layer from checkpoint 3.

### 5. Timetable and session selection — [`f050c1d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-ash201807/commit/f050c1d)

**Problem:** a planned course had no way to choose a concrete class session,
and there was no real timetable view or conflict detection.

**Implemented:** `session-labels.ts` (day/time formatting, full-session
check), `api/planned-sessions` and its `/remove` route, `/timetable/` turned
into a real page with a conflict banner and list, and
`/timetable/[plannedCourseId]` — a session chooser that blocks selecting a
full session on the server (not just by hiding the button in the UI).

**Verified:** `spec/timetable.test.ts` (5 tests) was added, run at the HTTP
level against the built server via `spec/global-setup.ts`.

**Design decision/correction:** the seed data's only genuinely overlapping
session pair (COMP6261/COMP8600) has its overlapping session marked full, so
it can never be selected through the app and can't demonstrate conflict
display end-to-end. The test file inserts one additional, non-full,
overlapping session directly into its own throwaway test database to prove
conflict display works via a real user action. Building that fixture
surfaced a real bug: the test's `beforeAll` opened a raw database connection
to insert that row, but the root route (`/`) is static and never imports
`src/lib/db.ts`, so the schema migration and seeding — which run lazily, on
first import of a database-backed route — hadn't necessarily happened yet.
The fix was to issue a real `GET /requirements/` request first, forcing that
import before the raw connection opens; the reasoning is left in place as a
comment directly above the fix in `spec/timetable.test.ts`.

**Kept incremental:** session selection was added as its own API route
rather than by modifying `planner.ts` or the existing planned-courses routes
— the commit message states this explicitly, keeping the change scoped to
exactly the new behaviour.

### 6. Final verification / finalisation — in progress, not yet committed

**Problem:** once checkpoint 5 landed, decide whether the project is ready to
be treated as a complete MVP, and bring the project's documentation in line
with what actually shipped, without adding new features or changing existing
behaviour.

**Implemented so far:**

- A full read-only audit: `git status`/`git log`, every page and API route,
  the seed data's actual demoability, the accessibility/invariants baseline,
  and a fresh run of `pnpm typecheck`, `pnpm test` (77 tests across 6 files),
  and `pnpm build` — all clean. The audit distinguished genuine bugs (none
  found) from scope/documentation debt: `README.md` and this file were both
  still the unedited starter template, `api/messages.ts`/`api/events.ts`/
  `src/lib/events.ts` (the guestbook backend left in place in checkpoint 4)
  are unreferenced by any page, and two exports in `planner.ts`
  (`getRequirementsProgress`, `getCoursesForSpecialisation`) have no call
  sites.
- `README.md` was rewritten to describe the shipped app — its user flow, its
  pages/routes, its requirement/progress model, how to run and verify it, and
  its known limitations (e.g. the unreachable seeded conflict pair above) —
  grounded in the routes and schema reviewed during the audit rather than
  written from scratch.
- This file was written as the next step of the same finalisation pass.

**Verified:** `pnpm typecheck`, `pnpm test`, and `pnpm build` were re-run
after the `README.md` change and again after this file, each time clean.

**Not yet done:** neither `README.md` nor this file has been committed yet —
review and commit are being kept as separate, deliberate steps.

## The role of agentic coding in this process

**Breaking the work into checkpoints:** each commit above corresponds to one
architectural layer — schema, then seed data, then the query/service layer,
then the requirements/plan UI, then the timetable/session UI — each depending
only on the previous, already-tested layer. This is visible directly in the
commit messages themselves (e.g. checkpoint 3's message states plainly that
there was "No UI or API routes yet").

**Inspecting before changing:** the finalisation phase (checkpoint 6) was
explicitly a read-only pass first — git history, every route, the seed data,
and a fresh test/typecheck/build run — before any file was touched, and each
subsequent step (the `README.md` rewrite, this file) was scoped to first
reading the current README, the git log, the source structure, and
`spec/README.md` before writing anything.

**Constraining file scope:** each finalisation instruction named exactly which
files were allowed to change (e.g. "only update `README.md`", "do not modify
source code, tests, schema, seed data, or configuration"), and checkpoint 5's
own commit message shows the same discipline earlier in the build — session
selection was added as a new file rather than by editing `planner.ts` or the
existing planned-courses routes, to keep that change scoped to exactly the
new behaviour.

**Using tests/typecheck/build to verify changes:** every checkpoint that
changed behaviour added or extended a matching `spec/*.test.ts` file in the
same commit, and the finalisation phase re-ran `pnpm typecheck`, `pnpm test`,
and `pnpm build` after every documentation change rather than relying on the
diff alone.

**Surfacing and correcting assumptions:** two concrete corrections are on the
record rather than asserted after the fact — the seed data's reference values
were checked against the real ANU program pages across two rounds
(checkpoint 2's own commit message), and checkpoint 5's test setup wrongly
assumed the server being reachable meant the database schema had already been
migrated; that assumption was found to be false, fixed, and the reasoning
left in place as a comment in `spec/timetable.test.ts` rather than silently
patched over.

**Using commits as checkpoints:** each commit is a complete, independently
working slice — schema alone; seed data alone; the query layer with its own
tests; one UI vertical slice with its tests; the timetable with its tests —
so the commit history above can be read top-to-bottom as the actual build
order, with the test suite left green at the end of each one before the next
checkpoint began.
