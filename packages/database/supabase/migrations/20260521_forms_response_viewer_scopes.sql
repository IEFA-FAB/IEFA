do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'forms' and t.typname = 'response_scope_mode'
  ) then
    create type forms.response_scope_mode as enum ('global', 'scoped');
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'forms' and t.typname = 'response_scope_effect'
  ) then
    create type forms.response_scope_effect as enum ('allow', 'deny');
  end if;
end $$;

alter table forms.questionnaire
  add column if not exists response_metadata_config jsonb not null default '{}'::jsonb;

alter table forms.response_viewer
  add column if not exists scope_mode forms.response_scope_mode not null default 'global';

create table if not exists forms.response_viewer_scope_binding (
  id uuid primary key default gen_random_uuid(),
  response_viewer_id uuid not null references forms.response_viewer(id) on delete cascade,
  attribute_key text not null,
  effect forms.response_scope_effect not null,
  value text not null,
  created_at timestamptz not null default now(),
  unique (response_viewer_id, attribute_key, effect, value),
  constraint response_viewer_scope_binding_attribute_key_check check (attribute_key in ('om'))
);

create index if not exists idx_qr_questionnaire_status_om on forms.questionnaire_response(questionnaire_id, status, om);
create index if not exists idx_rvsb_viewer_attr_effect on forms.response_viewer_scope_binding(response_viewer_id, attribute_key, effect);

update forms.questionnaire
set response_metadata_config = jsonb_set(coalesce(response_metadata_config, '{}'::jsonb), '{om,scopeable}', 'true'::jsonb, true)
where tags @> array['5s']
  and coalesce((response_metadata_config -> 'om' ->> 'scopeable')::boolean, false) = false;

update forms.questionnaire_response
set om = upper(regexp_replace(trim(om), '\s+', ' ', 'g'))
where om is not null;
