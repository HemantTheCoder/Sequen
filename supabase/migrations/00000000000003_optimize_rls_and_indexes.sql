-- Wrap auth.uid() in a scalar subselect so RLS policies evaluate it once per
-- query instead of once per row (Supabase performance advisor: auth_rls_initplan).
-- Also adds the missing index on projects.owner_id used by these policies.

create index idx_projects_owner on projects(owner_id);

drop policy "Owners manage their projects" on projects;
create policy "Owners manage their projects" on projects
  for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy "Owners manage their WBS nodes" on wbs_nodes;
create policy "Owners manage their WBS nodes" on wbs_nodes
  for all using (
    exists (select 1 from projects p where p.id = wbs_nodes.project_id and p.owner_id = (select auth.uid()))
  ) with check (
    exists (select 1 from projects p where p.id = wbs_nodes.project_id and p.owner_id = (select auth.uid()))
  );

drop policy "Owners manage their tasks" on tasks;
create policy "Owners manage their tasks" on tasks
  for all using (
    exists (select 1 from projects p where p.id = tasks.project_id and p.owner_id = (select auth.uid()))
  ) with check (
    exists (select 1 from projects p where p.id = tasks.project_id and p.owner_id = (select auth.uid()))
  );

drop policy "Owners manage their dependencies" on dependencies;
create policy "Owners manage their dependencies" on dependencies
  for all using (
    exists (select 1 from projects p where p.id = dependencies.project_id and p.owner_id = (select auth.uid()))
  ) with check (
    exists (select 1 from projects p where p.id = dependencies.project_id and p.owner_id = (select auth.uid()))
  );

drop policy "Owners manage their resources" on resources;
create policy "Owners manage their resources" on resources
  for all using (
    exists (select 1 from projects p where p.id = resources.project_id and p.owner_id = (select auth.uid()))
  ) with check (
    exists (select 1 from projects p where p.id = resources.project_id and p.owner_id = (select auth.uid()))
  );

drop policy "Owners manage their task_resources" on task_resources;
create policy "Owners manage their task_resources" on task_resources
  for all using (
    exists (
      select 1 from tasks t
      join projects p on p.id = t.project_id
      where t.id = task_resources.task_id and p.owner_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from tasks t
      join projects p on p.id = t.project_id
      where t.id = task_resources.task_id and p.owner_id = (select auth.uid())
    )
  );
