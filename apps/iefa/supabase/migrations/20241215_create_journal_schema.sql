-- ============================================
-- SCHEMA: journal
-- Scientific Journal Management System
-- Migration Date: 2024-12-15
-- ============================================
-- NOTE: This migration has already been executed manually in Supabase Dashboard
-- This file is kept as reference for recreation if needed

create schema if not exists journal;

-- ============================================
-- TABLE: user_profiles
-- Extended user information and roles
-- ============================================
create table journal.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('author', 'editor', 'reviewer')) default 'author',
  full_name text not null,
  affiliation text,
  orcid text,
  bio text,
  expertise text[], -- areas of expertise for reviewer matching
  email_notifications boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for role-based queries
create index idx_user_profiles_role on journal.user_profiles(role);
create index idx_user_profiles_expertise on journal.user_profiles using gin(expertise);

-- ============================================
-- TABLE: articles
-- Main article records
-- ============================================
create table journal.articles (
  id uuid primary key default gen_random_uuid(),
  
  -- Submission info
  submitter_id uuid not null references auth.users(id),
  submission_number text unique not null, -- e.g., "2024-001"
  
  -- Bilingual metadata
  title_pt text not null,
  title_en text not null,
  abstract_pt text not null,
  abstract_en text not null,
  keywords_pt text[] not null,
  keywords_en text[] not null,
  
  -- Classification
  article_type text not null check (article_type in ('research', 'review', 'short_communication', 'editorial')),
  subject_area text not null,
  
  -- Declarations
  conflict_of_interest text not null,
  funding_info text,
  data_availability text,
  ethics_approval text,
  
  -- Status workflow
  status text not null check (status in (
    'draft',
    'submitted',
    'under_review',
    'revision_requested',
    'revised_submitted',
    'accepted',
    'rejected',
    'published'
  )) default 'draft',
  
  -- Publication info
  doi text unique,
  volume int,
  issue int,
  page_start int,
  page_end int,
  published_at timestamptz,
  
  -- Metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  
  -- Soft delete
  deleted_at timestamptz
);

-- Indexes
create index idx_articles_submitter on journal.articles(submitter_id);
create index idx_articles_status on journal.articles(status);
create index idx_articles_published on journal.articles(published_at desc) where status = 'published';
create index idx_articles_doi on journal.articles(doi) where doi is not null;

-- Auto-generate submission number
create or replace function journal.generate_submission_number()
returns trigger as $$
declare
  year_prefix text;
  next_number int;
begin
  year_prefix := to_char(now(), 'YYYY');
  
  select coalesce(max(substring(submission_number from '\d+$')::int), 0) + 1
  into next_number
  from journal.articles
  where submission_number like year_prefix || '-%';
  
  new.submission_number := year_prefix || '-' || lpad(next_number::text, 3, '0');
  return new;
end;
$$ language plpgsql;

create trigger set_submission_number
  before insert on journal.articles
  for each row
  when (new.submission_number is null)
  execute function journal.generate_submission_number();

