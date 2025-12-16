# PRD: Scientific Journal Management System (Custom Journal System)

**Version:** 1.1 (Consolidated)\
**Status:** Ready for Implementation\
**Stack:** TanStack Start, Supabase (Auth, DB, Storage, Edge Functions), Typst\
**Database Schema:** `journal`

---

## 1\. Executive Summary

Development of a complete scientific article submission, peer review, and publication module integrated into an existing website. The system prioritizes performance, minimalist aesthetics (arXiv style), and native support for modern workflows (Typst). The system is bilingual (PT/EN) and manages DOIs through Crossref integration.

### Key Features

* Article submission with bilingual metadata

* Double-blind peer review workflow

* Editorial dashboard with Kanban view

* Automatic DOI registration (Crossref)

* Public article pages with PDF viewer

* Transactional email notifications

* Role-based access control (RLS)

* Article versioning system

---

## 2\. User Personas and Roles

All roles are managed through Supabase Auth with a custom `user_profiles` table in the `journal` schema.

### 1\. **Author**

* Submits articles with bilingual metadata

* Uploads PDF and Typst source files

* Tracks submission status

* Responds to revision requests

* Manages co-authors

### 2\. **Editor (Admin)**

* Reviews all submissions

* Performs desk rejection

* Invites and assigns reviewers

* Makes final decisions (accept/reject)

* Publishes articles and mints DOIs

* Manages journal settings

### 3\. **Reviewer**

* Receives review invitations via email

* Accepts/declines review requests

* Accesses anonymized manuscripts

* Submits structured reviews with scores

* Communicates with editors (optional)

### 4\. **Reader (Public)**

* Browses published articles

* Downloads PDFs

* Exports citations (BibTeX)

* No login required

---

## 3\. Functional Requirements

### 3.1. Submission Module (Author)

#### Bilingual Metadata Form

* **Title** (PT + EN) - Required

* **Abstract** (PT + EN) - Required, max 500 words

* **Keywords** (PT + EN) - Required, 3-6 keywords

* **Article Type** - Research Article, Review, Short Communication

* **Subject Area** - Dropdown with predefined areas

#### File Upload

* **PDF for Review** - Max 10MB, required

* **Typst Source** (.typ + assets) - Optional for initial submission, required for publication

* **Supplementary Materials** - Optional, max 50MB total

* Storage: Supabase Storage bucket `journal-submissions` (private)

#### Co-author Management

* Add unlimited co-authors

* Fields: Full Name, Email, Affiliation, ORCID, Corresponding Author flag

* Drag-and-drop to reorder author list

#### Declarations

* **Conflict of Interest** - Text field, required

* **Funding Information** - Text field, optional

* **Data Availability Statement** - Text field, optional

* **Ethics Approval** - Checkbox + reference number if applicable

#### Submission Confirmation

* Email to submitting author with submission ID

* Email to all co-authors notifying them of submission

* Email to editors with new submission alert

---

### 3.2. Editorial Management Module (Editor)

#### Dashboard Views

1. **Kanban Board**

* Columns: Submitted → Under Review → Revision Requested → Accepted → Published

* Drag-and-drop to change status

* Color-coded by days since last action

1. **List View**

* Sortable table with filters

* Columns: ID, Title, Authors, Status, Submitted Date, Days Pending

* Bulk actions: Assign reviewer, Change status

1. **Metrics Panel**

* Total submissions (current year)

* Average time to first decision

* Acceptance rate

* Articles under review

* Pending reviews

#### Article Detail Page

* Full metadata display (bilingual)

* Version history with diff viewer

* Download all files (PDF, source, supplementary)

* Timeline of all events (submitted, reviewed, revised, etc.)

* Action buttons: Desk Reject, Invite Reviewer, Request Revision, Accept, Reject, Publish

#### Reviewer Management

* **Search Reviewers**: By name, expertise, past reviews

* **Invite New Reviewer**: Enter email, auto-create account

* **Set Deadline**: Default 21 days, customizable

* **Send Reminder**: Manual or automatic (7 days before deadline)

* **View Review History**: See all reviews by a reviewer

#### Decision Workflow

1. **Desk Reject**: Immediate rejection without review

2. **Send for Review**: Assign 2-3 reviewers

3. **Request Revision**:

* Minor Revision (no new review needed)

* Major Revision (re-review required)

1. **Accept**: Move to production queue

2. **Reject**: Final rejection after review

---

### 3.3. Peer Review Module (Reviewer)

#### Invitation Flow

1. Reviewer receives email with unique token link

2. Link opens review invitation page (no login required initially)

3. Reviewer can:

* **Accept**: Creates account if new, assigns review

* **Decline**: Optional reason, suggests alternative reviewers

* **Request Extension**: Adds 7-14 days to deadline

#### Review Access (RLS Protected)

* Reviewer can only access articles they accepted to review

* Download anonymized PDF (if double-blind)

* View article metadata (without author names if double-blind)

* Access supplementary materials

#### Review Form

**Section 1: Quantitative Scores (1-5 scale)**

* Originality and Significance

* Methodological Rigor

* Clarity of Presentation

* Quality of References

* Overall Quality

**Section 2: Qualitative Feedback**

* **Strengths**: What are the main contributions?

* **Weaknesses**: What are the major issues?

* **Comments for Authors**: Detailed feedback (public)

* **Confidential Comments for Editors**: Private notes

**Section 3: Recommendation**

* ○ Accept as is

* ○ Minor Revision

* ○ Major Revision

* ○ Reject

**Section 4: Specific Issues (Optional)**

* Checklist: Methodology issues, Statistical errors, Ethical concerns, Plagiarism suspected

#### Review Submission

* Save draft (auto-save every 2 minutes)

* Submit final review

* Email confirmation to reviewer

* Email notification to editor

---

### 3.4. Publication and DOI Module

#### Pre-publication Checklist

* \[ \] Final PDF uploaded

* \[ \] Typst source compiled successfully

* \[ \] All author ORCIDs verified

* \[ \] Metadata complete (PT + EN)

* \[ \] Volume and issue assigned

* \[ \] Copyright agreement signed

#### Publication Process

1. Editor clicks "Publish" button

2. System generates:

* Public article page (slug: `/journal/articles/{year}/{slug}`)

* HTML version from Typst (if possible)

* Thumbnail/preview image

1. Article appears in public journal index

2. RSS feed updated

#### DOI Registration (Crossref)

**Automatic Flow:**

1. Editor clicks "Mint DOI" button

2. Edge Function `mint-doi` is called

3. System generates Crossref XML with:

* Journal metadata (ISSN, publisher)

* Article metadata (title, abstract, keywords)

* All authors with ORCIDs

* Publication date

* PDF URL

1. XML sent to Crossref API

2. DOI returned and saved to database

3. DOI displayed on article page

4. Email sent to authors with DOI

**Manual Override:**

* Editor can manually enter DOI if registered externally

---

## 4\. Database Architecture (Supabase Schema: `journal`)

### Complete SQL Schema

```sql
-- ============================================
-- SCHEMA: journal
-- Scientific Journal Management System
-- ============================================

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
  'Revista Científica',
  'Scientific Journal',
  'Your Institution',
  'journal@yourdomain.com',
  'Scientific Journal'
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
```

