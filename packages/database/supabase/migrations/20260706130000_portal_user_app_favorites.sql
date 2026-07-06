-- Per-user favorited apps for the portal suite.
-- One row per user; app_ids references iefa.apps(id).
-- Access only via service role (RLS closed, matching the iefa schema convention).

create table if not exists iefa.user_app_favorites (
	user_id    uuid primary key,
	app_ids    uuid[] not null default '{}',
	updated_at timestamptz not null default now()
);

alter table iefa.user_app_favorites enable row level security;
