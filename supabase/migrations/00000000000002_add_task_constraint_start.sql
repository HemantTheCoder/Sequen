alter table tasks add column constraint_start date;
comment on column tasks.constraint_start is 'Optional "start no earlier than" constraint used by the Gantt drag-to-reschedule interaction; only binds when it is later than dependency-driven early start.';
