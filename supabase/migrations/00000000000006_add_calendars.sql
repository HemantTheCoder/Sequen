-- Multi-calendar support: named working-day patterns (with date-specific
-- exceptions) that tasks and resources can opt into, instead of the whole
-- project implicitly running on one Mon-Fri week.

create table calendars (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  -- Array of weekdays that count as working days, 0 (Sun) - 6 (Sat).
  working_days jsonb not null default '[1,2,3,4,5]',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- Only one calendar can be the project's default at a time. A project with
-- no default calendar (including every project that predates this feature)
-- implicitly uses a Mon-Fri week — see DEFAULT_CALENDAR in src/lib/cpm/calendar.ts.
create unique index idx_calendars_one_default_per_project on calendars(project_id) where is_default;
create index idx_calendars_project on calendars(project_id);

create table calendar_exceptions (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references calendars(id) on delete cascade,
  date date not null,
  -- Overrides the weekday pattern for this date: turns an otherwise-working
  -- day into a holiday, or an otherwise-off day into a working day (e.g. a
  -- Sunday catch-up shift).
  is_working boolean not null,
  note text,
  constraint unique_calendar_exception unique (calendar_id, date)
);

create index idx_calendar_exceptions_calendar on calendar_exceptions(calendar_id);

-- null means "inherit the project's default calendar."
alter table tasks add column calendar_id uuid references calendars(id) on delete set null;
alter table resources add column calendar_id uuid references calendars(id) on delete set null;

alter table calendars enable row level security;
alter table calendar_exceptions enable row level security;

create policy "Owners manage their calendars" on calendars
  for all using (
    exists (select 1 from projects p where p.id = calendars.project_id and p.owner_id = (select auth.uid()))
  ) with check (
    exists (select 1 from projects p where p.id = calendars.project_id and p.owner_id = (select auth.uid()))
  );

create policy "Owners manage their calendar_exceptions" on calendar_exceptions
  for all using (
    exists (
      select 1 from calendars c
      join projects p on p.id = c.project_id
      where c.id = calendar_exceptions.calendar_id and p.owner_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from calendars c
      join projects p on p.id = c.project_id
      where c.id = calendar_exceptions.calendar_id and p.owner_id = (select auth.uid())
    )
  );
