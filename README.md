# Sequen

AI-native project scheduling — a lighter, smarter alternative to Primavera P6, built for construction/civil engineering projects.

## Stack

Next.js 16 (App Router) · TypeScript · Supabase (Postgres + Auth) · Tailwind CSS + shadcn/ui · Gemini API

## Setup

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — already populated for the `sequen` Supabase project created for this app.
- `GEMINI_API_KEY` — required for the AI features (schedule generation, Excel column auto-mapping, duration estimation, risk flagging). Get one at https://aistudio.google.com/apikey. Without it, the rest of the app works normally and the AI features fail gracefully with a clear message.

```bash
npm run dev
```

## Testing

The CPM engine and rule-based risk checks are pure functions with unit test coverage:

```bash
npm test
```

## Project structure

- `src/lib/cpm/` — the critical path method engine (forward/backward pass, float, FS/SS/FF/SF dependencies, cycle detection). Pure, framework-free, fully unit tested.
- `src/lib/risk.ts` — rule-based schedule risk checks (over-allocation, unrealistic durations, missing/dangling dependencies).
- `src/lib/actions/` — Next.js server actions for all mutations (projects, WBS, tasks, dependencies, resources, AI imports). `recalculate.ts` re-runs CPM and writes results back to `tasks` after any change that affects scheduling.
- `src/lib/ai/` — Gemini client and structured-output schemas for AI schedule generation, Excel column mapping, duration estimation, and risk nuance.
- `src/app/projects/[projectId]/` — the project workspace: `schedule` (WBS/task outline), `gantt` (drag-to-reschedule chart), `resources` (assignments + utilization), `import` (Excel/CSV + AI auto-fill), `ai` (AI schedule generation + risk check).
- `supabase/migrations/` — schema history, applied directly to the Supabase project via MCP.

## v1 scope

WBS hierarchy, task scheduling with FS/SS/FF/SF dependencies and lag, automatic critical path calculation, a draggable Gantt chart, Excel/CSV import with AI-assisted column mapping and duration estimation, AI-generated draft schedules from a text description, basic resource assignment with a weekly utilization view, and AI/rule-based risk flagging.

Not yet built (planned for v2+): full EPS/OBS with role-based permissions, resource leveling, baseline/variance tracking, earned value management, multiple calendars, XER/XML interop, multi-project portfolio view, real-time collaboration.
