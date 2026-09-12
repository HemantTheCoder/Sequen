-- Resource leveling: manual conflict detection (v2.3 part 1) plus schema
-- for the automatic serial-method leveler (part 2).

-- A resource's capacity as a percent of one full-time person — 100 is one
-- person, 300 would represent a 3-person crew that can absorb 300% of
-- simultaneous allocation before it's over capacity.
alter table resources add column max_capacity_percent numeric not null default 100 check (max_capacity_percent > 0);

-- When true, the automatic leveler must never move this task's dates; it can
-- only flag conflicts it's unable to resolve around a pinned task.
alter table tasks add column is_manually_pinned boolean not null default false;

create type leveling_mode as enum ('within_float', 'allow_delay');

-- 'within_float': the leveler refuses to delay a task past its own total
-- float and reports the remainder as an unresolved conflict.
-- 'allow_delay': the leveler may push the project finish date to resolve
-- every conflict it can.
alter table projects add column leveling_mode leveling_mode not null default 'within_float';
