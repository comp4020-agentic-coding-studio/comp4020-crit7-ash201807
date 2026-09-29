# Crit 7 reflection

## What I built and why

MyANU Planner tackles a real ANU planning problem: a Master of Computing
student has to satisfy a set of degree-wide requirements *and* a
specialisation's own requirements, using courses that overlap between the
two, and then actually fit the courses they've chosen into a timetable
without clashing sessions. I picked an MCOMP degree planner over something
simpler because the domain has genuine rules worth encoding, not just a list
to CRUD: four different requirement types (fixed courses, minimum units,
maximum units, minimum 8000-level units), courses that can be eligible for
more than one requirement but only ever count toward one, and class sessions
that can be full or can overlap. Degree requirements, course planning, and
timetable selection are really three layers of the same problem: what do I
still need, what satisfies it, and can I actually attend it — so the app is
built as those three layers on top of one schema, not three separate
features bolted together.

## How the system evolved

The build went schema first, then seed data, then a query/service layer, then
the requirements UI, then timetable and session selection, and finally this
finalisation pass. Each stage only depended on the stage before it being
already correct: the schema existed with no data before any seed data was
written, the seed data existed with no query layer reading it before
`planner.ts` was written, and `planner.ts` had its own tests passing before
any page rendered a single number from it. Timetable and session selection
came last because it depended on everything else already being right — a
session only means something once there's a planned course to attach it to.

## How I worked with Claude Code

I kept each checkpoint to one commit and one concern, and I was explicit
about what could change: schema-only, seed-data-only, and so on, rather than
letting one session's work sprawl across the whole app. Before any
implementation, I asked for the current state to be inspected first — the
existing schema, the existing tests, what a change would touch — rather than
just going straight to code. Tests, typecheck, and build were the actual
gate at every step, not an afterthought: nothing was considered done until
`pnpm test`, `pnpm typecheck`, and `pnpm build` all passed clean. For this
finalisation phase specifically, I asked for a read-only audit before
touching anything, so I could see what was actually true about the project
before deciding what to write about it.

## Corrections and learning

A few real corrections stand out. The seed data's reference values weren't
right the first time — they got checked against the actual ANU program and
specialisation pages across two separate correction rounds before I trusted
them. Writing the timetable tests surfaced a genuine bug: a test opened its
own database connection assuming the schema had already migrated, but
migration only happens lazily on first request, so the test had to make a
real request first to force it. When that same test needed two sessions that
actually overlap to prove conflict detection worked, the honest fix wasn't
to weaken the full-session rule so the seeded conflicting pair became
selectable — it was to add one extra test-only session and leave the real
rule alone. And during finalisation I had to keep pulling apart "this is
broken" from "this would be nice later": the dead guestbook code left over
from the requirements-UI checkpoint is a real loose end, but it's not a bug,
and it stayed as a documented finding rather than something I fixed on the
spot.

## What I learned about agentic software development

The biggest thing I learned is that an agent will find the path of least
resistance to a green test unless you're specific about which constraint is
load-bearing — the full-session case only stayed honest because I insisted
the fixture change, not the rule. I also learned that checkpoint-sized
commits pay off later: because the query layer was fully tested before any
UI touched it, later bugs (like the migration timing issue) were isolated to
the layer that actually had the problem instead of being tangled up with
everything else. And a dedicated "inspect, don't fix" pass turned out to
find things a normal "go fix problems" pass wouldn't have surfaced at all,
like a README that was still the unedited starter template.

## What remains limited

Some limitations are just where the project is, not bugs: only 4 of the 25
seeded courses have any class sessions yet, a few course titles are still
placeholders pending catalogue confirmation, the one genuinely overlapping
seeded session pair can't be triggered through the real UI because its
overlapping session is also the seeded full one, the plan is a single shared
plan rather than per-user, and the degree's total-units figure is
display-only rather than something any rule actually checks against.
