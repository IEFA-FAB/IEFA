-- forms schema: questionários internos IEFA
create schema if not exists forms;

-- enums
create type forms.questionnaire_status as enum ('draft', 'sent');
create type forms.questionnaire_response_status as enum ('draft', 'sent');
create type forms.question_type as enum (
  'text', 'textarea', 'single_choice', 'multiple_choice',
  'number', 'date', 'scale', 'boolean'
);

-- questionnaire
create table forms.questionnaire (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status forms.questionnaire_status not null default 'draft',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- section
create table forms.section (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references forms.questionnaire(id) on delete cascade,
  title text not null,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- question
create table forms.question (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references forms.section(id) on delete cascade,
  text text not null,
  description text,
  type forms.question_type not null default 'text',
  options jsonb,
  required boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- questionnaire_response (allows multiple submitted responses, blocks duplicate drafts via partial index)
create table forms.questionnaire_response (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references forms.questionnaire(id) on delete cascade,
  respondent_id uuid not null references auth.users(id),
  status forms.questionnaire_response_status not null default 'draft',
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);

-- response (individual answer per question)
create table forms.response (
  id uuid primary key default gen_random_uuid(),
  questionnaire_response_id uuid not null references forms.questionnaire_response(id) on delete cascade,
  question_id uuid not null references forms.question(id) on delete cascade,
  value jsonb,
  observation text,
  updated_at timestamptz not null default now(),
  unique (questionnaire_response_id, question_id)
);

-- indexes
create index idx_section_order on forms.section(questionnaire_id, sort_order);
create index idx_question_order on forms.question(section_id, sort_order);
create index idx_qr_respondent on forms.questionnaire_response(questionnaire_id, respondent_id, status);
create unique index idx_qr_single_draft on forms.questionnaire_response(questionnaire_id, respondent_id) where status = 'draft';
create index idx_response_session on forms.response(questionnaire_response_id);

-- updated_at triggers
create or replace function forms.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_questionnaire_updated_at
  before update on forms.questionnaire
  for each row execute function forms.set_updated_at();

create trigger trg_response_updated_at
  before update on forms.response
  for each row execute function forms.set_updated_at();
