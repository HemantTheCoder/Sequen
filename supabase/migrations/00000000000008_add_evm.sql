-- Earned value management: budgeted cost snapshotted per baseline task,
-- manually-entered actual cost per task, and a project status date EVM is
-- measured as of.

-- Hours worked per working day on this calendar — needed to turn a
-- resource's hourly rate and allocation into a daily cost for budgeting.
alter table calendars add column hours_per_day numeric not null default 8 check (hours_per_day > 0);

-- Snapshotted at baseline creation time (duration x sum of assigned
-- resources' allocated daily cost) and never recomputed afterward, so a
-- later rate change doesn't retroactively change what was budgeted (BAC
-- must stay stable once baselined, the same reasoning baseline_tasks'
-- dates and duration already follow).
alter table baseline_tasks add column budgeted_cost numeric not null default 0;

-- Manually entered by the user as costs are incurred — this app does not
-- track time/timesheets, so actual cost is a direct number, not derived.
alter table tasks add column actual_cost numeric default 0;

-- The data date EVM is measured as of; independent of projects.data_date
-- so a user can view EVM as of any past point (e.g. to build a historical
-- S-curve) without disturbing the schedule's own data date.
alter table projects add column status_date date not null default current_date;