---

## 5\. User Flows (Detailed)

### Flow 1: Article Submission (Author)

**Prerequisites:** User is logged in with `author` role

1. **Navigate to Submission**

* Click "Submit Article" button in navigation

* Route: `/journal/submit`

1. **Fill Submission Form**

* **Step 1: Article Type & Subject**

  * Select article type (dropdown)

  * Select subject area (dropdown)

* **Step 2: Bilingual Metadata**

  * Title (PT) - text input, required

  * Title (EN) - text input, required

  * Abstract (PT) - textarea, max 500 words, required

  * Abstract (EN) - textarea, max 500 words, required

  * Keywords (PT) - tag input, 3-6 keywords, required

  * Keywords (EN) - tag input, 3-6 keywords, required

* **Step 3: Authors**

  * Submitter info (pre-filled from profile)

  * Add co-authors button

    * Modal with fields: Name, Email, Affiliation, ORCID

    * Checkbox: Is corresponding author

  * Drag-and-drop to reorder

* **Step 4: Files**

  * Upload PDF (required, max 10MB)

  * Upload Typst source (optional, .typ + assets as .zip)

  * Upload supplementary materials (optional, max 50MB)

  * Progress bars for uploads

* **Step 5: Declarations**

  * Conflict of interest statement (textarea, required)

  * Funding information (textarea, optional)

  * Data availability statement (textarea, optional)

  * Ethics approval (checkbox + text field if yes)

* **Step 6: Review & Submit**

  * Preview all entered data

  * Checkbox: "I confirm all information is accurate"

  * Button: "Submit Article"

1. **Backend Processing**

```typescript
// Server function
async function submitArticle(data: SubmissionData) {
  // 1. Insert article record
  const article = await supabase
    .from('journal.articles')
    .insert({
      submitter_id: user.id,
      status: 'submitted',
      submitted_at: new Date(),
      ...data.metadata
    })
    .select()
    .single();
  
  // 2. Insert authors
  await supabase
    .from('journal.article_authors')
    .insert(data.authors.map((a, i) => ({
      article_id: article.id,
      author_order: i + 1,
      ...a
    })));
  
  // 3. Upload files to Storage
  const pdfPath = await uploadFile(
    'journal-submissions',
    `${article.id}/v1/manuscript.pdf`,
    data.pdfFile
  );
  
  // 4. Create version record
  await supabase
    .from('journal.article_versions')
    .insert({
      article_id: article.id,
      version_label: 'Initial Submission',
      pdf_path: pdfPath,
      uploaded_by: user.id
    });
  
  // 5. Send notifications
  await sendEmail('new_submission', {
    to: editorEmails,
    variables: {
      submission_number: article.submission_number,
      article_title: article.title_en,
      author_name: user.full_name
    }
  });
  
  // 6. Create notification for editors
  await createNotification({
    user_ids: editorIds,
    type: 'new_submission',
    article_id: article.id,
    title: 'New Submission',
    message: `${user.full_name} submitted "${article.title_en}"`
  });
  
  return article;
}
```

1. **Confirmation**

* Redirect to `/journal/submissions/${article.id}`

* Show success message with submission number

* Display submission status timeline

---

### Flow 2: Review Process (Editor → Reviewer)

#### Part A: Editor Invites Reviewer

**Prerequisites:** Editor is logged in, article status is `submitted` or `under_review`

1. **Editor Opens Article**

* Navigate to `/journal/editorial/articles/${articleId}`

* View article details, metadata, PDF

1. **Invite Reviewer**

* Click "Invite Reviewer" button

* Modal opens with:

  * Search existing reviewers (by name, expertise)

  * OR enter new reviewer email

  * Set deadline (default: 21 days from now)

  * Optional: Add personal message

* Click "Send Invitation"

1. **Backend Processing**

```typescript
async function inviteReviewer(data: InviteData) {
  // 1. Create review assignment
  const assignment = await supabase
    .from('journal.review_assignments')
    .insert({
      article_id: data.articleId,
      invitation_email: data.reviewerEmail,
      invited_by: editor.id,
      due_date: data.dueDate,
      status: 'invited'
    })
    .select()
    .single();
  
  // 2. Create or link reviewer account
  let reviewerId = null;
  const existingUser = await getUserByEmail(data.reviewerEmail);
  
  if (!existingUser) {
    // Send magic link to create account
    await supabase.auth.signInWithOtp({
      email: data.reviewerEmail,
      options: {
        data: { role: 'reviewer' }
      }
    });
  } else {
    reviewerId = existingUser.id;
    await supabase
      .from('journal.review_assignments')
      .update({ reviewer_id: reviewerId })
      .eq('id', assignment.id);
  }
  
  // 3. Send invitation email
  const invitationLink = `${siteUrl}/journal/review/${assignment.invitation_token}`;
  
  await sendEmail('review_invitation', {
    to: data.reviewerEmail,
    variables: {
      reviewer_name: data.reviewerName || 'Reviewer',
      article_title: article.title_en,
      article_abstract: article.abstract_en.substring(0, 200) + '...',
      due_date: formatDate(data.dueDate),
      invitation_link: invitationLink
    }
  });
  
  // 4. Update article status if first reviewer
  const reviewCount = await getReviewAssignmentCount(data.articleId);
  if (reviewCount === 1) {
    await updateArticleStatus(data.articleId, 'under_review');
  }
  
  return assignment;
}
```

#### Part B: Reviewer Responds to Invitation

1. **Reviewer Receives Email**

* Email contains article title, abstract, deadline

* Link: `/journal/review/${token}`

1. **Reviewer Clicks Link**

* If not logged in: Prompted to create account or log in

* If logged in: Directly to invitation page

1. **Invitation Page**

* Display article metadata (anonymized if double-blind)

* Show deadline

* Two buttons: "Accept" | "Decline"

1. **If Decline:**

* Modal with optional fields:

  * Reason for declining (dropdown + text)

  * Suggest alternative reviewers (text)

* Click "Submit Decline"

* Backend updates assignment status to `declined`

* Email sent to editor

1. **If Accept:**

* Modal with confirmation

* Optional: Request deadline extension

* Click "Confirm Acceptance"

* Backend updates assignment status to `accepted`

* Redirect to review page: `/journal/review/${assignmentId}`

#### Part C: Reviewer Submits Review

1. **Review Page**

* Left panel: PDF viewer (anonymized if needed)

* Right panel: Review form

1. **Review Form**

* **Section 1: Scores** (1-5 stars)

  * Originality and Significance

  * Methodological Rigor

  * Clarity of Presentation

  * Quality of References

  * Overall Quality

* **Section 2: Qualitative Feedback**

  * Strengths (textarea)

  * Weaknesses (textarea)

  * Comments for Authors (rich text editor)

  * Confidential Comments for Editors (rich text editor)

* **Section 3: Recommendation**

  * Radio buttons: Accept | Minor Revision | Major Revision | Reject

* **Section 4: Flags** (checkboxes)

  * Has methodology issues

  * Has statistical errors

  * Has ethical concerns

  * Suspected plagiarism

* **Auto-save:** Every 2 minutes, save as draft

