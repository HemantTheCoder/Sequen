-- Sequen v1 schema: projects, WBS, tasks, dependencies, resources.
-- CPM results (early/late dates, float, criticality) are cached on `tasks`
-- so the UI can render without recomputing on every read; they're
-- recalculated server-side whenever durations/dependencies change.

create type dependency_type as enum ('FS', 'SS', 'FF', 'SF');
create type task_status as enum ('not_started', 'in_progress', 'complete');

create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  data_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table wbs_nodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  parent_id uuid references wbs_nodes(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  wbs_id uuid references wbs_nodes(id) on delete set null,
  name text not null,
  duration_days numeric not null default 1 check (duration_days >= 0),
  start_date date,
  end_date date,
  percent_complete integer not null default 0 check (percent_complete between 0 and 100),
  status task_status not null default 'not_started',
  is_milestone boolean not null default false,
  sort_order integer not null default 0,
  -- Cached CPM outputs (day offsets from the project's data_date, plus derived dates)
  early_start date,
  early_finish date,
  late_start date,
  late_finish date,
  total_float integer,
  free_float integer,
  is_critical boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table dependencies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  predecessor_id uuid not null references tasks(id) on delete cascade,
  successor_id uuid not null references tasks(id) on delete cascade,
  type dependency_type not null default 'FS',
  lag_days integer not null default 0,
  created_at timestamptz not null default now(),
  constraint no_self_dependency check (predecessor_id <> successor_id),
  constraint unique_dependency unique (predecessor_id, successor_id)
);

create table resources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  role text,
  cost_per_hour numeric,
  created_at timestamptz not null default now()
);

create table task_resources (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  allocation_percent integer not null default 100 check (allocation_percent > 0),
  created_at timestamptz not null default now(),
  constraint unique_task_resource unique (task_id, resource_id)
);

create index idx_wbs_nodes_project on wbs_nodes(project_id);
create index idx_wbs_nodes_parent on wbs_nodes(parent_id);
create index idx_tasks_project on tasks(project_id);
create index idx_tasks_wbs on tasks(wbs_id);
create index idx_dependencies_project on dependencies(project_id);
create index idx_dependencies_predecessor on dependencies(predecessor_id);
create index idx_dependencies_successor on dependencies(successor_id);
create index idx_resources_project on resources(project_id);
create index idx_task_resources_task on task_resources(task_id);
create index idx_task_resources_resource on task_resources(resource_id);

-- updated_at maintenance
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_projects_updated_at before update on projects
  for each row execute function set_updated_at();
create trigger trg_wbs_nodes_updated_at before update on wbs_nodes
  for each row execute function set_updated_at();
create trigger trg_tasks_updated_at before update on tasks
  for each row execute function set_updated_at();

-- Row Level Security: everything is scoped to the owning project's owner_id.
alter table projects enable row level security;
alter table wbs_nodes enable row level security;
alter table tasks enable row level security;
alter table dependencies enable row level security;
alter table resources enable row level security;
alter table task_resources enable row level security;

create policy "Owners manage their projects" on projects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "Owners manage their WBS nodes" on wbs_nodes
  for all using (
    exists (select 1 from projects p where p.id = wbs_nodes.project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from projects p where p.id = wbs_nodes.project_id and p.owner_id = auth.uid())
  );

create policy "Owners manage their tasks" on tasks
  for all using (
    exists (select 1 from projects p where p.id = tasks.project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from projects p where p.id = tasks.project_id and p.owner_id = auth.uid())
  );

create policy "Owners manage their dependencies" on dependencies
  for all using (
    exists (select 1 from projects p where p.id = dependencies.project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from projects p where p.id = dependencies.project_id and p.owner_id = auth.uid())
  );

create policy "Owners manage their resources" on resources
  for all using (
    exists (select 1 from projects p where p.id = resources.project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from projects p where p.id = resources.project_id and p.owner_id = auth.uid())
  );

create policy "Owners manage their task_resources" on task_resources
  for all using (
    exists (
      select 1 from tasks t
      join projects p on p.id = t.project_id
      where t.id = task_resources.task_id and p.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from tasks t
      join projects p on p.id = t.project_id
      where t.id = task_resources.task_id and p.owner_id = auth.uid()
    )
  );