-- ============================================
-- TABLE: article_authors
-- Co-authors for each article
-- ============================================
create table journal.article_authors (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references journal.articles(id) on delete cascade,
  
  -- Author info
  full_name text not null,
  email text,
  affiliation text,
  orcid text,
  
  -- Flags
  is_corresponding boolean default false,
  author_order int not null, -- 1, 2, 3...
  
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_article_authors_article on journal.article_authors(article_id);
create unique index idx_article_authors_order on journal.article_authors(article_id, author_order);

-- ============================================
-- TABLE: article_versions
-- Version history for manuscripts
-- ============================================
create table journal.article_versions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references journal.articles(id) on delete cascade,
  
  -- Version info
  version_number int not null, -- 1, 2, 3...
  version_label text, -- "Initial Submission", "Revision 1", "Final"
  
  -- File paths (Supabase Storage)
  pdf_path text not null,
  source_path text, -- .typ file
  supplementary_paths text[], -- array of file paths
  
  -- Metadata
  uploaded_by uuid not null references auth.users(id),
  notes text, -- editor notes about this version
  
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_article_versions_article on journal.article_versions(article_id);
create unique index idx_article_versions_number on journal.article_versions(article_id, version_number);

-- Auto-increment version number
create or replace function journal.set_version_number()
returns trigger as $$
begin
  if new.version_number is null then
    select coalesce(max(version_number), 0) + 1
    into new.version_number
    from journal.article_versions
    where article_id = new.article_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger auto_version_number
  before insert on journal.article_versions
  for each row
  execute function journal.set_version_number();

-- ============================================
-- TABLE: review_assignments
-- Reviewer assignments to articles
-- ============================================
create table journal.review_assignments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references journal.articles(id) on delete cascade,
  reviewer_id uuid references auth.users(id) on delete set null,
  
  -- Invitation
  invited_by uuid not null references auth.users(id),
  invitation_token text unique not null default gen_random_uuid()::text,
  invitation_email text not null,
  
  -- Status
  status text not null check (status in (
    'invited',
    'accepted',
    'declined',
    'completed',
    'expired'
  )) default 'invited',
  
  -- Dates
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  due_date timestamptz not null,
  completed_at timestamptz,
  
  -- Decline info
  decline_reason text,
  suggested_reviewers text,
  
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_review_assignments_article on journal.review_assignments(article_id);
create index idx_review_assignments_reviewer on journal.review_assignments(reviewer_id);
create index idx_review_assignments_token on journal.review_assignments(invitation_token);
create index idx_review_assignments_status on journal.review_assignments(status);

-- ============================================
-- TABLE: reviews
-- Actual review content and scores
-- ============================================
create table journal.reviews (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references journal.review_assignments(id) on delete cascade,
  
  -- Quantitative scores (1-5)
  score_originality int check (score_originality between 1 and 5),
  score_methodology int check (score_methodology between 1 and 5),
  score_clarity int check (score_clarity between 1 and 5),
  score_references int check (score_references between 1 and 5),
  score_overall int check (score_overall between 1 and 5),
  
  -- Qualitative feedback
  strengths text,
  weaknesses text,
  comments_for_authors text not null,
  comments_for_editors text,
  
  -- Recommendation
  recommendation text not null check (recommendation in (
    'accept',
    'minor_revision',
    'major_revision',
    'reject'
  )),
  
  -- Flags
  has_methodology_issues boolean default false,
  has_statistical_errors boolean default false,
  has_ethical_concerns boolean default false,
  suspected_plagiarism boolean default false,
  
  -- Metadata
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Draft support
  is_draft boolean default true
);

-- Indexes
create index idx_reviews_assignment on journal.reviews(assignment_id);

-- ============================================
-- TABLE: article_events
-- Audit log for all article actions
-- ============================================
create table journal.article_events (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references journal.articles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  
  -- Event info
  event_type text not null, -- 'submitted', 'status_changed', 'review_completed', 'published', etc.
  event_data jsonb, -- flexible metadata
  
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_article_events_article on journal.article_events(article_id);
create index idx_article_events_type on journal.article_events(event_type);
create index idx_article_events_created on journal.article_events(created_at desc);

-- Auto-log status changes
create or replace function journal.log_article_status_change()
returns trigger as $$
begin
  if old.status is distinct from new.status then
    insert into journal.article_events (article_id, event_type, event_data)
    values (
      new.id,
      'status_changed',
      jsonb_build_object(
        'old_status', old.status,
        'new_status', new.status
      )
    );
  end if;
  return new;
end;
$$ language plpgsql;

create trigger log_status_change
  after update on journal.articles
  for each row
  execute function journal.log_article_status_change();

-- ============================================
-- TABLE: notifications
-- In-app notifications for users
-- ============================================
create table journal.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  article_id uuid references journal.articles(id) on delete cascade,
  
  -- Notification content
  type text not null, -- 'review_invite', 'decision_made', 'new_submission', etc.
  title text not null,
  message text not null,
  action_url text,
  
  -- Status
  read boolean default false,
  read_at timestamptz,
  
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_notifications_user on journal.notifications(user_id);
create index idx_notifications_unread on journal.notifications(user_id, read) where read = false;

-- ============================================
-- TABLE: email_templates
-- Configurable email templates
-- ============================================
create table journal.email_templates (
  id uuid primary key default gen_random_uuid(),
  
  -- Template identification
  name text unique not null, -- 'review_invite', 'acceptance_notification', etc.
  description text,
  
  -- Bilingual content
  subject_pt text not null,
  subject_en text not null,
  body_pt text not null,
  body_en text not null,
  
  -- Template variables
  variables text[], -- ['author_name', 'article_title', 'submission_number']
  
  -- Metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- TABLE: journal_settings
-- Global journal configuration
-- ============================================
create table journal.journal_settings (
  id uuid primary key default gen_random_uuid(),
  
  -- Journal info
  journal_name_pt text not null,
  journal_name_en text not null,
  issn_print text,
  issn_online text,
  publisher text not null,
  doi_prefix text, -- e.g., "10.12345"
  
  -- Crossref credentials (encrypted)
  crossref_username text,
  crossref_password text,
  crossref_test_mode boolean default true,
  
  -- Review settings
  default_review_deadline_days int default 21,
  min_reviewers_required int default 2,
  enable_double_blind boolean default true,
  
  -- Email settings
  from_email text not null,
  from_name text not null,
  
  -- Metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Insert default settings
insert into journal.journal_settings (
  journal_name_pt,
  journal_name_en,
  publisher,
  from_email,
  from_name
) values (
  'Revista Científica IEFA',
  'IEFA Scientific Journal',
  'IEFA',
  'journal@iefa.edu.br',
  'IEFA Journal'
);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
alter table journal.user_profiles enable row level security;
alter table journal.articles enable row level security;
alter table journal.article_authors enable row level security;
alter table journal.article_versions enable row level security;
alter table journal.review_assignments enable row level security;
alter table journal.reviews enable row level security;
alter table journal.article_events enable row level security;
alter table journal.notifications enable row level security;
alter table journal.email_templates enable row level security;
alter table journal.journal_settings enable row level security;

-- ============================================
-- RLS: user_profiles
-- ============================================

-- Users can view their own profile
create policy "Users can view own profile"
  on journal.user_profiles for select
  using (auth.uid() = id);

-- Users can update their own profile
create policy "Users can update own profile"
  on journal.user_profiles for update
  using (auth.uid() = id);

-- Users can insert their own profile
create policy "Users can insert own profile"
  on journal.user_profiles for insert
  with check (auth.uid() = id);

-- Editors can view all profiles
create policy "Editors can view all profiles"
  on journal.user_profiles for select
  using (
    exists (
      select 1 from journal.user_profiles
      where id = auth.uid() and role = 'editor'
    )
  );

-- ============================================
-- RLS: articles
-- ============================================

-- Public can view published articles
create policy "Public can view published articles"
  on journal.articles for select
  using (status = 'published' and deleted_at is null);

-- Authors can view their own articles
create policy "Authors can view own articles"
  on journal.articles for select
  using (auth.uid() = submitter_id);

-- Reviewers can view assigned articles
create policy "Reviewers can view assigned articles"
  on journal.articles for select
  using (
    exists (
      select 1 from journal.review_assignments
      where article_id = articles.id
        and reviewer_id = auth.uid()
        and status in ('accepted', 'completed')
    )
  );

-- Editors can view all articles
create policy "Editors can view all articles"
  on journal.articles for select
  using (
    exists (
      select 1 from journal.user_profiles
      where id = auth.uid() and role = 'editor'
    )
  );

-- Authors can insert their own articles
create policy "Authors can insert articles"
  on journal.articles for insert
  with check (auth.uid() = submitter_id);

-- Authors can update their own draft/revision articles
create policy "Authors can update own articles"
  on journal.articles for update
  using (
    auth.uid() = submitter_id
    and status in ('draft', 'revision_requested')
  );

-- Editors can update any article
create policy "Editors can update articles"
  on journal.articles for update
  using (
    exists (
      select 1 from journal.user_profiles
      where id = auth.uid() and role = 'editor'
    )
  );

-- ============================================
-- RLS: article_authors
-- ============================================

-- Inherit visibility from articles
create policy "Article authors visible with article"
  on journal.article_authors for select
  using (
    exists (
      select 1 from journal.articles
      where id = article_authors.article_id
    )
  );

-- Authors can manage co-authors on their articles
create policy "Authors can manage co-authors"
  on journal.article_authors for all
  using (
    exists (
      select 1 from journal.articles
      where id = article_authors.article_id
        and submitter_id = auth.uid()
        and status in ('draft', 'revision_requested')
    )
  );

-- ============================================
-- RLS: article_versions
-- ============================================

-- Inherit visibility from articles
create policy "Versions visible with article"
  on journal.article_versions for select
  using (
    exists (
      select 1 from journal.articles
      where id = article_versions.article_id
    )
  );

-- Authors can upload versions to their articles
create policy "Authors can upload versions"
  on journal.article_versions for insert
  with check (
    exists (
      select 1 from journal.articles
      where id = article_versions.article_id
        and submitter_id = auth.uid()
    )
  );

-- Editors can upload versions to any article
create policy "Editors can upload versions"
  on journal.article_versions for insert
  with check (
    exists (
      select 1 from journal.user_profiles
      where id = auth.uid() and role = 'editor'
    )
  );

-- ============================================
-- RLS: review_assignments
-- ============================================

-- Reviewers can view their own assignments
create policy "Reviewers can view own assignments"
  on journal.review_assignments for select
  using (reviewer_id = auth.uid() or invitation_email = (select email from auth.users where id = auth.uid()));

-- Editors can view all assignments
create policy "Editors can view all assignments"
  on journal.review_assignments for select
  using (
    exists (
      select 1 from journal.user_profiles
      where id = auth.uid() and role = 'editor'
    )
  );

-- Editors can create assignments
create policy "Editors can create assignments"
  on journal.review_assignments for insert
  with check (
    exists (
      select 1 from journal.user_profiles
      where id = auth.uid() and role = 'editor'
    )
  );

-- Reviewers can update their own assignments (accept/decline)
create policy "Reviewers can update own assignments"
  on journal.review_assignments for update
  using (reviewer_id = auth.uid() or invitation_email = (select email from auth.users where id = auth.uid()));

-- ============================================
-- RLS: reviews
-- ============================================

-- Reviewers can view and edit their own reviews
create policy "Reviewers can manage own reviews"
  on journal.reviews for all
  using (
    exists (
      select 1 from journal.review_assignments
      where id = reviews.assignment_id
        and reviewer_id = auth.uid()
    )
  );

-- Editors can view all reviews
create policy "Editors can view all reviews"
  on journal.reviews for select
  using (
    exists (
      select 1 from journal.user_profiles
      where id = auth.uid() and role = 'editor'
    )
  );

-- ============================================
-- RLS: article_events
-- ============================================

-- Events visible with article
create policy "Events visible with article"
  on journal.article_events for select
  using (
    exists (
      select 1 from journal.articles
      where id = article_events.article_id
    )
  );

-- ============================================
-- RLS: notifications
-- ============================================

-- Users can view their own notifications
create policy "Users can view own notifications"
  on journal.notifications for select
  using (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
create policy "Users can update own notifications"
  on journal.notifications for update
  using (user_id = auth.uid());

-- System can insert notifications
create policy "System can insert notifications"
  on journal.notifications for insert
  with check (true);

-- ============================================
-- RLS: email_templates
-- ============================================

-- Editors can view and manage templates
create policy "Editors can manage templates"
  on journal.email_templates for all
  using (
    exists (
      select 1 from journal.user_profiles
      where id = auth.uid() and role = 'editor'
    )
  );

-- ============================================
-- RLS: journal_settings
-- ============================================

-- Editors can view and manage settings
create policy "Editors can manage settings"
  on journal.journal_settings for all
  using (
    exists (
      select 1 from journal.user_profiles
      where id = auth.uid() and role = 'editor'
    )
  );

-- Public can view settings (read-only)
create policy "Public can view settings"
  on journal.journal_settings for select
  using (true);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get article with full details
create or replace function journal.get_article_details(article_uuid uuid)
returns jsonb as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'article', row_to_json(a.*),
    'authors', (
      select jsonb_agg(row_to_json(aa.*) order by aa.author_order)
      from journal.article_authors aa
      where aa.article_id = a.id
    ),
    'versions', (
      select jsonb_agg(row_to_json(av.*) order by av.version_number desc)
      from journal.article_versions av
      where av.article_id = a.id
    ),
    'reviews', (
      select jsonb_agg(
        jsonb_build_object(
          'assignment', row_to_json(ra.*),
          'review', row_to_json(r.*)
        )
      )
      from journal.review_assignments ra
      left join journal.reviews r on r.assignment_id = ra.id
      where ra.article_id = a.id
    )
  )
  into result
  from journal.articles a
  where a.id = article_uuid;
  
  return result;
end;
$$ language plpgsql security definer;

-- Function to check if user is editor
create or replace function journal.is_editor(user_uuid uuid default auth.uid())
returns boolean as $$
begin
  return exists (
    select 1 from journal.user_profiles
    where id = user_uuid and role = 'editor'
  );
end;
$$ language plpgsql security definer;

-- ============================================
-- INITIAL DATA: Email Templates
-- ============================================

insert into journal.email_templates (name, description, subject_pt, subject_en, body_pt, body_en, variables) values
(
  'new_submission',
  'Notification to editors when a new article is submitted',
  'Nova Submissão: {{article_title}}',
  'New Submission: {{article_title}}',
  'Uma nova submissão foi recebida.\n\nNúmero: {{submission_number}}\nTítulo: {{article_title}}\nAutor: {{author_name}}\n\nAcesse o painel editorial para revisar.',
  'A new submission has been received.\n\nNumber: {{submission_number}}\nTitle: {{article_title}}\nAuthor: {{author_name}}\n\nAccess the editorial dashboard to review.',
  array['submission_number', 'article_title', 'author_name']
),
(
  'review_invitation',
  'Invitation sent to potential reviewers',
  'Convite para Revisar: {{article_title}}',
  'Review Invitation: {{article_title}}',
  'Prezado(a) {{reviewer_name}},\n\nGostaríamos de convidá-lo(a) para revisar o seguinte artigo:\n\nTítulo: {{article_title}}\nResumo: {{article_abstract}}\n\nPrazo: {{due_date}}\n\nPara aceitar ou recusar, acesse: {{invitation_link}}',
  'Dear {{reviewer_name}},\n\nWe would like to invite you to review the following article:\n\nTitle: {{article_title}}\nAbstract: {{article_abstract}}\n\nDeadline: {{due_date}}\n\nTo accept or decline, visit: {{invitation_link}}',
  array['reviewer_name', 'article_title', 'article_abstract', 'due_date', 'invitation_link']
),
(
  'decision_accept',
  'Notification to authors when article is accepted',
  'Artigo Aceito: {{article_title}}',
  'Article Accepted: {{article_title}}',
  'Prezado(a) {{author_name}},\n\nTemos o prazer de informar que seu artigo "{{article_title}}" foi aceito para publicação.\n\nNúmero da submissão: {{submission_number}}\n\nEm breve entraremos em contato com os próximos passos.',
  'Dear {{author_name}},\n\nWe are pleased to inform you that your article "{{article_title}}" has been accepted for publication.\n\nSubmission number: {{submission_number}}\n\nWe will contact you soon with next steps.',
  array['author_name', 'article_title', 'submission_number']
),
(
  'decision_reject',
  'Notification to authors when article is rejected',
  'Decisão sobre: {{article_title}}',
  'Decision on: {{article_title}}',
  'Prezado(a) {{author_name}},\n\nLamentamos informar que seu artigo "{{article_title}}" não foi aceito para publicação.\n\nNúmero da submissão: {{submission_number}}\n\nAgradecemos seu interesse em nossa revista.',
  'Dear {{author_name}},\n\nWe regret to inform you that your article "{{article_title}}" has not been accepted for publication.\n\nSubmission number: {{submission_number}}\n\nThank you for your interest in our journal.',
  array['author_name', 'article_title', 'submission_number']
),
(
  'revision_requested',
  'Notification to authors when revisions are requested',
  'Revisões Solicitadas: {{article_title}}',
  'Revisions Requested: {{article_title}}',
  'Prezado(a) {{author_name}},\n\nSeu artigo "{{article_title}}" foi revisado e requer modificações.\n\nTipo de revisão: {{revision_type}}\n\nPor favor, acesse o sistema para ver os comentários dos revisores e enviar a versão revisada.',
  'Dear {{author_name}},\n\nYour article "{{article_title}}" has been reviewed and requires modifications.\n\nRevision type: {{revision_type}}\n\nPlease access the system to view reviewer comments and submit the revised version.',
  array['author_name', 'article_title', 'revision_type']
);

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- View: Published articles with full metadata
create or replace view journal.published_articles as
select
  a.id,
  a.submission_number,
  a.title_pt,
  a.title_en,
  a.abstract_pt,
  a.abstract_en,
  a.keywords_pt,
  a.keywords_en,
  a.article_type,
  a.subject_area,
  a.doi,
  a.volume,
  a.issue,
  a.published_at,
  (
    select jsonb_agg(
      jsonb_build_object(
        'name', aa.full_name,
        'affiliation', aa.affiliation,
        'orcid', aa.orcid,
        'is_corresponding', aa.is_corresponding
      ) order by aa.author_order
    )
    from journal.article_authors aa
    where aa.article_id = a.id
  ) as authors,
  (
    select av.pdf_path
    from journal.article_versions av
    where av.article_id = a.id
    order by av.version_number desc
    limit 1
  ) as latest_pdf
from journal.articles a
where a.status = 'published'
  and a.deleted_at is null;

-- View: Editorial dashboard summary
create or replace view journal.editorial_dashboard as
select
  a.id,
  a.submission_number,
  a.title_en,
  a.status,
  a.article_type,
  a.subject_area,
  a.submitted_at,
  extract(day from now() - a.submitted_at) as days_since_submission,
  up.full_name as submitter_name,
  (
    select count(*)
    from journal.review_assignments ra
    where ra.article_id = a.id
      and ra.status = 'completed'
  ) as completed_reviews,
  (
    select count(*)
    from journal.review_assignments ra
    where ra.article_id = a.id
      and ra.status in ('invited', 'accepted')
  ) as pending_reviews
from journal.articles a
join journal.user_profiles up on up.id = a.submitter_id
where a.status != 'published'
  and a.deleted_at is null
order by a.submitted_at desc;

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Full-text search on articles (optional, for future search feature)
create index idx_articles_title_search on journal.articles using gin(
  to_tsvector('english', coalesce(title_en, '') || ' ' || coalesce(abstract_en, ''))
);

create index idx_articles_title_search_pt on journal.articles using gin(
  to_tsvector('portuguese', coalesce(title_pt, '') || ' ' || coalesce(abstract_pt, ''))
);

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================

create or replace function journal.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on journal.user_profiles
  for each row execute function journal.update_updated_at();

create trigger set_updated_at before update on journal.articles
  for each row execute function journal.update_updated_at();

create trigger set_updated_at before update on journal.reviews
  for each row execute function journal.update_updated_at();

create trigger set_updated_at before update on journal.email_templates
  for each row execute function journal.update_updated_at();

create trigger set_updated_at before update on journal.journal_settings
  for each row execute function journal.update_updated_at();

-- ============================================
-- GRANTS (if using service role)
-- ============================================

-- Grant usage on schema
grant usage on schema journal to authenticated, anon;

-- Grant select on published articles view to public
grant select on journal.published_articles to anon, authenticated;

-- Grant select on editorial dashboard to editors only (handled by RLS)
grant select on journal.editorial_dashboard to authenticated;