* **Buttons:** "Save Draft" | "Submit Review"

1. **Submit Review**

* Validation: All required fields filled

* Confirmation modal: "Are you sure? You cannot edit after submission."

* Click "Confirm"

1. **Backend Processing**

```typescript
async function submitReview(data: ReviewData) {
  // 1. Insert review
  const review = await supabase
    .from('journal.reviews')
    .insert({
      assignment_id: data.assignmentId,
      is_draft: false,
      ...data.scores,
      ...data.feedback,
      recommendation: data.recommendation
    })
    .select()
    .single();
  
  // 2. Update assignment status
  await supabase
    .from('journal.review_assignments')
    .update({
      status: 'completed',
      completed_at: new Date()
    })
    .eq('id', data.assignmentId);
  
  // 3. Notify editor
  await createNotification({
    user_ids: [assignment.invited_by],
    type: 'review_completed',
    article_id: assignment.article_id,
    title: 'Review Completed',
    message: `A review has been submitted for "${article.title_en}"`
  });
  
  await sendEmail('review_completed', {
    to: editor.email,
    variables: {
      article_title: article.title_en,
      submission_number: article.submission_number
    }
  });
  
  // 4. Check if all reviews are complete
  const allReviews = await getAllReviews(assignment.article_id);
  const allComplete = allReviews.every(r => r.status === 'completed');
  
  if (allComplete) {
    await updateArticleStatus(assignment.article_id, 'awaiting_decision');
    await notifyEditorAllReviewsComplete(assignment.article_id);
  }
  
  return review;
}
```

1. **Confirmation**

* Thank you page

* Certificate of review (downloadable PDF)

* Option to add review to ORCID (future feature)

---

### Flow 3: Editorial Decision & Publication

#### Part A: Editor Reviews Submissions

1. **Editor Dashboard**

* Route: `/journal/editorial/dashboard`

* View: Kanban board or table

* Columns: Submitted | Under Review | Awaiting Decision | Accepted | Published

1. **Filter & Sort**

* Filter by: Status, Subject Area, Date Range

* Sort by: Submission Date, Days Pending, Title

1. **Click Article Card**

* Opens article detail page: `/journal/editorial/articles/${articleId}`

#### Part B: Article Detail Page (Editor View)

**Layout:**

* **Header:** Title, Submission Number, Status Badge

* **Tabs:**

  1. Overview

  2. Reviews

  3. Versions

  4. Timeline

  5. Actions

**Tab 1: Overview**

* Bilingual metadata (PT/EN toggle)

* Authors list with affiliations, ORCIDs

* Declarations (COI, funding, ethics)

* Download buttons: PDF, Source, Supplementary

**Tab 2: Reviews**

* List of all review assignments

* For each review:

  * Reviewer name (or "Anonymous" if blinded)

  * Status: Invited | Accepted | Completed

  * Due date

  * If completed:

    * Scores (visual: stars or bars)

    * Recommendation badge

    * Expandable sections: Strengths, Weaknesses, Comments

    * Confidential comments (only visible to editor)

**Tab 3: Versions**

* Table of all uploaded versions

* Columns: Version #, Label, Upload Date, Uploaded By, Files

* Download buttons for each version

* Compare versions (diff viewer)

**Tab 4: Timeline**

* Chronological list of all events

* Icons for each event type

* Example:

  * 📝 Submitted by John Doe on Jan 15, 2024

  * 👤 Reviewer invited: [jane@example.com](mailto:jane@example.com) on Jan 16, 2024

  * ✅ Review completed by Jane Smith on Feb 5, 2024

  * 📧 Decision sent to author on Feb 10, 2024

**Tab 5: Actions**

* Buttons based on current status:

  * **If Submitted:**

    * Desk Reject

    * Invite Reviewer

    * Request Revision (without review)

  * **If Under Review:**

    * Invite Additional Reviewer

    * Send Reminder to Reviewer

  * **If Awaiting Decision:**

    * Accept

    * Request Minor Revision

    * Request Major Revision

    * Reject

  * **If Accepted:**

    * Assign Volume/Issue

    * Upload Final PDF

    * Publish

    * Mint DOI

#### Part C: Making a Decision

1. **Editor Clicks Decision Button** (e.g., "Accept")

* Modal opens with:

  * Confirmation message

  * Optional: Add comments for author

  * Optional: Attach reviewer comments (select which to share)

  * Button: "Confirm Decision"

1. **Backend Processing**

```typescript
async function makeDecision(data: DecisionData) {
  // 1. Update article status
  await supabase
    .from('journal.articles')
    .update({ status: data.decision })
    .eq('id', data.articleId);
  
  // 2. Log event
  await supabase
    .from('journal.article_events')
    .insert({
      article_id: data.articleId,
      user_id: editor.id,
      event_type: 'decision_made',
      event_data: {
        decision: data.decision,
        comments: data.comments
      }
    });
  
  // 3. Send email to author
  const templateName = {
    'accepted': 'decision_accept',
    'rejected': 'decision_reject',
    'revision_requested': 'revision_requested'
  }[data.decision];
  
  await sendEmail(templateName, {
    to: author.email,
    variables: {
      author_name: author.full_name,
      article_title: article.title_en,
      submission_number: article.submission_number,
      revision_type: data.revisionType // if applicable
    }
  });
  
  // 4. Notify author in-app
  await createNotification({
    user_ids: [article.submitter_id],
    type: 'decision_made',
    article_id: data.articleId,
    title: `Decision: ${data.decision}`,
    message: `Your article "${article.title_en}" has been ${data.decision}`,
    action_url: `/journal/submissions/${data.articleId}`
  });
  
  return { success: true };
}
```

#### Part D: Publishing Article

**Prerequisites:** Article status is `accepted`, all metadata complete

1. **Editor Navigates to Article**

* Tab: Actions

* Section: Publication

1. **Pre-publication Checklist**

* \[ \] Final PDF uploaded

* \[ \] Typst source available

* \[ \] All author ORCIDs verified

* \[ \] Volume and issue assigned

* \[ \] Copyright agreement signed (manual check)

1. **Assign Volume/Issue**

* Input fields: Volume (number), Issue (number)

* Optional: Page range (start, end)

* Save

1. **Upload Final PDF**

* If different from submission PDF

* Upload button → creates new version with label "Final Published Version"

1. **Click "Publish" Button**

* Confirmation modal

* Button: "Confirm Publication"

1. **Backend Processing**

```typescript
async function publishArticle(articleId: string) {
  // 1. Update article status
  const article = await supabase
    .from('journal.articles')
    .update({
      status: 'published',
      published_at: new Date()
    })
    .eq('id', articleId)
    .select()
    .single();
  
  // 2. Generate public slug
  const slug = generateSlug(article.title_en);
  
  // 3. Create public page (static generation or dynamic route)
  // This happens automatically via TanStack Start routing
  
  // 4. Update RSS feed
  await regenerateRSSFeed();
  
  // 5. Notify authors
  await sendEmail('article_published', {
    to: [author.email, ...coauthorEmails],
    variables: {
      article_title: article.title_en,
      article_url: `${siteUrl}/journal/articles/${article.id}`,
      submission_number: article.submission_number
    }
  });
  
  return article;
}
```

