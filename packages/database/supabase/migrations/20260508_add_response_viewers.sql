-- Viewers who can see responses to a questionnaire without being the creator
create table if not exists forms.response_viewer (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references forms.questionnaire(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewer_email text not null,
  added_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (questionnaire_id, viewer_id)
);

create index if not exists idx_rv_questionnaire on forms.response_viewer(questionnaire_id);
create index if not exists idx_rv_viewer on forms.response_viewer(viewer_id);

-- Lookup auth user ID by email (SECURITY DEFINER so it can read auth.users)
create or replace function forms.lookup_user_id_by_email(p_email text)
returns uuid
security definer
language plpgsql
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from auth.users
  where lower(email) = lower(p_email)
  limit 1;
  return v_user_id;
end;
$$;
