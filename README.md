# MyANU Planner

MyANU Planner (shown in the app's own nav as "MCOMP Planner") is a degree
planning and timetabling tool for a student in ANU's Master of Computing. It
lets a student see what their degree still requires, find courses that satisfy
a given requirement, build a personal plan of courses, and — once a course is
planned — pick a class session for it and check the resulting timetable for
clashes.

It is server-rendered (Astro, `output: "server"`) with a SQLite database
(via Drizzle ORM) as the only source of truth; every page reads current state
at request time, and every write happens through a plain HTML form POST with
no client-side JavaScript.

## Main user flow

1. **Browse degree requirements** — `/requirements/` lists every degree-wide
   requirement and every specialisation's requirements, each with a status
   badge (Complete / In progress / OK / Over limit) and a one-line summary of
   the rule and current progress.
2. **Inspect a requirement and its eligible courses** — clicking a
   requirement opens `/requirements/<key>`, which shows the rule in full, the
   student's progress against it, and a table of every course eligible for
   that requirement.
3. **Add/remove courses from My Plan** — from a requirement's eligible-courses
   table, "Add to plan" adds the course toward that specific requirement. A
   course already planned for a *different* requirement is shown as "Already
   planned (counts elsewhere)" instead of a second form, since a course can
   only be planned once. The "My Plan" section on `/requirements/` (also
   linked from the nav) lists every planned course with a "Remove" action.
4. **Choose/change/remove a class session** — once a course is planned, "My
   Plan" links to `/timetable/<plannedCourseId>`, which lists that course's
   class sessions (day/time, location, seats). Selecting one replaces any
   previous selection for that course. A session at capacity is shown with a
   "Full" badge and no Select button, and the server also rejects a direct
   POST attempting to select a full session. A selected session can be
   removed from the same page.
5. **View the timetable and conflicts** — `/timetable/` lists every selected
   session across all planned courses. If two selected sessions overlap in
   time on the same day, both rows are highlighted and a conflict banner and
   list appear naming the clashing course/session pairs and the day.

## Pages and routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page; links to Degree Requirements, My Plan, and Timetable. |
| `/requirements/` | All degree-wide and specialisation requirements with progress, plus the "My Plan" table of currently planned courses. |
| `/requirements/<key>` | One requirement's detail and its eligible-courses table, with Add-to-plan forms. |
| `/timetable/` | All currently selected class sessions, with conflict detection and display. |
| `/timetable/<plannedCourseId>` | Session chooser for one planned course: select, change, or remove its selected session. |
| `/readme/` | Renders this file, in full, as the app's About page. |

Writes go through four form-only API routes, each a 303 redirect back to the
page that posted to it (carrying a status/message for the banner shown
there): `POST /api/planned-courses`, `POST /api/planned-courses/remove`,
`POST /api/planned-sessions`, `POST /api/planned-sessions/remove`.

## Requirement / progress model

A degree has degree-wide requirements and one or more specialisations, each
with its own requirements. Every requirement has a `ruleType`:

- `FIXED_COURSES` — complete every course in a fixed, named list.
- `MIN_UNITS` — plan at least N units of eligible courses.
- `MAX_UNITS` — at most N units of the planned courses eligible for this
  requirement count toward it (extra planned courses still count elsewhere,
  they just don't push this requirement further).
- `MIN_8000_UNITS` — at least N units of eligible courses at 8000-level.

A course's eligibility for a requirement is a many-to-many relationship
(`courseRequirements`); which single requirement a planned course actually
counts toward is recorded per planned-course row, not inferred. Progress is
computed at read time from the currently planned courses — nothing about
progress is cached or stored, so there's nothing that can drift out of sync
with the plan.

## Running locally

```sh
pnpm install
pnpm dev
```

This starts the Astro dev server (`astro dev`) against a local SQLite file at
`./.data/app.db` (created automatically; overridable via the `DATABASE_PATH`
environment variable). Migrations and seed data are applied automatically the
first time a database-backed route is requested.

## Verification

```sh
pnpm typecheck   # astro check
pnpm test        # astro build && vitest run — builds, then runs spec/ against the built server
pnpm build       # astro build — production server build
```

`pnpm check` runs `typecheck` and `test` together.

## Known limitations

- **Session data only covers a handful of courses.** Only 4 of the 25 seeded
  courses currently have any class sessions, so choosing a session for most
  other planned courses shows "No sessions available for this course yet."
- **The one genuine overlapping session pair in the seed data can't be
  triggered through the app as shipped.** COMP6261 and COMP8600 have
  overlapping sessions, but COMP6261's only session is also seeded at full
  capacity, and full sessions cannot be selected — so no sequence of real UI
  actions currently produces a visible timetable conflict against the shipped
  seed data. Conflict detection and display are still exercised and verified
  at the HTTP level in `spec/timetable.test.ts`, which inserts an additional
  non-full overlapping session into its own test database for that purpose.
- **A few course titles are placeholders.** Some seeded courses are titled
  e.g. "COMP6240 (title to be confirmed)" pending confirmation against the
  ANU course catalogue.
- **The plan is a single shared plan, not per-user.** There is no login or
  account model — all planned courses and sessions live in one shared set of
  tables.
- **Degree-level `totalUnits` is display-only.** It is not summed against or
  enforced by any rule, since the real ANU unit buckets overlap and aren't
  simply additive.