1. **Post-publication**

* Article appears on journal homepage

* Article accessible at: `/journal/articles/${articleId}`

* Editor can now mint DOI

#### Part E: Minting DOI (Crossref Integration)

1. **Editor Clicks "Mint DOI" Button**

* Modal with DOI preview: `10.xxxxx/journal.2024.001`

* Button: "Register DOI with Crossref"

1. **Backend Processing (Edge Function)**

```typescript
// supabase/functions/mint-doi/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  const { articleId } = await req.json();
  
  // 1. Fetch article with all metadata
  const article = await getArticleDetails(articleId);
  
  // 2. Generate Crossref XML
  const xml = generateCrossrefXML({
    journal: {
      title: settings.journal_name_en,
      issn: settings.issn_online,
      publisher: settings.publisher
    },
    article: {
      title: article.title_en,
      abstract: article.abstract_en,
      authors: article.authors,
      volume: article.volume,
      issue: article.issue,
      year: new Date(article.published_at).getFullYear(),
      doi: `${settings.doi_prefix}/journal.${article.submission_number}`,
      url: `${siteUrl}/journal/articles/${article.id}`,
      pdf_url: getPublicURL(article.latest_pdf)
    }
  });
  
  // 3. Send to Crossref API
  const crossrefUrl = settings.crossref_test_mode
    ? 'https://test.crossref.org/servlet/deposit'
    : 'https://doi.crossref.org/servlet/deposit';
  
  const response = await fetch(crossrefUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/vnd.crossref.deposit+xml',
      'Authorization': 'Basic ' + btoa(`${settings.crossref_username}:${settings.crossref_password}`)
    },
    body: xml
  });
  
  if (!response.ok) {
    throw new Error('Crossref registration failed');
  }
  
  // 4. Parse response and extract DOI
  const result = await response.text();
  const doi = extractDOI(result);
  
  // 5. Save DOI to database
  await supabase
    .from('journal.articles')
    .update({ doi })
    .eq('id', articleId);
  
  // 6. Log event
  await supabase
    .from('journal.article_events')
    .insert({
      article_id: articleId,
      event_type: 'doi_minted',
      event_data: { doi }
    });
  
  return new Response(
    JSON.stringify({ success: true, doi }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
```

1. **Confirmation**

* Success message with DOI

* DOI now displayed on article page

* DOI badge added to article card

---

## 6\. Technical Implementation Guide

### 6.1. Project Structure

```
project-root/
├── app/
│   ├── routes/
│   │   ├── journal/
│   │   │   ├── index.tsx                 # Journal homepage
│   │   │   ├── submit.tsx                # Submission form
│   │   │   ├── submissions/
│   │   │   │   └── $id.tsx               # Author's submission detail
│   │   │   ├── articles/
│   │   │   │   ├── index.tsx             # Public article list
│   │   │   │   └── $id.tsx               # Public article page
│   │   │   ├── review/
│   │   │   │   ├── $token.tsx            # Review invitation
│   │   │   │   └── $assignmentId.tsx     # Review form
│   │   │   └── editorial/
│   │   │       ├── dashboard.tsx         # Editor dashboard
│   │   │       ├── articles/
│   │   │       │   └── $id.tsx           # Editor article detail
│   │   │       └── settings.tsx          # Journal settings
│   ├── components/
│   │   ├── journal/
│   │   │   ├── SubmissionForm.tsx
│   │   │   ├── ReviewForm.tsx
│   │   │   ├── ArticleCard.tsx
│   │   │   ├── PDFViewer.tsx
│   │   │   ├── KanbanBoard.tsx
│   │   │   └── ...
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   ├── server.ts
│   │   │   └── types.ts                  # Generated types
│   │   ├── journal/
│   │   │   ├── articles.ts               # Article queries/mutations
│   │   │   ├── reviews.ts                # Review queries/mutations
│   │   │   ├── notifications.ts          # Notification helpers
│   │   │   └── email.ts                  # Email sending
│   │   └── utils/
│   │       ├── validation.ts
│   │       ├── formatting.ts
│   │       └── ...
├── supabase/
│   ├── migrations/
│   │   └── 20240101000000_create_journal_schema.sql
│   └── functions/
│       ├── mint-doi/
│       │   └── index.ts
│       ├── compile-typst/
│       │   └── index.ts
│       └── send-email/
│           └── index.ts
└── ...
```

## 6. Technical Implementation Guide (Continuação)

### 6.2. Key Dependencies (Completo)

```json
{
  "dependencies": {
    "@tanstack/react-router": "^1.x",
    "@tanstack/react-query": "^5.x",
    "@tanstack/start": "^1.x",
    "@tanstack/react-form": "^0.x",
    "@supabase/supabase-js": "^2.x",
    "react": "^18.x",
    "react-dom": "^18.x",
    "zod": "^3.x",
    "date-fns": "^3.x",
    "react-dropzone": "^14.x",
    "react-pdf": "^7.x",
    "@dnd-kit/core": "^6.x",
    "@dnd-kit/sortable": "^8.x",
    "recharts": "^2.x",
    "lucide-react": "^0.x",
    "tailwindcss": "^3.x"
  },
  "devDependencies": {
    "@types/react": "^18.x",
    "@types/react-dom": "^18.x",
    "typescript": "^5.x",
    "vite": "^5.x",
    "supabase": "^1.x"
  }
}
```

### 6.3. Environment Variables

```bash
# .env.local

# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Site
VITE_SITE_URL=https://yourjournal.com

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxx
FROM_EMAIL=journal@yourjournal.com

# Crossref
CROSSREF_USERNAME=your-username
CROSSREF_PASSWORD=your-password
CROSSREF_DOI_PREFIX=10.xxxxx
CROSSREF_TEST_MODE=true

# Storage
SUPABASE_STORAGE_BUCKET=journal-submissions
MAX_FILE_SIZE_MB=10
```

### 6.4. Supabase Storage Buckets

Você precisará criar os seguintes buckets no Supabase:

```typescript
// Criar via Supabase Dashboard ou CLI

// 1. journal-submissions (PRIVATE)
// - Armazena PDFs, arquivos Typst, materiais suplementares
// - Acesso via RLS baseado em article ownership

// 2. journal-published (PUBLIC)
// - Armazena PDFs finais publicados
// - Acesso público para leitura

// Estrutura de pastas:
// journal-submissions/
//   ├── {article-id}/
//   │   ├── v1/
//   │   │   ├── manuscript.pdf
//   │   │   ├── source.typ
//   │   │   └── supplementary/
//   │   ├── v2/
//   │   │   └── ...
//
// journal-published/
//   ├── {year}/
//   │   ├── {article-id}/
//   │   │   ├── article.pdf
//   │   │   └── thumbnail.png
```

**RLS Policies para Storage:**

