-- Editors who can modify a questionnaire without becoming the owner
create table if not exists forms.questionnaire_editor (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references forms.questionnaire(id) on delete cascade,
  editor_id uuid not null references auth.users(id) on delete cascade,
  editor_email text not null,
  added_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (questionnaire_id, editor_id)
);

create index if not exists idx_qe_questionnaire on forms.questionnaire_editor(questionnaire_id);
create index if not exists idx_qe_editor on forms.questionnaire_editor(editor_id);
