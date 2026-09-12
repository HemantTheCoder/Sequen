-- Baseline snapshots for variance tracking. A baseline is a point-in-time
-- copy of every task's schedule (dates, duration, and dependency structure),
-- so variance can be computed even after tasks are renamed, rescheduled, or
-- deleted.

create table baselines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  is_active boolean not null default false
);

-- Only one baseline can be active per project at a time.
create unique index idx_baselines_one_active_per_project on baselines(project_id) where is_active;
create index idx_baselines_project on baselines(project_id);

create table baseline_tasks (
  id uuid primary key default gen_random_uuid(),
  baseline_id uuid not null references baselines(id) on delete cascade,
  -- Snapshot of tasks.id at baseline time. Deliberately NOT a foreign key:
  -- the live task may be deleted later, and a dangling reference here is
  -- exactly how "removed scope" is detected during variance comparison.
  task_id uuid not null,
  -- Snapshot of the task's wbs_id at baseline time, same reasoning.
  wbs_id uuid,
  name text not null,
  start_date date,
  end_date date,
  duration_days numeric not null default 0,
  -- Snapshot of this task's predecessor links at baseline time:
  -- [{ predecessor_id, type, lag_days }, ...]
  predecessor_snapshot jsonb not null default '[]',
  created_at timestamptz not null default now(),
  constraint unique_baseline_task unique (baseline_id, task_id)
);

create index idx_baseline_tasks_baseline on baseline_tasks(baseline_id);
create index idx_baseline_tasks_task on baseline_tasks(task_id);

-- Project-level threshold (percent of task duration) beyond which a late
-- variance is shown as off-track rather than merely at-risk.
alter table projects add column variance_threshold_percent numeric not null default 20;

alter table baselines enable row level security;
alter table baseline_tasks enable row level security;

create policy "Owners manage their baselines" on baselines
  for all using (
    exists (select 1 from projects p where p.id = baselines.project_id and p.owner_id = (select auth.uid()))
  ) with check (
    exists (select 1 from projects p where p.id = baselines.project_id and p.owner_id = (select auth.uid()))
  );

create policy "Owners manage their baseline_tasks" on baseline_tasks
  for all using (
    exists (
      select 1 from baselines b
      join projects p on p.id = b.project_id
      where b.id = baseline_tasks.baseline_id and p.owner_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from baselines b
      join projects p on p.id = b.project_id
      where b.id = baseline_tasks.baseline_id and p.owner_id = (select auth.uid())
    )
  );