```sql
-- Policy para journal-submissions
create policy "Users can upload to their own articles"
on storage.objects for insert
with check (
  bucket_id = 'journal-submissions'
  and (storage.foldername(name))[1]::uuid in (
    select id from journal.articles where submitter_id = auth.uid()
  )
);

create policy "Users can read their own submissions"
on storage.objects for select
using (
  bucket_id = 'journal-submissions'
  and (
    -- Author can read their own
    (storage.foldername(name))[1]::uuid in (
      select id from journal.articles where submitter_id = auth.uid()
    )
    -- OR Reviewer can read assigned articles
    or (storage.foldername(name))[1]::uuid in (
      select article_id from journal.review_assignments
      where reviewer_id = auth.uid() and status in ('accepted', 'completed')
    )
    -- OR Editor can read all
    or exists (
      select 1 from journal.user_profiles
      where id = auth.uid() and role = 'editor'
    )
  )
);

-- Policy para journal-published (público)
create policy "Anyone can read published articles"
on storage.objects for select
using (bucket_id = 'journal-published');
```

### 6.5. Type Generation

Use o Supabase CLI para gerar tipos TypeScript automaticamente:

```bash
# Instalar CLI
npm install -g supabase

# Login
supabase login

# Link ao projeto
supabase link --project-ref your-project-ref

# Gerar tipos
supabase gen types typescript --schema journal > app/lib/supabase/types.ts
```

**Exemplo de uso dos tipos:**

```typescript
// app/lib/supabase/types.ts (gerado automaticamente)
export type Database = {
  journal: {
    Tables: {
      articles: {
        Row: {
          id: string;
          title_en: string;
          status: 'draft' | 'submitted' | 'under_review' | ...;
          // ... todos os campos
        };
        Insert: {
          id?: string;
          title_en: string;
          // ... campos obrigatórios para insert
        };
        Update: {
          title_en?: string;
          // ... campos opcionais para update
        };
      };
      // ... outras tabelas
    };
  };
};

// Uso no código
import { Database } from './types';

const supabase = createClient<Database>(url, key);

// Agora você tem autocomplete e type safety!
const { data } = await supabase
  .from('journal.articles')
  .select('*')
  .eq('status', 'published'); // TypeScript valida o valor
```

---

## 7. Email System Implementation

### 7.1. Email Service Setup (Resend)

```typescript
// app/lib/email/client.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(
  templateName: string,
  options: {
    to: string | string[];
    variables: Record<string, string>;
    language?: 'pt' | 'en';
  }
) {
  // 1. Fetch template from database
  const { data: template } = await supabase
    .from('journal.email_templates')
    .select('*')
    .eq('name', templateName)
    .single();

  if (!template) {
    throw new Error(`Template ${templateName} not found`);
  }

  // 2. Select language
  const lang = options.language || 'en';
  const subject = template[`subject_${lang}`];
  const body = template[`body_${lang}`];

  // 3. Replace variables
  let finalSubject = subject;
  let finalBody = body;

  Object.entries(options.variables).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`;
    finalSubject = finalSubject.replace(new RegExp(placeholder, 'g'), value);
    finalBody = finalBody.replace(new RegExp(placeholder, 'g'), value);
  });

  // 4. Send email
  const { data, error } = await resend.emails.send({
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to: Array.isArray(options.to) ? options.to : [options.to],
    subject: finalSubject,
    html: convertToHTML(finalBody), // Converte markdown/plain text para HTML
  });

  if (error) {
    console.error('Email send error:', error);
    throw error;
  }

  return data;
}

// Helper para converter texto em HTML básico
function convertToHTML(text: string): string {
  return text
    .split('\n\n')
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}
```

### 7.2. Email Templates (HTML)

Para emails mais profissionais, você pode criar templates HTML:

```typescript
// app/lib/email/templates/review-invitation.tsx
export function ReviewInvitationEmail(props: {
  reviewerName: string;
  articleTitle: string;
  articleAbstract: string;
  dueDate: string;
  invitationLink: string;
}) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Review Invitation</h1>
          </div>
          <div class="content">
            <p>Dear ${props.reviewerName},</p>
            
            <p>We would like to invite you to review the following article:</p>
            
            <h3>${props.articleTitle}</h3>
            <p><strong>Abstract:</strong> ${props.articleAbstract}</p>
            
            <p><strong>Review Deadline:</strong> ${props.dueDate}</p>
            
            <p>Please click the button below to accept or decline this invitation:</p>
            
            <a href="${props.invitationLink}" class="button">View Invitation</a>
            
            <p>If you have any questions, please don't hesitate to contact us.</p>
            
            <p>Best regards,<br>The Editorial Team</p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply directly to this message.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}
```

---

## 8. Frontend Components (Key Examples)

### 8.1. Submission Form Component

```typescript
// app/components/journal/SubmissionForm.tsx
import { useForm } from '@tanstack/react-form';
import { zodValidator } from '@tanstack/zod-form-adapter';
import { z } from 'zod';
import { useState } from 'react';

const submissionSchema = z.object({
  article_type: z.enum(['research', 'review', 'short_communication']),
  subject_area: z.string().min(1),
  title_pt: z.string().min(10).max(300),
  title_en: z.string().min(10).max(300),
  abstract_pt: z.string().min(100).max(3000),
  abstract_en: z.string().min(100).max(3000),
  keywords_pt: z.array(z.string()).min(3).max(6),
  keywords_en: z.array(z.string()).min(3).max(6),
  conflict_of_interest: z.string().min(10),
  // ... outros campos
});

