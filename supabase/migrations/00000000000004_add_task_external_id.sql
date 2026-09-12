alter table tasks add column external_id text;
create index idx_tasks_external_id on tasks(project_id, external_id) where external_id is not null;
comment on column tasks.external_id is 'Source activity ID/code from an imported spreadsheet (e.g. P6/MSP Activity ID), used to resolve predecessor references that are given as IDs rather than task names.';
