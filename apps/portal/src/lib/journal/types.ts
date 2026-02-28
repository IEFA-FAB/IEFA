// Journal-specific TypeScript types and interfaces
// These types correspond to the journal schema tables

export type ArticleStatus =
	| "draft"
	| "submitted"
	| "under_review"
	| "revision_requested"
	| "revised_submitted"
	| "accepted"
	| "rejected"
	| "published"

export type ArticleType = "research" | "review" | "short_communication" | "editorial"

export type ReviewStatus = "invited" | "accepted" | "declined" | "completed" | "expired"

export type ReviewRecommendation = "accept" | "minor_revision" | "major_revision" | "reject"

export type UserRole = "author" | "editor" | "reviewer"

// Database row types
export interface UserProfile {
	id: string
	role: UserRole
	full_name: string
	affiliation: string | null
	orcid: string | null
	bio: string | null
	expertise: string[] | null
	email_notifications: boolean
	created_at: string
	updated_at: string
}

export interface Article {
	id: string
	submitter_id: string
	submission_number: string
	title_pt: string
	title_en: string
	abstract_pt: string
	abstract_en: string
	keywords_pt: string[]
	keywords_en: string[]
	article_type: ArticleType
	subject_area: string
	conflict_of_interest: string
	funding_info: string | null
	data_availability: string | null
	ethics_approval: string | null
	status: ArticleStatus
	doi: string | null
	volume: number | null
	issue: number | null
	page_start: number | null
	page_end: number | null
	published_at: string | null
	created_at: string
	updated_at: string
	submitted_at: string | null
	deleted_at: string | null
}

export interface ArticleAuthor {
	id: string
	article_id: string
	full_name: string
	email: string | null
	affiliation: string | null
	orcid: string | null
	is_corresponding: boolean
	author_order: number
	created_at: string
}

export interface ArticleVersion {
	id: string
	article_id: string
	version_number: number
	version_label: string | null
	pdf_path: string
	source_path: string | null
	supplementary_paths: string[] | null
	uploaded_by: string
	notes: string | null
	created_at: string
}

export interface ReviewAssignment {
	id: string
	article_id: string
	reviewer_id: string | null
	invited_by: string
	invitation_token: string
	invitation_email: string
	status: ReviewStatus
	invited_at: string
	responded_at: string | null
	due_date: string
	completed_at: string | null
	decline_reason: string | null
	suggested_reviewers: string | null
	created_at: string
}

export interface Review {
	id: string
	assignment_id: string
	score_originality: number | null
	score_methodology: number | null
	score_clarity: number | null
	score_references: number | null
	score_overall: number | null
	strengths: string | null
	weaknesses: string | null
	comments_for_authors: string
	comments_for_editors: string | null
	recommendation: ReviewRecommendation
	has_methodology_issues: boolean
	has_statistical_errors: boolean
	has_ethical_concerns: boolean
	suspected_plagiarism: boolean
	submitted_at: string
	updated_at: string
	is_draft: boolean
}

export interface ArticleEvent {
	id: string
	article_id: string
	user_id: string | null
	event_type: string
	event_data: Record<string, unknown> | null
	created_at: string
}

export interface Notification {
	id: string
	user_id: string
	article_id: string | null
	type: string
	title: string
	message: string
	action_url: string | null
	read: boolean
	read_at: string | null
	created_at: string
}

export interface EmailTemplate {
	id: string
	name: string
	description: string | null
	subject_pt: string
	subject_en: string
	body_pt: string
	body_en: string
	variables: string[] | null
	created_at: string
	updated_at: string
}

export interface JournalSettings {
	id: string
	journal_name_pt: string
	journal_name_en: string
	issn_print: string | null
	issn_online: string | null
	publisher: string
	doi_prefix: string | null
	crossref_username: string | null
	crossref_password: string | null
	crossref_test_mode: boolean
	default_review_deadline_days: number
	min_reviewers_required: number
	enable_double_blind: boolean
	from_email: string
	from_name: string
	created_at: string
	updated_at: string
}

// Form data types (for submissions, not database rows)
export interface SubmissionFormData {
	article_type: ArticleType
	subject_area: string
	title_pt: string
	title_en: string
	abstract_pt: string
	abstract_en: string
	keywords_pt: string[]
	keywords_en: string[]
	authors: ArticleAuthorInput[]
	conflict_of_interest: string
	funding_info?: string
	data_availability?: string
	ethics_approval?: string
}

export interface ArticleAuthorInput {
	full_name: string
	email?: string
	affiliation?: string
	orcid?: string
	is_corresponding: boolean
}

// Extended Article with related data
export interface ArticleWithDetails extends Article {
	authors?: ArticleAuthor[]
	versions?: ArticleVersion[]
	review_assignments?: ReviewAssignment[]
	submitter?: UserProfile
}

// Published article view type
export interface PublishedArticle {
	id: string
	submission_number: string
	title_pt: string
	title_en: string
	abstract_pt: string
	abstract_en: string
	keywords_pt: string[]
	keywords_en: string[]
	article_type: ArticleType
	subject_area: string
	doi: string | null
	volume: number | null
	issue: number | null
	published_at: string
	authors: unknown // JSONB aggregated authors
	latest_pdf: string | null
}

// Editorial dashboard view type
export interface EditorialDashboardArticle {
	id: string
	submission_number: string
	title_pt: string
	title_en: string
	status: ArticleStatus
	article_type: ArticleType
	subject_area: string
	submitted_at: string | null
	days_since_submission: number
	submitter_name: string
	review_count?: number
	completed_reviews: number
	pending_reviews: number
}

// Input types for mutations
export interface CreateSubmissionInput {
	submitter_id: string
	title_pt: string
	title_en: string
	abstract_pt: string
	abstract_en: string
	keywords_pt: string[]
	keywords_en: string[]
	article_type: ArticleType
	subject_area: string
	conflict_of_interest: string
	funding_info?: string | null
	data_availability?: string | null
	ethics_approval?: string | null
}