export function SubmissionForm() {
  const [currentStep, setCurrentStep] = useState(1);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const form = useForm({
    defaultValues: {
      article_type: 'research',
      subject_area: '',
      title_pt: '',
      title_en: '',
      // ... valores padrão
    },
    validatorAdapter: zodValidator,
    validators: {
      onChange: submissionSchema,
    },
    onSubmit: async ({ value }) => {
      // Upload files primeiro
      const pdfPath = await uploadFile(pdfFile);
      
      // Depois submete o formulário
      const result = await submitArticle({
        ...value,
        pdf_path: pdfPath,
      });
      
      // Redirect para página de sucesso
      router.navigate(`/journal/submissions/${result.id}`);
    },
  });

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Progress Indicator */}
      <div className="mb-8">
        <StepIndicator currentStep={currentStep} totalSteps={6} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        {/* Step 1: Article Type */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Article Information</h2>
            
            <form.Field name="article_type">
              {(field) => (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Article Type *
                  </label>
                  <select
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg"
                  >
                    <option value="research">Research Article</option>
                    <option value="review">Review Article</option>
                    <option value="short_communication">Short Communication</option>
                  </select>
                  {field.state.meta.errors && (
                    <p className="text-red-500 text-sm mt-1">
                      {field.state.meta.errors.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </form.Field>

            <form.Field name="subject_area">
              {(field) => (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Subject Area *
                  </label>
                  <select
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg"
                  >
                    <option value="">Select...</option>
                    <option value="computer_science">Computer Science</option>
                    <option value="mathematics">Mathematics</option>
                    <option value="physics">Physics</option>
                    {/* ... mais áreas */}
                  </select>
                </div>
              )}
            </form.Field>
          </div>
        )}

        {/* Step 2: Bilingual Metadata */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Title and Abstract</h2>
            
            <div className="grid grid-cols-2 gap-6">
              {/* Portuguese */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Português</h3>
                
                <form.Field name="title_pt">
                  {(field) => (
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Título *
                      </label>
                      <input
                        type="text"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg"
                        placeholder="Digite o título em português"
                      />
                      <p className="text-sm text-gray-500 mt-1">
                        {field.state.value.length}/300 caracteres
                      </p>
                    </div>
                  )}
                </form.Field>

                <form.Field name="abstract_pt">
                  {(field) => (
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Resumo *
                      </label>
                      <textarea
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        rows={8}
                        className="w-full px-4 py-2 border rounded-lg"
                        placeholder="Digite o resumo em português"
                      />
                      <p className="text-sm text-gray-500 mt-1">
                        {field.state.value.split(' ').length}/500 palavras
                      </p>
                    </div>
                  )}
                </form.Field>
              </div>

              {/* English */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">English</h3>
                
                <form.Field name="title_en">
                  {(field) => (
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Title *
                      </label>
                      <input
                        type="text"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg"
                        placeholder="Enter title in English"
                      />
                    </div>
                  )}
                </form.Field>

                <form.Field name="abstract_en">
                  {(field) => (
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Abstract *
                      </label>
                      <textarea
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        rows={8}
                        className="w-full px-4 py-2 border rounded-lg"
                        placeholder="Enter abstract in English"
                      />
                    </div>
                  )}
                </form.Field>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: File Upload */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Upload Files</h2>
            
            <FileUploadZone
              label="Manuscript PDF *"
              accept=".pdf"
              maxSize={10 * 1024 * 1024} // 10MB
              onFileSelect={setPdfFile}
              file={pdfFile}
            />
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-8">
          <button
            type="button"
            onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
            disabled={currentStep === 1}
            className="px-6 py-2 border rounded-lg disabled:opacity-50"
          >
            Previous
          </button>

          {currentStep < 6 ? (
            <button
              type="button"
              onClick={() => setCurrentStep(currentStep + 1)}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg"
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              className="px-6 py-2 bg-green-600 text-white rounded-lg"
            >
              Submit Article
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
```

### 8.2. Editorial Dashboard (Kanban)

```typescript
// app/components/journal/KanbanBoard.tsx
import { DndContext, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const COLUMNS = [
  { id: 'submitted', title: 'Submitted', color: 'blue' },
  { id: 'under_review', title: 'Under Review', color: 'yellow' },
  { id: 'awaiting_decision', title: 'Awaiting Decision', color: 'purple' },
  { id: 'accepted', title: 'Accepted', color: 'green' },
];

export function KanbanBoard() {
  const { data: articles } = useQuery({
    queryKey: ['editorial-articles'],
    queryFn: async () => {
      const { data } = await supabase
        .from('journal.articles')
        .select('*, submitter:user_profiles(*)')
        .neq('status', 'published')
        .order('submitted_at', { ascending: false });
      return data;
    },
  });

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;

    const articleId = active.id as string;
    const newStatus = over.id as string;

    // Optimistic update
    await updateArticleStatus(articleId, newStatus);
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto p-6">
        {COLUMNS.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            articles={articles?.filter(a => a.status === column.id) || []}
          />
        ))}
      </div>
    </DndContext>
  );
}

function KanbanColumn({ column, articles }) {
  return (
    <div className="flex-shrink-0 w-80">
      <div className={`bg-${column.color}-100 rounded-t-lg p-4`}>
        <h3 className="font-semibold">{column.title}</h3>
        <span className="text-sm text-gray-600">{articles.length} articles</span>
      </div>
      
      <SortableContext items={articles.map(a => a.id)}>
        <div className="bg-gray-50 p-4 space-y-3 min-h-[500px]">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function ArticleCard({ article }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: article.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const daysSince = Math.floor(
    (Date.now() - new Date(article.submitted_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-white p-4 rounded-lg shadow cursor-move hover:shadow-lg transition"
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-mono text-gray-500">
          {article.submission_number}
        </span>
        <span className={`text-xs px-2 py-1 rounded ${
          daysSince > 30 ? 'bg-red-100 text-red-700' :
          daysSince > 14 ? 'bg-yellow-100 text-yellow-700' :
          'bg-green-100 text-green-700'
        }`}>
          {daysSince}d
        </span>
      </div>
      
      <h4 className="font-semibold text-sm mb-2 line-clamp-2">
        {article.title_en}
      </h4>
      
      <p className="text-xs text-gray-600 mb-2">
        {article.submitter.full_name}
      </p>
      
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">{article.article_type}</span>
        <button
          onClick={() => router.navigate(`/journal/editorial/articles/${article.id}`)}
          className="text-blue-600 hover:underline"
        >
          View →
        </button>
      </div>
    </div>
  );
}
```

---

## 9. Crossref DOI Integration (Detailed)

### 9.1. XML Generation

```typescript
// app/lib/crossref/xml-generator.ts

export function generateCrossrefXML(data: {
  journal: {
    title: string;
    issn: string;
    publisher: string;
  };
  article: {
    title: string;
    abstract: string;
    authors: Array<{
      full_name: string;
      orcid?: string;
      affiliation?: string;
    }>;
    volume: number;
    issue: number;
    year: number;
    doi: string;
    url: string;
    pdf_url: string;
    published_date: string;
  };
}): string {
  const timestamp = Date.now();
  const batchId = `batch_${timestamp}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<doi_batch xmlns="http://www.crossref.org/schema/5.3.1"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
           version="5.3.1"
           xsi:schemaLocation="http://www.crossref.org/schema/5.3.1 
           http://www.crossref.org/schemas/crossref5.3.1.xsd">
  <head>
    <doi_batch_id>${batchId}</doi_batch_id>
    <timestamp>${timestamp}</timestamp>
    <depositor>
      <depositor_name>${data.journal.publisher}</depositor_name>
      <email_address>${process.env.FROM_EMAIL}</email_address>
    </depositor>
    <registrant>${data.journal.publisher}</registrant>
  </head>
  <body>
    <journal>
      <journal_metadata>
        <full_title>${escapeXML(data.journal.title)}</full_title>
        <issn media_type="electronic">${data.journal.issn}</issn>
      </journal_metadata>
      
      <journal_issue>
        <publication_date media_type="online">
          <year>${data.article.year}</year>
        </publication_date>
        <journal_volume>
          <volume>${data.article.volume}</volume>
        </journal_volume>
        <issue>${data.article.issue}</issue>
      </journal_issue>
      
      <journal_article publication_type="full_text">
        <titles>
          <title>${escapeXML(data.article.title)}</title>
        </titles>
        
        <contributors>
          ${data.article.authors.map((author, index) => `
          <person_name sequence="${index === 0 ? 'first' : 'additional'}" contributor_role="author">
            <given_name>${escapeXML(author.full_name.split(' ')[0])}</given_name>
            <surname>${escapeXML(author.full_name.split(' ').slice(1).join(' '))}</surname>
            ${author.orcid ? `<ORCID authenticated="true">https://orcid.org/${author.orcid}</ORCID>` : ''}
            ${author.affiliation ? `
            <affiliation>${escapeXML(author.affiliation)}</affiliation>
            ` : ''}
          </person_name>
          `).join('')}
        </contributors>
        
        <publication_date media_type="online">
          <year>${new Date(data.article.published_date).getFullYear()}</year>
          <month>${new Date(data.article.published_date).getMonth() + 1}</month>
          <day>${new Date(data.article.published_date).getDate()}</day>
        </publication_date>
        
        <doi_data>
          <doi>${data.article.doi}</doi>
          <resource>${data.article.url}</resource>
          <collection property="text-mining">
            <item>
              <resource mime_type="application/pdf">${data.article.pdf_url}</resource>
            </item>
          </collection>
        </doi_data>
        
        ${data.article.abstract ? `
        <abstract xmlns="http://www.ncbi.nlm.nih.gov/JATS1">
          <p>${escapeXML(data.article.abstract)}</p>
        </abstract>
        ` : ''}
      </journal_article>
    </journal>
  </body>
</doi_batch>`;
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
```

### 9.2. Edge Function Implementation

```typescript
// supabase/functions/mint-doi/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  try {
    const { articleId } = await req.json();

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Fetch article with all metadata
    const { data: article, error: articleError } = await supabase
      .rpc('journal.get_article_details', { article_uuid: articleId });

    if (articleError || !article) {
      throw new Error('Article not found');
    }

    // 2. Fetch journal settings
    const { data: settings } = await supabase
      .from('journal.journal_settings')
      .select('*')
      .single();

    // 3. Generate DOI
    const doi = `${settings.doi_prefix}/journal.${article.article.submission_number}`;

    // 4. Generate Crossref XML
    const xml = generateCrossrefXML({
      journal: {
        title: settings.journal_name_en,
        issn: settings.issn_online,
        publisher: settings.publisher,
      },
      article: {
        title: article.article.title_en,
        abstract: article.article.abstract_en,
        authors: article.authors,
        volume: article.article.volume,
        issue: article.article.issue,
        year: new Date(article.article.published_at).getFullYear(),
        doi: doi,
        url: `${Deno.env.get('SITE_URL')}/journal/articles/${articleId}`,
        pdf_url: getPublicURL(article.versions[0].pdf_path),
        published_date: article.article.published_at,
      },
    });

    // 5. Send to Crossref
    const crossrefUrl = settings.crossref_test_mode
      ? 'https://test.crossref.org/servlet/deposit'
      : 'https://doi.crossref.org/servlet/deposit';

    const auth = btoa(`${settings.crossref_username}:${settings.crossref_password}`);

    const response = await fetch(crossrefUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.crossref.deposit+xml',
        'Authorization': `Basic ${auth}`,
      },
      body: xml,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Crossref API error: ${errorText}`);
    }

    // 6. Save DOI to database
    await supabase
      .from('journal.articles')
      .update({ doi })
      .eq('id', articleId);

    // 7. Log event
    await supabase
      .from('journal.article_events')
      .insert({
        article_id: articleId,
        event_type: 'doi_minted',
        event_data: { doi, crossref_response: await response.text() },
      });

    return new Response(
      JSON.stringify({ success: true, doi }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
```

---

## 10. Implementation Roadmap (Revised)

### Phase 1: Foundation (Week 1-2)
**Goal:** Basic infrastructure and authentication

- [ ] Setup TanStack Start project
- [ ] Configure Supabase connection
- [ ] Run SQL migration (create `journal` schema)
- [ ] Setup Supabase Storage buckets
- [ ] Implement authentication flow
- [ ] Create user profile management
- [ ] Setup RLS policies
- [ ] Generate TypeScript types

**Deliverable:** Users can sign up, log in, and view their profile

---

### Phase 2: Submission Module (Week 3-4)
**Goal:** Authors can submit articles

- [ ] Build multi-step submission form
- [ ] Implement file upload (PDF, Typst)
- [ ] Create co-author management UI
- [ ] Setup email notifications (Resend)
- [ ] Build author dashboard (view submissions)
- [ ] Create article detail page (author view)

**Deliverable:** Authors can submit complete articles and track status

---

### Phase 3: Editorial Dashboard (Week 5-6)
**Goal:** Editors can manage submissions

- [ ] Build editorial dashboard (Kanban + Table views)
- [ ] Implement article filtering and search
- [ ] Create editor article detail page
- [ ] Build reviewer invitation flow
- [ ] Implement status change workflow
- [ ] Add metrics panel

**Deliverable:** Editors can view, filter, and manage all submissions

---

### Phase 4: Review System (Week 7-8)
**Goal:** Complete peer review workflow

- [ ] Build review invitation acceptance page
- [ ] Create review form with scores
- [ ] Implement PDF viewer for reviewers
- [ ] Add review submission and draft saving
- [ ] Build editor review viewing interface
- [ ] Implement review notifications

**Deliverable:** Full peer review cycle functional

---

### Phase 5: Publication (Week 9-10)
**Goal:** Publish articles publicly

- [ ] Create public article page
- [ ] Build journal homepage with article list
- [ ] Implement article search and filters
- [ ] Add PDF viewer for public
- [ ] Create BibTeX export
- [ ] Generate RSS feed
- [ ] Build volume/issue management

**Deliverable:** Published articles are publicly accessible

---

### Phase 6: DOI Integration (Week 11)
**Goal:** Automatic DOI registration

- [ ] Implement Crossref XML generation
- [ ] Create `mint-doi` Edge Function
- [ ] Add DOI display on article pages
- [ ] Implement DOI badge/link
- [ ] Test with Crossref test environment
- [ ] Document DOI workflow

**Deliverable:** Articles can receive DOIs automatically

---

### Phase 7: Polish & Testing (Week 12)
**Goal:** Production-ready system

- [ ] Comprehensive testing (unit + integration)
- [ ] Performance optimization
- [ ] Accessibility audit (WCAG 2.1)
- [ ] Mobile responsiveness
- [ ] Error handling and logging
- [ ] User documentation
- [ ] Admin documentation
- [ ] Deployment to production

**Deliverable:** Stable, tested, production-ready system

---

## 11. Testing Strategy

### 11.1. Unit Tests

```typescript
// app/lib/journal/__tests__/articles.test.ts
import { describe, it, expect } from 'vitest';
import { submitArticle, updateArticleStatus } from '../articles';

describe('Article Submission', () => {
  it('should create article with correct status', async () => {
    const result = await submitArticle({
      title_en: 'Test Article',
      title_pt: 'Artigo de Teste',
      // ... outros campos
    });

    expect(result.status).toBe('submitted');
    expect(result.submission_number).toMatch(/^\d{4}-\d{3}$/);
  });

  it('should reject submission with missing required fields', async () => {
    await expect(
      submitArticle({ title_en: 'Test' })
    ).rejects.toThrow('Missing required fields');
  });
});
```

### 11.2. Integration Tests

```typescript
// app/__tests__/submission-flow.test.ts
import { test, expect } from '@playwright/test';

test('complete submission flow', async ({ page }) => {
  // 1. Login
  await page.goto('/login');
  await page.fill('[name="email"]', 'author@test.com');
  await page.fill('[name="password"]', 'password123');
  await page.click('button[type="submit"]');

  // 2. Navigate to submission
  await page.click('text=Submit Article');
  await expect(page).toHaveURL('/journal/submit');

  // 3. Fill form
  await page.selectOption('[name="article_type"]', 'research');
  await page.fill('[name="title_en"]', 'My Research Article');
  // ... preencher outros campos

  // 4. Upload file
  await page.setInputFiles('[name="pdf"]', 'test-article.pdf');

  // 5. Submit
  await page.click('text=Submit Article');

  // 6. Verify success
  await expect(page).toHaveURL(/\/journal\/submissions\/[a-z0-9-]+/);
  await expect(page.locator('text=Submission Successful')).toBeVisible();
});
```

---

## 12. Security Considerations

### 12.1. File Upload Security

```typescript
// app/lib/storage/validation.ts

const ALLOWED_MIME_TYPES = {
  pdf: ['application/pdf'],
  typst: ['text/plain', 'application/octet-stream'],
  supplementary: ['application/pdf', 'application/zip', 'image/png', 'image/jpeg'],
};

export async function validateFile(
  file: File,
  type: keyof typeof ALLOWED_MIME_TYPES
): Promise<{ valid: boolean; error?: string }> {
  // 1. Check MIME type
  if (!ALLOWED_MIME_TYPES[type].includes(file.type)) {
    return { valid: false, error: 'Invalid file type' };
  }

  // 2. Check file size
  const maxSize = type === 'pdf' ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return { valid: false, error: 'File too large' };
  }

  // 3. Verify file signature (magic bytes)
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (type === 'pdf') {
    // PDF should start with %PDF
    const pdfSignature = [0x25, 0x50, 0x44, 0x46];
    if (!pdfSignature.every((byte, i) => bytes[i] === byte)) {
      return { valid: false, error: 'Invalid PDF file' };
    }
  }

  // 4. Scan for malware (optional, use external service)
  // const scanResult = await scanFile(buffer);
  // if (!scanResult.clean) {
  //   return { valid: false, error: 'File contains malware' };
  // }

  return { valid: true };
}
```

### 12.2. Rate Limiting

```typescript
// app/lib/security/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
});

// 5 submissions per day per user
export const submissionRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '24 h'),
  analytics: true,
});

// Usage in server function
export async function submitArticle(data: SubmissionData) {
  const { success } = await submissionRateLimit.limit(user.id);
  
  if (!success) {
    throw new Error('Rate limit exceeded. Maximum 5 submissions per day.');
  }

  // ... proceed with submission
}
```

---

## 13. Performance Optimization

### 13.1. Database Indexes (Already in SQL)

Certifique-se de que estes índices estão criados:

```sql
-- Já incluídos no schema, mas importante destacar:
create index idx_articles_status on journal.articles(status);
create index idx_articles_published on journal.articles(published_at desc) 
  where status = 'published';
create index idx_review_assignments_reviewer on journal.review_assignments(reviewer_id);
```

### 13.2. Query Optimization

```typescript
// ❌ BAD: N+1 query problem
const articles = await supabase.from('journal.articles').select('*');
for (const article of articles) {
  const authors = await supabase
    .from('journal.article_authors')
    .select('*')
    .eq('article_id', article.id);
}

// ✅ GOOD: Single query with join
const articles = await supabase
  .from('journal.articles')
  .select(`
    *,
    authors:article_authors(*)
  `);
```

### 13.3. Caching Strategy

```typescript
// app/lib/cache/articles.ts
import { useQuery } from '@tanstack/react-query';

export function usePublishedArticles() {
  return useQuery({
    queryKey: ['published-articles'],
    queryFn: fetchPublishedArticles,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
  });
}

// Invalidate cache on new publication
export async function publishArticle(articleId: string) {
  await updateArticleStatus(articleId, 'published');
  
  // Invalidate cache
  queryClient.invalidateQueries(['published-articles']);
}
```

---

## 14. Monitoring & Analytics

### 14.1. Error Tracking (Sentry)

```typescript
// app/lib/monitoring/sentry.ts
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

// Usage
try {
  await submitArticle(data);
} catch (error) {
  Sentry.captureException(error, {
    tags: { feature: 'submission' },
    extra: { articleData: data },
  });
  throw error;
}
```

### 14.2. Analytics Events

```typescript
// app/lib/analytics/events.ts

export function trackSubmission(articleId: string) {
  // Google Analytics
  gtag('event', 'article_submitted', {
    article_id: articleId,
  });

  // Custom analytics
  await supabase.from('analytics_events').insert({
    event_type: 'submission',
    event_data: { article_id: articleId },
  });
}

export function trackArticleView(articleId: string) {
  gtag('event', 'article_view', {
    article_id: articleId,
  });
}
```

---

## 15. Deployment Checklist

### Pre-deployment

- [ ] All environment variables configured
- [ ] Database migrations run successfully
- [ ] RLS policies tested
- [ ] Storage buckets created with correct policies
- [ ] Email templates configured
- [ ] Crossref credentials verified (test mode first)
- [ ] SSL certificate installed
- [ ] Domain configured
- [ ] Backup strategy in place

### Post-deployment

- [ ] Test complete submission flow
- [ ] Test review workflow
- [ ] Test publication and DOI minting
- [ ] Verify email delivery
- [ ] Check error logging
- [ ] Monitor performance metrics
- [ ] Setup uptime monitoring
- [ ] Create admin accounts
- [ ] Import initial data (if any)

---

## 16. Future Enhancements (Post-MVP)

### Phase 8+: Advanced Features

1. **Typst Compilation Service**
   - Automatic compilation of .typ to PDF
   - HTML generation from Typst
   - Preview during submission

2. **Advanced Search**
   - Full-text search across articles
   - Faceted search (by author, year, subject)
   - Citation search

3. **Metrics & Impact**
   - Article view/download statistics
   - Citation tracking
   - Altmetrics integration

4. **OAI-PMH Endpoint**
   - For indexing by Google Scholar, PubMed, etc.

5. **ORCID Integration**
   - Auto-populate author info from ORCID
   - Push publications to ORCID profiles

6. **Reviewer Reputation System**
   - Track reviewer performance
   - Reviewer badges/certificates
   - Reviewer recommendations based on expertise

7. **Plagiarism Detection**
   - Integration with Turnitin or similar
   - Automatic checks on submission

8. **Multi-language Support**
   - Support for more languages beyond PT/EN
   - RTL language support

---

## 17. Support & Documentation

### User Documentation

Create guides for:
- **Authors:** How to submit, respond to reviews, track status
- **Reviewers:** How to accept invitations, submit reviews
- **Editors:** Complete editorial workflow guide

### Technical Documentation

- API documentation (if exposing APIs)
- Database schema documentation
- Deployment guide
- Troubleshooting guide

---

## 18. Conclusion

Este PRD consolidado fornece uma base completa para implementação do sistema de gestão de periódico científico. O sistema é:

✅ **Escalável:** Arquitetura moderna com Supabase  
✅ **Seguro:** RLS policies, validação de arquivos, rate limiting  
✅ **Completo:** Cobre todo o ciclo de vida do artigo  
✅ **Profissional:** Integração DOI, emails transacionais, métricas  
✅ **Manutenível:** Código TypeScript tipado, testes, documentação  

**Próximos passos:**
1. Revisar e aprovar este PRD
2. Configurar ambiente de desenvolvimento
3. Executar migration SQL no Supabase
4. Começar implementação pela Fase 1

**Estimativa total:** 12 semanas para MVP completo com DOI

Boa sorte com a implementação! 🚀