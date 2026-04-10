export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
	// Allows to automatically instantiate createClient with right options
	// instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
	__InternalSupabase: {
		PostgrestVersion: "12.2.3 (519615d)"
	}
	iefa: {
		Tables: {
			app_contributors: {
				Row: {
					app_id: string
					icon_key: string | null
					id: string
					label: string
					url: string | null
				}
				Insert: {
					app_id: string
					icon_key?: string | null
					id?: string
					label: string
					url?: string | null
				}
				Update: {
					app_id?: string
					icon_key?: string | null
					id?: string
					label?: string
					url?: string | null
				}
				Relationships: [
					{
						foreignKeyName: "app_contributors_app_id_fkey"
						columns: ["app_id"]
						isOneToOne: false
						referencedRelation: "apps"
						referencedColumns: ["id"]
					},
				]
			}
			apps: {
				Row: {
					badges: string[]
					created_at: string
					description: string
					external: boolean
					href: string | null
					icon_key: string
					id: string
					title: string
					to_path: string | null
				}
				Insert: {
					badges?: string[]
					created_at?: string
					description: string
					external?: boolean
					href?: string | null
					icon_key: string
					id?: string
					title: string
					to_path?: string | null
				}
				Update: {
					badges?: string[]
					created_at?: string
					description?: string
					external?: boolean
					href?: string | null
					icon_key?: string
					id?: string
					title?: string
					to_path?: string | null
				}
				Relationships: []
			}
			facilities_pregoeiro: {
				Row: {
					content: string | null
					created_at: string | null
					default: boolean | null
					id: string
					owner_id: string | null
					phase: string | null
					tags: string[] | null
					title: string | null
				}
				Insert: {
					content?: string | null
					created_at?: string | null
					default?: boolean | null
					id?: string
					owner_id?: string | null
					phase?: string | null
					tags?: string[] | null
					title?: string | null
				}
				Update: {
					content?: string | null
					created_at?: string | null
					default?: boolean | null
					id?: string
					owner_id?: string | null
					phase?: string | null
					tags?: string[] | null
					title?: string | null
				}
				Relationships: []
			}
			pregoeiro_preferences: {
				Row: {
					env: Json
					is_open: boolean
					table_settings: Json
					updated_at: string
					user_id: string
				}
				Insert: {
					env?: Json
					is_open?: boolean
					table_settings?: Json
					updated_at?: string
					user_id: string
				}
				Update: {
					env?: Json
					is_open?: boolean
					table_settings?: Json
					updated_at?: string
					user_id?: string
				}
				Relationships: []
			}
		}
		Views: {
			[_ in never]: never
		}
		Functions: {
			[_ in never]: never
		}
		Enums: {
			[_ in never]: never
		}
		CompositeTypes: {
			[_ in never]: never
		}
	}
	journal: {
		Tables: {
			article_authors: {
				Row: {
					affiliation: string | null
					article_id: string
					author_order: number
					created_at: string
					email: string | null
					full_name: string
					id: string
					is_corresponding: boolean | null
					orcid: string | null
				}
				Insert: {
					affiliation?: string | null
					article_id: string
					author_order: number
					created_at?: string
					email?: string | null
					full_name: string
					id?: string
					is_corresponding?: boolean | null
					orcid?: string | null
				}
				Update: {
					affiliation?: string | null
					article_id?: string
					author_order?: number
					created_at?: string
					email?: string | null
					full_name?: string
					id?: string
					is_corresponding?: boolean | null
					orcid?: string | null
				}
				Relationships: [
					{
						foreignKeyName: "article_authors_article_id_fkey"
						columns: ["article_id"]
						isOneToOne: false
						referencedRelation: "articles"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "article_authors_article_id_fkey"
						columns: ["article_id"]
						isOneToOne: false
						referencedRelation: "editorial_dashboard"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "article_authors_article_id_fkey"
						columns: ["article_id"]
						isOneToOne: false
						referencedRelation: "published_articles"
						referencedColumns: ["id"]
					},
				]
			}
			article_events: {
				Row: {
					article_id: string
					created_at: string
					event_data: Json | null
					event_type: string
					id: string
					user_id: string | null
				}
				Insert: {
					article_id: string
					created_at?: string
					event_data?: Json | null
					event_type: string
					id?: string
					user_id?: string | null
				}
				Update: {
					article_id?: string
					created_at?: string
					event_data?: Json | null
					event_type?: string
					id?: string
					user_id?: string | null
				}
				Relationships: [
					{
						foreignKeyName: "article_events_article_id_fkey"
						columns: ["article_id"]
						isOneToOne: false
						referencedRelation: "articles"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "article_events_article_id_fkey"
						columns: ["article_id"]
						isOneToOne: false
						referencedRelation: "editorial_dashboard"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "article_events_article_id_fkey"
						columns: ["article_id"]
						isOneToOne: false
						referencedRelation: "published_articles"
						referencedColumns: ["id"]
					},
				]
			}
			article_versions: {
				Row: {
					article_id: string
					created_at: string
					id: string
					notes: string | null
					pdf_path: string
					source_path: string | null
					supplementary_paths: string[] | null
					uploaded_by: string
					version_label: string | null
					version_number: number
				}
				Insert: {
					article_id: string
					created_at?: string
					id?: string
					notes?: string | null
					pdf_path: string
					source_path?: string | null
					supplementary_paths?: string[] | null
					uploaded_by: string
					version_label?: string | null
					version_number: number
				}
				Update: {
					article_id?: string
					created_at?: string
					id?: string
					notes?: string | null
					pdf_path?: string
					source_path?: string | null
					supplementary_paths?: string[] | null
					uploaded_by?: string
					version_label?: string | null
					version_number?: number
				}
				Relationships: [
					{
						foreignKeyName: "article_versions_article_id_fkey"
						columns: ["article_id"]
						isOneToOne: false
						referencedRelation: "articles"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "article_versions_article_id_fkey"
						columns: ["article_id"]
						isOneToOne: false
						referencedRelation: "editorial_dashboard"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "article_versions_article_id_fkey"
						columns: ["article_id"]
						isOneToOne: false
						referencedRelation: "published_articles"
						referencedColumns: ["id"]
					},
				]
			}
			articles: {
				Row: {
					abstract_en: string
					abstract_pt: string
					article_type: string
					conflict_of_interest: string
					created_at: string
					data_availability: string | null
					deleted_at: string | null
					doi: string | null
					ethics_approval: string | null
					funding_info: string | null
					id: string
					issue: number | null
					keywords_en: string[]
					keywords_pt: string[]
					page_end: number | null
					page_start: number | null
					published_at: string | null
					status: string
					subject_area: string
					submission_number: string
					submitted_at: string | null
					submitter_id: string
					title_en: string
					title_pt: string
					updated_at: string
					volume: number | null
				}
				Insert: {
					abstract_en: string
					abstract_pt: string
					article_type: string
					conflict_of_interest: string
					created_at?: string
					data_availability?: string | null
					deleted_at?: string | null
					doi?: string | null
					ethics_approval?: string | null
					funding_info?: string | null
					id?: string
					issue?: number | null
					keywords_en: string[]
					keywords_pt: string[]
					page_end?: number | null
					page_start?: number | null
					published_at?: string | null
					status?: string
					subject_area: string
					submission_number: string
					submitted_at?: string | null
					submitter_id: string
					title_en: string
					title_pt: string
					updated_at?: string
					volume?: number | null
				}
				Update: {
					abstract_en?: string
					abstract_pt?: string
					article_type?: string
					conflict_of_interest?: string
					created_at?: string
					data_availability?: string | null
					deleted_at?: string | null
					doi?: string | null
					ethics_approval?: string | null
					funding_info?: string | null
					id?: string
					issue?: number | null
					keywords_en?: string[]
					keywords_pt?: string[]
					page_end?: number | null
					page_start?: number | null
					published_at?: string | null
					status?: string
					subject_area?: string
					submission_number?: string
					submitted_at?: string | null
					submitter_id?: string
					title_en?: string
					title_pt?: string
					updated_at?: string
					volume?: number | null
				}
				Relationships: []
			}
			email_templates: {
				Row: {
					body_en: string
					body_pt: string
					created_at: string
					description: string | null
					id: string
					name: string
					subject_en: string
					subject_pt: string
					updated_at: string
					variables: string[] | null
				}
				Insert: {
					body_en: string
					body_pt: string
					created_at?: string
					description?: string | null
					id?: string
					name: string
					subject_en: string
					subject_pt: string
					updated_at?: string
					variables?: string[] | null
				}
				Update: {
					body_en?: string
					body_pt?: string
					created_at?: string
					description?: string | null
					id?: string
					name?: string
					subject_en?: string
					subject_pt?: string
					updated_at?: string
					variables?: string[] | null
				}
				Relationships: []
			}
			journal_settings: {
				Row: {
					created_at: string
					crossref_password: string | null
					crossref_test_mode: boolean | null
					crossref_username: string | null
					default_review_deadline_days: number | null
					doi_prefix: string | null
					enable_double_blind: boolean | null
					from_email: string
					from_name: string
					id: string
					issn_online: string | null
					issn_print: string | null
					journal_name_en: string
					journal_name_pt: string
					min_reviewers_required: number | null
					publisher: string
					updated_at: string
				}
				Insert: {
					created_at?: string
					crossref_password?: string | null
					crossref_test_mode?: boolean | null
					crossref_username?: string | null
					default_review_deadline_days?: number | null
					doi_prefix?: string | null
					enable_double_blind?: boolean | null
					from_email: string
					from_name: string
					id?: string
					issn_online?: string | null
					issn_print?: string | null
					journal_name_en: string
					journal_name_pt: string
					min_reviewers_required?: number | null
					publisher: string
					updated_at?: string
				}
				Update: {
					created_at?: string
					crossref_password?: string | null
					crossref_test_mode?: boolean | null
					crossref_username?: string | null
					default_review_deadline_days?: number | null
					doi_prefix?: string | null
					enable_double_blind?: boolean | null
					from_email?: string
					from_name?: string
					id?: string
					issn_online?: string | null
					issn_print?: string | null
					journal_name_en?: string
					journal_name_pt?: string
					min_reviewers_required?: number | null
					publisher?: string
					updated_at?: string
				}
				Relationships: []
			}
			notifications: {
				Row: {
					action_url: string | null
					article_id: string | null
					created_at: string
					id: string
					message: string
					read: boolean | null
					read_at: string | null
					title: string
					type: string
					user_id: string
				}
				Insert: {
					action_url?: string | null
					article_id?: string | null
					created_at?: string
					id?: string
					message: string
					read?: boolean | null
					read_at?: string | null
					title: string
					type: string
					user_id: string
				}
				Update: {
					action_url?: string | null
					article_id?: string | null
					created_at?: string
					id?: string
					message?: string
					read?: boolean | null
					read_at?: string | null
					title?: string
					type?: string
					user_id?: string
				}
				Relationships: [
					{
						foreignKeyName: "notifications_article_id_fkey"
						columns: ["article_id"]
						isOneToOne: false
						referencedRelation: "articles"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "notifications_article_id_fkey"
						columns: ["article_id"]
						isOneToOne: false
						referencedRelation: "editorial_dashboard"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "notifications_article_id_fkey"
						columns: ["article_id"]
						isOneToOne: false
						referencedRelation: "published_articles"
						referencedColumns: ["id"]
					},
				]
			}
			review_assignments: {
				Row: {
					article_id: string
					completed_at: string | null
					created_at: string
					decline_reason: string | null
					due_date: string
					id: string
					invitation_email: string
					invitation_token: string
					invited_at: string
					invited_by: string
					responded_at: string | null
					reviewer_id: string | null
					status: string
					suggested_reviewers: string | null
				}
				Insert: {
					article_id: string
					completed_at?: string | null
					created_at?: string
					decline_reason?: string | null
					due_date: string
					id?: string
					invitation_email: string
					invitation_token?: string
					invited_at?: string
					invited_by: string
					responded_at?: string | null
					reviewer_id?: string | null
					status?: string
					suggested_reviewers?: string | null
				}
				Update: {
					article_id?: string
					completed_at?: string | null
					created_at?: string
					decline_reason?: string | null
					due_date?: string
					id?: string
					invitation_email?: string
					invitation_token?: string
					invited_at?: string
					invited_by?: string
					responded_at?: string | null
					reviewer_id?: string | null
					status?: string
					suggested_reviewers?: string | null
				}
				Relationships: [
					{
						foreignKeyName: "review_assignments_article_id_fkey"
						columns: ["article_id"]
						isOneToOne: false
						referencedRelation: "articles"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "review_assignments_article_id_fkey"
						columns: ["article_id"]
						isOneToOne: false
						referencedRelation: "editorial_dashboard"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "review_assignments_article_id_fkey"
						columns: ["article_id"]
						isOneToOne: false
						referencedRelation: "published_articles"
						referencedColumns: ["id"]
					},
				]
			}
			reviews: {
				Row: {
					assignment_id: string
					comments_for_authors: string
					comments_for_editors: string | null
					has_ethical_concerns: boolean | null
					has_methodology_issues: boolean | null
					has_statistical_errors: boolean | null
					id: string
					is_draft: boolean | null
					recommendation: string
					score_clarity: number | null
					score_methodology: number | null
					score_originality: number | null
					score_overall: number | null
					score_references: number | null
					strengths: string | null
					submitted_at: string
					suspected_plagiarism: boolean | null
					updated_at: string
					weaknesses: string | null
				}
				Insert: {
					assignment_id: string
					comments_for_authors: string
					comments_for_editors?: string | null
					has_ethical_concerns?: boolean | null
					has_methodology_issues?: boolean | null
					has_statistical_errors?: boolean | null
					id?: string
					is_draft?: boolean | null
					recommendation: string
					score_clarity?: number | null
					score_methodology?: number | null
					score_originality?: number | null
					score_overall?: number | null
					score_references?: number | null
					strengths?: string | null
					submitted_at?: string
					suspected_plagiarism?: boolean | null
					updated_at?: string
					weaknesses?: string | null
				}
				Update: {
					assignment_id?: string
					comments_for_authors?: string
					comments_for_editors?: string | null
					has_ethical_concerns?: boolean | null
					has_methodology_issues?: boolean | null
					has_statistical_errors?: boolean | null
					id?: string
					is_draft?: boolean | null
					recommendation?: string
					score_clarity?: number | null
					score_methodology?: number | null
					score_originality?: number | null
					score_overall?: number | null
					score_references?: number | null
					strengths?: string | null
					submitted_at?: string
					suspected_plagiarism?: boolean | null
					updated_at?: string
					weaknesses?: string | null
				}
				Relationships: [
					{
						foreignKeyName: "reviews_assignment_id_fkey"
						columns: ["assignment_id"]
						isOneToOne: false
						referencedRelation: "review_assignments"
						referencedColumns: ["id"]
					},
				]
			}
			user_profiles: {
				Row: {
					affiliation: string | null
					bio: string | null
					created_at: string
					email_notifications: boolean | null
					expertise: string[] | null
					full_name: string
					id: string
					orcid: string | null
					role: string
					updated_at: string
				}
				Insert: {
					affiliation?: string | null
					bio?: string | null
					created_at?: string
					email_notifications?: boolean | null
					expertise?: string[] | null
					full_name: string
					id: string
					orcid?: string | null
					role?: string
					updated_at?: string
				}
				Update: {
					affiliation?: string | null
					bio?: string | null
					created_at?: string
					email_notifications?: boolean | null
					expertise?: string[] | null
					full_name?: string
					id?: string
					orcid?: string | null
					role?: string
					updated_at?: string
				}
				Relationships: []
			}
		}
		Views: {
			editorial_dashboard: {
				Row: {
					article_type: string | null
					completed_reviews: number | null
					days_since_submission: number | null
					id: string | null
					pending_reviews: number | null
					status: string | null
					subject_area: string | null
					submission_number: string | null
					submitted_at: string | null
					submitter_name: string | null
					title_en: string | null
				}
				Relationships: []
			}
			published_articles: {
				Row: {
					abstract_en: string | null
					abstract_pt: string | null
					article_type: string | null
					authors: Json | null
					doi: string | null
					id: string | null
					issue: number | null
					keywords_en: string[] | null
					keywords_pt: string[] | null
					latest_pdf: string | null
					published_at: string | null
					subject_area: string | null
					submission_number: string | null
					title_en: string | null
					title_pt: string | null
					volume: number | null
				}
				Insert: {
					abstract_en?: string | null
					abstract_pt?: string | null
					article_type?: string | null
					authors?: never
					doi?: string | null
					id?: string | null
					issue?: number | null
					keywords_en?: string[] | null
					keywords_pt?: string[] | null
					latest_pdf?: never
					published_at?: string | null
					subject_area?: string | null
					submission_number?: string | null
					title_en?: string | null
					title_pt?: string | null
					volume?: number | null
				}
				Update: {
					abstract_en?: string | null
					abstract_pt?: string | null
					article_type?: string | null
					authors?: never
					doi?: string | null
					id?: string | null
					issue?: number | null
					keywords_en?: string[] | null
					keywords_pt?: string[] | null
					latest_pdf?: never
					published_at?: string | null
					subject_area?: string | null
					submission_number?: string | null
					title_en?: string | null
					title_pt?: string | null
					volume?: number | null
				}
				Relationships: []
			}
		}
		Functions: {
			get_article_details: { Args: { article_uuid: string }; Returns: Json }
			is_editor: { Args: { user_uuid?: string }; Returns: boolean }
		}
		Enums: {
			[_ in never]: never
		}
		CompositeTypes: {
			[_ in never]: never
		}
	}
	sisub: {
		Tables: {
			ceafa: {
				Row: {
					created_at: string
					description: string
					id: string
					legacy_id: number | null
					quantity: number
				}
				Insert: {
					created_at?: string
					description: string
					id?: string
					legacy_id?: number | null
					quantity: number
				}
				Update: {
					created_at?: string
					description?: string
					id?: string
					legacy_id?: number | null
					quantity?: number
				}
				Relationships: []
			}
			changelog: {
				Row: {
					body: string
					id: string
					published: boolean
					published_at: string
					tags: string[] | null
					title: string
					version: string | null
				}
				Insert: {
					body: string
					id?: string
					published?: boolean
					published_at?: string
					tags?: string[] | null
					title: string
					version?: string | null
				}
				Update: {
					body?: string
					id?: string
					published?: boolean
					published_at?: string
					tags?: string[] | null
					title?: string
					version?: string | null
				}
				Relationships: []
			}
			compras_material_caracteristica: {
				Row: {
					codigo_caracteristica: string
					codigo_item: number
					codigo_valor_caracteristica: string | null
					data_hora_atualizacao: string | null
					id: number
					nome_caracteristica: string
					nome_valor_caracteristica: string | null
					numero_caracteristica: number | null
					sigla_unidade_medida: string | null
					status_caracteristica: boolean
					status_valor_caracteristica: boolean | null
					synced_at: string
				}
				Insert: {
					codigo_caracteristica: string
					codigo_item: number
					codigo_valor_caracteristica?: string | null
					data_hora_atualizacao?: string | null
					id?: number
					nome_caracteristica: string
					nome_valor_caracteristica?: string | null
					numero_caracteristica?: number | null
					sigla_unidade_medida?: string | null
					status_caracteristica?: boolean
					status_valor_caracteristica?: boolean | null
					synced_at?: string
				}
				Update: {
					codigo_caracteristica?: string
					codigo_item?: number
					codigo_valor_caracteristica?: string | null
					data_hora_atualizacao?: string | null
					id?: number
					nome_caracteristica?: string
					nome_valor_caracteristica?: string | null
					numero_caracteristica?: number | null
					sigla_unidade_medida?: string | null
					status_caracteristica?: boolean
					status_valor_caracteristica?: boolean | null
					synced_at?: string
				}
				Relationships: []
			}
			compras_material_classe: {
				Row: {
					codigo_classe: number
					codigo_grupo: number
					data_hora_atualizacao: string | null
					nome_classe: string
					status_classe: boolean
					synced_at: string
				}
				Insert: {
					codigo_classe: number
					codigo_grupo: number
					data_hora_atualizacao?: string | null
					nome_classe: string
					status_classe?: boolean
					synced_at?: string
				}
				Update: {
					codigo_classe?: number
					codigo_grupo?: number
					data_hora_atualizacao?: string | null
					nome_classe?: string
					status_classe?: boolean
					synced_at?: string
				}
				Relationships: [
					{
						foreignKeyName: "compras_material_classe_codigo_grupo_fkey"
						columns: ["codigo_grupo"]
						isOneToOne: false
						referencedRelation: "compras_material_grupo"
						referencedColumns: ["codigo_grupo"]
					},
				]
			}
			compras_material_grupo: {
				Row: {
					codigo_grupo: number
					data_hora_atualizacao: string | null
					nome_grupo: string
					status_grupo: boolean
					synced_at: string
				}
				Insert: {
					codigo_grupo: number
					data_hora_atualizacao?: string | null
					nome_grupo: string
					status_grupo?: boolean
					synced_at?: string
				}
				Update: {
					codigo_grupo?: number
					data_hora_atualizacao?: string | null
					nome_grupo?: string
					status_grupo?: boolean
					synced_at?: string
				}
				Relationships: []
			}
			compras_material_item: {
				Row: {
					aplica_margem_preferencia: boolean | null
					codigo_item: number
					codigo_ncm: string | null
					codigo_pdm: number | null
					data_hora_atualizacao: string | null
					descricao_item: string
					descricao_ncm: string | null
					first_deactivation_detected_at: string | null
					item_sustentavel: boolean | null
					status_item: boolean
					synced_at: string
				}
				Insert: {
					aplica_margem_preferencia?: boolean | null
					codigo_item: number
					codigo_ncm?: string | null
					codigo_pdm?: number | null
					data_hora_atualizacao?: string | null
					descricao_item: string
					descricao_ncm?: string | null
					first_deactivation_detected_at?: string | null
					item_sustentavel?: boolean | null
					status_item?: boolean
					synced_at?: string
				}
				Update: {
					aplica_margem_preferencia?: boolean | null
					codigo_item?: number
					codigo_ncm?: string | null
					codigo_pdm?: number | null
					data_hora_atualizacao?: string | null
					descricao_item?: string
					descricao_ncm?: string | null
					first_deactivation_detected_at?: string | null
					item_sustentavel?: boolean | null
					status_item?: boolean
					synced_at?: string
				}
				Relationships: []
			}
			compras_material_natureza_despesa: {
				Row: {
					codigo_natureza_despesa: string
					codigo_pdm: number
					id: number
					nome_natureza_despesa: string
					status_natureza_despesa: boolean
					synced_at: string
				}
				Insert: {
					codigo_natureza_despesa: string
					codigo_pdm: number
					id?: number
					nome_natureza_despesa: string
					status_natureza_despesa?: boolean
					synced_at?: string
				}
				Update: {
					codigo_natureza_despesa?: string
					codigo_pdm?: number
					id?: number
					nome_natureza_despesa?: string
					status_natureza_despesa?: boolean
					synced_at?: string
				}
				Relationships: []
			}
			compras_material_pdm: {
				Row: {
					codigo_classe: number
					codigo_pdm: number
					data_hora_atualizacao: string | null
					nome_pdm: string
					status_pdm: boolean
					synced_at: string
				}
				Insert: {
					codigo_classe: number
					codigo_pdm: number
					data_hora_atualizacao?: string | null
					nome_pdm: string
					status_pdm?: boolean
					synced_at?: string
				}
				Update: {
					codigo_classe?: number
					codigo_pdm?: number
					data_hora_atualizacao?: string | null
					nome_pdm?: string
					status_pdm?: boolean
					synced_at?: string
				}
				Relationships: [
					{
						foreignKeyName: "compras_material_pdm_codigo_classe_fkey"
						columns: ["codigo_classe"]
						isOneToOne: false
						referencedRelation: "compras_material_classe"
						referencedColumns: ["codigo_classe"]
					},
				]
			}
			compras_material_unidade_fornecimento: {
				Row: {
					capacidade_unidade_fornecimento: number | null
					codigo_pdm: number
					data_hora_atualizacao: string | null
					descricao_unidade_fornecimento: string | null
					id: number
					nome_unidade_fornecimento: string | null
					numero_sequencial_unidade_fornecimento: number | null
					sigla_unidade_fornecimento: string | null
					sigla_unidade_medida: string | null
					status_unidade_fornecimento_pdm: boolean
					synced_at: string
				}
				Insert: {
					capacidade_unidade_fornecimento?: number | null
					codigo_pdm: number
					data_hora_atualizacao?: string | null
					descricao_unidade_fornecimento?: string | null
					id?: number
					nome_unidade_fornecimento?: string | null
					numero_sequencial_unidade_fornecimento?: number | null
					sigla_unidade_fornecimento?: string | null
					sigla_unidade_medida?: string | null
					status_unidade_fornecimento_pdm?: boolean
					synced_at?: string
				}
				Update: {
					capacidade_unidade_fornecimento?: number | null
					codigo_pdm?: number
					data_hora_atualizacao?: string | null
					descricao_unidade_fornecimento?: string | null
					id?: number
					nome_unidade_fornecimento?: string | null
					numero_sequencial_unidade_fornecimento?: number | null
					sigla_unidade_fornecimento?: string | null
					sigla_unidade_medida?: string | null
					status_unidade_fornecimento_pdm?: boolean
					synced_at?: string
				}
				Relationships: []
			}
			compras_servico_classe: {
				Row: {
					codigo_classe: number
					codigo_grupo: number
					data_hora_atualizacao: string | null
					nome_classe: string
					status_grupo: boolean
					synced_at: string
				}
				Insert: {
					codigo_classe: number
					codigo_grupo: number
					data_hora_atualizacao?: string | null
					nome_classe: string
					status_grupo?: boolean
					synced_at?: string
				}
				Update: {
					codigo_classe?: number
					codigo_grupo?: number
					data_hora_atualizacao?: string | null
					nome_classe?: string
					status_grupo?: boolean
					synced_at?: string
				}
				Relationships: [
					{
						foreignKeyName: "compras_servico_classe_codigo_grupo_fkey"
						columns: ["codigo_grupo"]
						isOneToOne: false
						referencedRelation: "compras_servico_grupo"
						referencedColumns: ["codigo_grupo"]
					},
				]
			}
			compras_servico_divisao: {
				Row: {
					codigo_divisao: number
					codigo_secao: number
					data_hora_atualizacao: string | null
					nome_divisao: string
					status_divisao: boolean
					synced_at: string
				}
				Insert: {
					codigo_divisao: number
					codigo_secao: number
					data_hora_atualizacao?: string | null
					nome_divisao: string
					status_divisao?: boolean
					synced_at?: string
				}
				Update: {
					codigo_divisao?: number
					codigo_secao?: number
					data_hora_atualizacao?: string | null
					nome_divisao?: string
					status_divisao?: boolean
					synced_at?: string
				}
				Relationships: [
					{
						foreignKeyName: "compras_servico_divisao_codigo_secao_fkey"
						columns: ["codigo_secao"]
						isOneToOne: false
						referencedRelation: "compras_servico_secao"
						referencedColumns: ["codigo_secao"]
					},
				]
			}
			compras_servico_grupo: {
				Row: {
					codigo_divisao: number
					codigo_grupo: number
					data_hora_atualizacao: string | null
					nome_grupo: string
					status_grupo: boolean
					synced_at: string
				}
				Insert: {
					codigo_divisao: number
					codigo_grupo: number
					data_hora_atualizacao?: string | null
					nome_grupo: string
					status_grupo?: boolean
					synced_at?: string
				}
				Update: {
					codigo_divisao?: number
					codigo_grupo?: number
					data_hora_atualizacao?: string | null
					nome_grupo?: string
					status_grupo?: boolean
					synced_at?: string
				}
				Relationships: [
					{
						foreignKeyName: "compras_servico_grupo_codigo_divisao_fkey"
						columns: ["codigo_divisao"]
						isOneToOne: false
						referencedRelation: "compras_servico_divisao"
						referencedColumns: ["codigo_divisao"]
					},
				]
			}
			compras_servico_item: {
				Row: {
					codigo_cpc: number | null
					codigo_servico: number
					codigo_subclasse: number | null
					data_hora_atualizacao: string | null
					exclusivo_central_compras: boolean | null
					first_deactivation_detected_at: string | null
					nome_servico: string
					status_servico: boolean
					synced_at: string
				}
				Insert: {
					codigo_cpc?: number | null
					codigo_servico: number
					codigo_subclasse?: number | null
					data_hora_atualizacao?: string | null
					exclusivo_central_compras?: boolean | null
					first_deactivation_detected_at?: string | null
					nome_servico: string
					status_servico?: boolean
					synced_at?: string
				}
				Update: {
					codigo_cpc?: number | null
					codigo_servico?: number
					codigo_subclasse?: number | null
					data_hora_atualizacao?: string | null
					exclusivo_central_compras?: boolean | null
					first_deactivation_detected_at?: string | null
					nome_servico?: string
					status_servico?: boolean
					synced_at?: string
				}
				Relationships: []
			}
			compras_servico_natureza_despesa: {
				Row: {
					codigo_natureza_despesa: string
					codigo_servico: number
					id: number
					nome_natureza_despesa: string
					status_natureza_despesa: boolean
					synced_at: string
				}
				Insert: {
					codigo_natureza_despesa: string
					codigo_servico: number
					id?: number
					nome_natureza_despesa: string
					status_natureza_despesa?: boolean
					synced_at?: string
				}
				Update: {
					codigo_natureza_despesa?: string
					codigo_servico?: number
					id?: number
					nome_natureza_despesa?: string
					status_natureza_despesa?: boolean
					synced_at?: string
				}
				Relationships: []
			}
			compras_servico_secao: {
				Row: {
					codigo_secao: number
					data_hora_atualizacao: string | null
					nome_secao: string
					status_secao: boolean
					synced_at: string
				}
				Insert: {
					codigo_secao: number
					data_hora_atualizacao?: string | null
					nome_secao: string
					status_secao?: boolean
					synced_at?: string
				}
				Update: {
					codigo_secao?: number
					data_hora_atualizacao?: string | null
					nome_secao?: string
					status_secao?: boolean
					synced_at?: string
				}
				Relationships: []
			}
			compras_servico_subclasse: {
				Row: {
					codigo_classe: number
					codigo_subclasse: number
					data_hora_atualizacao: string | null
					nome_subclasse: string
					status_subclasse: boolean
					synced_at: string
				}
				Insert: {
					codigo_classe: number
					codigo_subclasse: number
					data_hora_atualizacao?: string | null
					nome_subclasse: string
					status_subclasse?: boolean
					synced_at?: string
				}
				Update: {
					codigo_classe?: number
					codigo_subclasse?: number
					data_hora_atualizacao?: string | null
					nome_subclasse?: string
					status_subclasse?: boolean
					synced_at?: string
				}
				Relationships: []
			}
			compras_servico_unidade_medida: {
				Row: {
					codigo_servico: number
					id: number
					nome_unidade_medida: string | null
					sigla_unidade_medida: string
					status_unidade_medida: boolean
					synced_at: string
				}
				Insert: {
					codigo_servico: number
					id?: number
					nome_unidade_medida?: string | null
					sigla_unidade_medida: string
					status_unidade_medida?: boolean
					synced_at?: string
				}
				Update: {
					codigo_servico?: number
					id?: number
					nome_unidade_medida?: string | null
					sigla_unidade_medida?: string
					status_unidade_medida?: boolean
					synced_at?: string
				}
				Relationships: []
			}
			compras_sync_log: {
				Row: {
					completed_steps: number
					error_message: string | null
					failed_steps: number
					finished_at: string | null
					heartbeat_at: string | null
					id: number
					started_at: string
					status: string
					stop_requested: boolean
					successful_steps: number
					total_deactivated: number
					total_steps: number
					total_upserted: number
					triggered_by: string
				}
				Insert: {
					completed_steps?: number
					error_message?: string | null
					failed_steps?: number
					finished_at?: string | null
					heartbeat_at?: string | null
					id?: number
					started_at?: string
					status?: string
					stop_requested?: boolean
					successful_steps?: number
					total_deactivated?: number
					total_steps?: number
					total_upserted?: number
					triggered_by?: string
				}
				Update: {
					completed_steps?: number
					error_message?: string | null
					failed_steps?: number
					finished_at?: string | null
					heartbeat_at?: string | null
					id?: number
					started_at?: string
					status?: string
					stop_requested?: boolean
					successful_steps?: number
					total_deactivated?: number
					total_steps?: number
					total_upserted?: number
					triggered_by?: string
				}
				Relationships: []
			}
			compras_sync_step: {
				Row: {
					current_page: number
					error_message: string | null
					finished_at: string | null
					id: number
					records_deactivated: number
					records_upserted: number
					started_at: string | null
					status: string
					step_name: string
					sync_id: number
					total_pages: number | null
				}
				Insert: {
					current_page?: number
					error_message?: string | null
					finished_at?: string | null
					id?: number
					records_deactivated?: number
					records_upserted?: number
					started_at?: string | null
					status?: string
					step_name: string
					sync_id: number
					total_pages?: number | null
				}
				Update: {
					current_page?: number
					error_message?: string | null
					finished_at?: string | null
					id?: number
					records_deactivated?: number
					records_upserted?: number
					started_at?: string | null
					status?: string
					step_name?: string
					sync_id?: number
					total_pages?: number | null
				}
				Relationships: [
					{
						foreignKeyName: "compras_sync_step_sync_id_fkey"
						columns: ["sync_id"]
						isOneToOne: false
						referencedRelation: "compras_sync_log"
						referencedColumns: ["id"]
					},
				]
			}
			daily_menu: {
				Row: {
					created_at: string
					deleted_at: string | null
					forecasted_headcount: number | null
					id: string
					kitchen_id: number | null
					meal_type_id: string | null
					service_date: string | null
					status: string | null
				}
				Insert: {
					created_at?: string
					deleted_at?: string | null
					forecasted_headcount?: number | null
					id?: string
					kitchen_id?: number | null
					meal_type_id?: string | null
					service_date?: string | null
					status?: string | null
				}
				Update: {
					created_at?: string
					deleted_at?: string | null
					forecasted_headcount?: number | null
					id?: string
					kitchen_id?: number | null
					meal_type_id?: string | null
					service_date?: string | null
					status?: string | null
				}
				Relationships: [
					{
						foreignKeyName: "daily_menu_kitchen_id_fkey"
						columns: ["kitchen_id"]
						isOneToOne: false
						referencedRelation: "kitchen"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "daily_menu_meal_type_id_fkey"
						columns: ["meal_type_id"]
						isOneToOne: false
						referencedRelation: "meal_type"
						referencedColumns: ["id"]
					},
				]
			}
			empenho: {
				Row: {
					arp_item_id: string
					created_at: string
					created_by: string | null
					data_empenho: string
					id: string
					nota_lancamento: string | null
					numero_empenho: string
					quantidade_empenhada: number
					status: string
					unit_id: number
					valor_total: number
					valor_unitario: number
				}
				Insert: {
					arp_item_id: string
					created_at?: string
					created_by?: string | null
					data_empenho: string
					id?: string
					nota_lancamento?: string | null
					numero_empenho: string
					quantidade_empenhada: number
					status?: string
					unit_id: number
					valor_total: number
					valor_unitario: number
				}
				Update: {
					arp_item_id?: string
					created_at?: string
					created_by?: string | null
					data_empenho?: string
					id?: string
					nota_lancamento?: string | null
					numero_empenho?: string
					quantidade_empenhada?: number
					status?: string
					unit_id?: number
					valor_total?: number
					valor_unitario?: number
				}
				Relationships: [
					{
						foreignKeyName: "empenho_arp_item_id_fkey"
						columns: ["arp_item_id"]
						isOneToOne: false
						referencedRelation: "procurement_arp_item"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "empenho_unit_id_fkey"
						columns: ["unit_id"]
						isOneToOne: false
						referencedRelation: "units"
						referencedColumns: ["id"]
					},
				]
			}
			folder: {
				Row: {
					created_at: string
					deleted_at: string | null
					description: string | null
					id: string
					legacy_id: number | null
					parent_id: string | null
				}
				Insert: {
					created_at?: string
					deleted_at?: string | null
					description?: string | null
					id?: string
					legacy_id?: number | null
					parent_id?: string | null
				}
				Update: {
					created_at?: string
					deleted_at?: string | null
					description?: string | null
					id?: string
					legacy_id?: number | null
					parent_id?: string | null
				}
				Relationships: []
			}
			kitchen: {
				Row: {
					address_bairro: string | null
					address_cep: string | null
					address_complemento: string | null
					address_logradouro: string | null
					address_municipio: string | null
					address_numero: string | null
					address_uf: string | null
					created_at: string
					display_name: string | null
					id: number
					kitchen_id: number | null
					purchase_unit_id: number | null
					type: Database["sisub"]["Enums"]["kitchen_type"] | null
					unit_id: number | null
				}
				Insert: {
					address_bairro?: string | null
					address_cep?: string | null
					address_complemento?: string | null
					address_logradouro?: string | null
					address_municipio?: string | null
					address_numero?: string | null
					address_uf?: string | null
					created_at?: string
					display_name?: string | null
					id?: number
					kitchen_id?: number | null
					purchase_unit_id?: number | null
					type?: Database["sisub"]["Enums"]["kitchen_type"] | null
					unit_id?: number | null
				}
				Update: {
					address_bairro?: string | null
					address_cep?: string | null
					address_complemento?: string | null
					address_logradouro?: string | null
					address_municipio?: string | null
					address_numero?: string | null
					address_uf?: string | null
					created_at?: string
					display_name?: string | null
					id?: number
					kitchen_id?: number | null
					purchase_unit_id?: number | null
					type?: Database["sisub"]["Enums"]["kitchen_type"] | null
					unit_id?: number | null
				}
				Relationships: [
					{
						foreignKeyName: "kitchen_kitchen_id_fkey"
						columns: ["kitchen_id"]
						isOneToOne: false
						referencedRelation: "kitchen"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "kitchen_purchase_unit_id_fkey"
						columns: ["purchase_unit_id"]
						isOneToOne: false
						referencedRelation: "units"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "kitchen_unit_id_fkey"
						columns: ["unit_id"]
						isOneToOne: false
						referencedRelation: "units"
						referencedColumns: ["id"]
					},
				]
			}
			kitchen_ata_draft: {
				Row: {
					created_at: string
					id: string
					kitchen_id: number
					notes: string | null
					status: string
					title: string
					updated_at: string | null
				}
				Insert: {
					created_at?: string
					id?: string
					kitchen_id: number
					notes?: string | null
					status?: string
					title: string
					updated_at?: string | null
				}
				Update: {
					created_at?: string
					id?: string
					kitchen_id?: number
					notes?: string | null
					status?: string
					title?: string
					updated_at?: string | null
				}
				Relationships: [
					{
						foreignKeyName: "kitchen_ata_draft_kitchen_id_fkey"
						columns: ["kitchen_id"]
						isOneToOne: false
						referencedRelation: "kitchen"
						referencedColumns: ["id"]
					},
				]
			}
			kitchen_ata_draft_selection: {
				Row: {
					draft_id: string
					id: string
					repetitions: number
					template_id: string
				}
				Insert: {
					draft_id: string
					id?: string
					repetitions?: number
					template_id: string
				}
				Update: {
					draft_id?: string
					id?: string
					repetitions?: number
					template_id?: string
				}
				Relationships: [
					{
						foreignKeyName: "kitchen_ata_draft_selection_draft_id_fkey"
						columns: ["draft_id"]
						isOneToOne: false
						referencedRelation: "kitchen_ata_draft"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "kitchen_ata_draft_selection_template_id_fkey"
						columns: ["template_id"]
						isOneToOne: false
						referencedRelation: "menu_template"
						referencedColumns: ["id"]
					},
				]
			}
			meal_forecasts: {
				Row: {
					created_at: string | null
					date: string
					id: string
					meal: string
					mess_hall_id: number
					updated_at: string | null
					user_id: string
					will_eat: boolean
				}
				Insert: {
					created_at?: string | null
					date: string
					id?: string
					meal: string
					mess_hall_id: number
					updated_at?: string | null
					user_id: string
					will_eat: boolean
				}
				Update: {
					created_at?: string | null
					date?: string
					id?: string
					meal?: string
					mess_hall_id?: number
					updated_at?: string | null
					user_id?: string
					will_eat?: boolean
				}
				Relationships: [
					{
						foreignKeyName: "meal_forecasts_mess_hall_id_fkey"
						columns: ["mess_hall_id"]
						isOneToOne: false
						referencedRelation: "mess_halls"
						referencedColumns: ["id"]
					},
				]
			}
			meal_presences: {
				Row: {
					created_at: string
					date: string
					id: string
					meal: string
					mess_hall_id: number
					updated_at: string | null
					user_id: string
				}
				Insert: {
					created_at?: string
					date: string
					id?: string
					meal: string
					mess_hall_id: number
					updated_at?: string | null
					user_id: string
				}
				Update: {
					created_at?: string
					date?: string
					id?: string
					meal?: string
					mess_hall_id?: number
					updated_at?: string | null
					user_id?: string
				}
				Relationships: [
					{
						foreignKeyName: "meal_presences_mess_hall_id_fkey"
						columns: ["mess_hall_id"]
						isOneToOne: false
						referencedRelation: "mess_halls"
						referencedColumns: ["id"]
					},
				]
			}
			meal_type: {
				Row: {
					created_at: string
					deleted_at: string | null
					id: string
					kitchen_id: number | null
					name: string | null
					sort_order: number | null
				}
				Insert: {
					created_at?: string
					deleted_at?: string | null
					id?: string
					kitchen_id?: number | null
					name?: string | null
					sort_order?: number | null
				}
				Update: {
					created_at?: string
					deleted_at?: string | null
					id?: string
					kitchen_id?: number | null
					name?: string | null
					sort_order?: number | null
				}
				Relationships: [
					{
						foreignKeyName: "meal_type_kitchen_id_fkey"
						columns: ["kitchen_id"]
						isOneToOne: false
						referencedRelation: "kitchen"
						referencedColumns: ["id"]
					},
				]
			}
			menu_items: {
				Row: {
					created_at: string
					daily_menu_id: string | null
					deleted_at: string | null
					excluded_from_procurement: number | null
					id: string
					planned_portion_quantity: number | null
					recipe: Json | null
					recipe_origin_id: string | null
					substitutions: Json | null
				}
				Insert: {
					created_at?: string
					daily_menu_id?: string | null
					deleted_at?: string | null
					excluded_from_procurement?: number | null
					id?: string
					planned_portion_quantity?: number | null
					recipe?: Json | null
					recipe_origin_id?: string | null
					substitutions?: Json | null
				}
				Update: {
					created_at?: string
					daily_menu_id?: string | null
					deleted_at?: string | null
					excluded_from_procurement?: number | null
					id?: string
					planned_portion_quantity?: number | null
					recipe?: Json | null
					recipe_origin_id?: string | null
					substitutions?: Json | null
				}
				Relationships: [
					{
						foreignKeyName: "menu_items_daily_menu_id_fkey"
						columns: ["daily_menu_id"]
						isOneToOne: false
						referencedRelation: "daily_menu"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "menu_items_recipe_origin_id_fkey"
						columns: ["recipe_origin_id"]
						isOneToOne: false
						referencedRelation: "recipes"
						referencedColumns: ["id"]
					},
				]
			}
			menu_template: {
				Row: {
					base_template_id: string | null
					created_at: string
					deleted_at: string | null
					description: string | null
					id: string
					kitchen_id: number | null
					name: string | null
					template_type: string
				}
				Insert: {
					base_template_id?: string | null
					created_at?: string
					deleted_at?: string | null
					description?: string | null
					id?: string
					kitchen_id?: number | null
					name?: string | null
					template_type?: string
				}
				Update: {
					base_template_id?: string | null
					created_at?: string
					deleted_at?: string | null
					description?: string | null
					id?: string
					kitchen_id?: number | null
					name?: string | null
					template_type?: string
				}
				Relationships: [
					{
						foreignKeyName: "menu_template_base_template_id_fkey"
						columns: ["base_template_id"]
						isOneToOne: false
						referencedRelation: "menu_template"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "menu_template_kitchen_id_fkey"
						columns: ["kitchen_id"]
						isOneToOne: false
						referencedRelation: "kitchen"
						referencedColumns: ["id"]
					},
				]
			}
			menu_template_items: {
				Row: {
					created_at: string
					day_of_week: number | null
					headcount_override: number | null
					id: string
					meal_type_id: string | null
					menu_template_id: string | null
					recipe_id: string | null
				}
				Insert: {
					created_at?: string
					day_of_week?: number | null
					headcount_override?: number | null
					id?: string
					meal_type_id?: string | null
					menu_template_id?: string | null
					recipe_id?: string | null
				}
				Update: {
					created_at?: string
					day_of_week?: number | null
					headcount_override?: number | null
					id?: string
					meal_type_id?: string | null
					menu_template_id?: string | null
					recipe_id?: string | null
				}
				Relationships: [
					{
						foreignKeyName: "menu_template_items_meal_type_id_fkey"
						columns: ["meal_type_id"]
						isOneToOne: false
						referencedRelation: "meal_type"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "menu_template_items_menu_template_id_fkey"
						columns: ["menu_template_id"]
						isOneToOne: false
						referencedRelation: "menu_template"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "menu_template_items_recipe_id_fkey"
						columns: ["recipe_id"]
						isOneToOne: false
						referencedRelation: "recipes"
						referencedColumns: ["id"]
					},
				]
			}
			mess_halls: {
				Row: {
					code: string
					display_name: string | null
					id: number
					kitchen_id: number | null
					unit_id: number
				}
				Insert: {
					code: string
					display_name?: string | null
					id?: number
					kitchen_id?: number | null
					unit_id: number
				}
				Update: {
					code?: string
					display_name?: string | null
					id?: number
					kitchen_id?: number | null
					unit_id?: number
				}
				Relationships: [
					{
						foreignKeyName: "mess_halls_kitchen_id_fkey"
						columns: ["kitchen_id"]
						isOneToOne: false
						referencedRelation: "kitchen"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "mess_halls_unit_fk"
						columns: ["unit_id"]
						isOneToOne: false
						referencedRelation: "units"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "mess_halls_unit_id_fkey"
						columns: ["unit_id"]
						isOneToOne: false
						referencedRelation: "units"
						referencedColumns: ["id"]
					},
				]
			}
			migration_folder_lookup: {
				Row: {
					created_at: string | null
					legacy_id_grupo_produto: number
					new_folder_id: string
				}
				Insert: {
					created_at?: string | null
					legacy_id_grupo_produto: number
					new_folder_id: string
				}
				Update: {
					created_at?: string | null
					legacy_id_grupo_produto?: number
					new_folder_id?: string
				}
				Relationships: []
			}
			migration_nutrient_lookup: {
				Row: {
					created_at: string | null
					legacy_id_nutriente: number
					new_nutrient_id: string
				}
				Insert: {
					created_at?: string | null
					legacy_id_nutriente: number
					new_nutrient_id: string
				}
				Update: {
					created_at?: string | null
					legacy_id_nutriente?: number
					new_nutrient_id?: string
				}
				Relationships: []
			}
			migration_product_lookup: {
				Row: {
					created_at: string | null
					legacy_descricao: string | null
					legacy_id_insumo: number
					new_product_id: string
				}
				Insert: {
					created_at?: string | null
					legacy_descricao?: string | null
					legacy_id_insumo: number
					new_product_id: string
				}
				Update: {
					created_at?: string | null
					legacy_descricao?: string | null
					legacy_id_insumo?: number
					new_product_id?: string
				}
				Relationships: []
			}
			migration_recipe_lookup: {
				Row: {
					created_at: string | null
					legacy_id_preparacao: number
					legacy_rendimento: number | null
					new_recipe_id: string
				}
				Insert: {
					created_at?: string | null
					legacy_id_preparacao: number
					legacy_rendimento?: number | null
					new_recipe_id: string
				}
				Update: {
					created_at?: string | null
					legacy_id_preparacao?: number
					legacy_rendimento?: number | null
					new_recipe_id?: string
				}
				Relationships: []
			}
			nutrient: {
				Row: {
					created_at: string
					daily_value: number | null
					deleted_at: string | null
					display_order: number | null
					enum_name: string | null
					id: string
					is_energy_value: boolean | null
					legacy_id: number | null
					minimum_value: number | null
					name: string
				}
				Insert: {
					created_at?: string
					daily_value?: number | null
					deleted_at?: string | null
					display_order?: number | null
					enum_name?: string | null
					id?: string
					is_energy_value?: boolean | null
					legacy_id?: number | null
					minimum_value?: number | null
					name: string
				}
				Update: {
					created_at?: string
					daily_value?: number | null
					deleted_at?: string | null
					display_order?: number | null
					enum_name?: string | null
					id?: string
					is_energy_value?: boolean | null
					legacy_id?: number | null
					minimum_value?: number | null
					name?: string
				}
				Relationships: []
			}
			opinions: {
				Row: {
					created_at: string
					id: number
					question: string | null
					userId: string | null
					value: number | null
				}
				Insert: {
					created_at?: string
					id?: number
					question?: string | null
					userId?: string | null
					value?: number | null
				}
				Update: {
					created_at?: string
					id?: number
					question?: string | null
					userId?: string | null
					value?: number | null
				}
				Relationships: []
			}
			other_presences: {
				Row: {
					admin_id: string | null
					created_at: string
					date: string
					id: number
					meal: string
					mess_hall_id: number
					updated_at: string | null
				}
				Insert: {
					admin_id?: string | null
					created_at?: string
					date: string
					id?: number
					meal: string
					mess_hall_id: number
					updated_at?: string | null
				}
				Update: {
					admin_id?: string | null
					created_at?: string
					date?: string
					id?: number
					meal?: string
					mess_hall_id?: number
					updated_at?: string | null
				}
				Relationships: [
					{
						foreignKeyName: "other_presences_mess_hall_id_fkey"
						columns: ["mess_hall_id"]
						isOneToOne: false
						referencedRelation: "mess_halls"
						referencedColumns: ["id"]
					},
				]
			}
			policy_rule: {
				Row: {
					active: boolean
					created_at: string
					deleted_at: string | null
					description: string
					display_order: number
					id: string
					target: string
					title: string
					updated_at: string
				}
				Insert: {
					active?: boolean
					created_at?: string
					deleted_at?: string | null
					description: string
					display_order?: number
					id?: string
					target: string
					title: string
					updated_at?: string
				}
				Update: {
					active?: boolean
					created_at?: string
					deleted_at?: string | null
					description?: string
					display_order?: number
					id?: string
					target?: string
					title?: string
					updated_at?: string
				}
				Relationships: []
			}
			procurement_arp: {
				Row: {
					ano_ata: string | null
					ata_id: string
					created_at: string
					data_vigencia_fim: string | null
					data_vigencia_inicio: string | null
					id: string
					last_synced_at: string | null
					nome_uasg_gerenciadora: string | null
					numero_ata: string
					objeto: string | null
					status_ata: string | null
					uasg_gerenciadora: string
					unit_id: number
				}
				Insert: {
					ano_ata?: string | null
					ata_id: string
					created_at?: string
					data_vigencia_fim?: string | null
					data_vigencia_inicio?: string | null
					id?: string
					last_synced_at?: string | null
					nome_uasg_gerenciadora?: string | null
					numero_ata: string
					objeto?: string | null
					status_ata?: string | null
					uasg_gerenciadora: string
					unit_id: number
				}
				Update: {
					ano_ata?: string | null
					ata_id?: string
					created_at?: string
					data_vigencia_fim?: string | null
					data_vigencia_inicio?: string | null
					id?: string
					last_synced_at?: string | null
					nome_uasg_gerenciadora?: string | null
					numero_ata?: string
					objeto?: string | null
					status_ata?: string | null
					uasg_gerenciadora?: string
					unit_id?: number
				}
				Relationships: [
					{
						foreignKeyName: "procurement_arp_ata_id_fkey"
						columns: ["ata_id"]
						isOneToOne: false
						referencedRelation: "procurement_ata"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "procurement_arp_unit_id_fkey"
						columns: ["unit_id"]
						isOneToOne: false
						referencedRelation: "units"
						referencedColumns: ["id"]
					},
				]
			}
			procurement_arp_item: {
				Row: {
					arp_id: string
					ata_item_id: string | null
					catmat_item_codigo: number | null
					descricao_item: string | null
					id: string
					medida_catmat: string | null
					ni_fornecedor: string | null
					nome_fornecedor: string | null
					numero_item: number | null
					quantidade_empenhada: number | null
					quantidade_homologada: number | null
					saldo_empenho: number | null
					synced_at: string
					valor_unitario: number | null
				}
				Insert: {
					arp_id: string
					ata_item_id?: string | null
					catmat_item_codigo?: number | null
					descricao_item?: string | null
					id?: string
					medida_catmat?: string | null
					ni_fornecedor?: string | null
					nome_fornecedor?: string | null
					numero_item?: number | null
					quantidade_empenhada?: number | null
					quantidade_homologada?: number | null
					saldo_empenho?: number | null
					synced_at?: string
					valor_unitario?: number | null
				}
				Update: {
					arp_id?: string
					ata_item_id?: string | null
					catmat_item_codigo?: number | null
					descricao_item?: string | null
					id?: string
					medida_catmat?: string | null
					ni_fornecedor?: string | null
					nome_fornecedor?: string | null
					numero_item?: number | null
					quantidade_empenhada?: number | null
					quantidade_homologada?: number | null
					saldo_empenho?: number | null
					synced_at?: string
					valor_unitario?: number | null
				}
				Relationships: [
					{
						foreignKeyName: "procurement_arp_item_arp_id_fkey"
						columns: ["arp_id"]
						isOneToOne: false
						referencedRelation: "procurement_arp"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "procurement_arp_item_ata_item_id_fkey"
						columns: ["ata_item_id"]
						isOneToOne: false
						referencedRelation: "procurement_ata_item"
						referencedColumns: ["id"]
					},
				]
			}
			procurement_ata: {
				Row: {
					created_at: string
					deleted_at: string | null
					id: string
					notes: string | null
					status: string
					title: string
					unit_id: number
					updated_at: string | null
				}
				Insert: {
					created_at?: string
					deleted_at?: string | null
					id?: string
					notes?: string | null
					status?: string
					title: string
					unit_id: number
					updated_at?: string | null
				}
				Update: {
					created_at?: string
					deleted_at?: string | null
					id?: string
					notes?: string | null
					status?: string
					title?: string
					unit_id?: number
					updated_at?: string | null
				}
				Relationships: [
					{
						foreignKeyName: "procurement_ata_unit_id_fkey"
						columns: ["unit_id"]
						isOneToOne: false
						referencedRelation: "units"
						referencedColumns: ["id"]
					},
				]
			}
			procurement_ata_item: {
				Row: {
					ata_id: string
					catmat_item_codigo: number | null
					catmat_item_descricao: string | null
					folder_description: string | null
					folder_id: string | null
					id: string
					measure_unit: string | null
					product_id: string | null
					product_name: string
					total_quantity: number
					total_value: number | null
					unit_price: number | null
				}
				Insert: {
					ata_id: string
					catmat_item_codigo?: number | null
					catmat_item_descricao?: string | null
					folder_description?: string | null
					folder_id?: string | null
					id?: string
					measure_unit?: string | null
					product_id?: string | null
					product_name: string
					total_quantity: number
					total_value?: number | null
					unit_price?: number | null
				}
				Update: {
					ata_id?: string
					catmat_item_codigo?: number | null
					catmat_item_descricao?: string | null
					folder_description?: string | null
					folder_id?: string | null
					id?: string
					measure_unit?: string | null
					product_id?: string | null
					product_name?: string
					total_quantity?: number
					total_value?: number | null
					unit_price?: number | null
				}
				Relationships: [
					{
						foreignKeyName: "procurement_ata_item_ata_id_fkey"
						columns: ["ata_id"]
						isOneToOne: false
						referencedRelation: "procurement_ata"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "procurement_ata_item_product_id_fkey"
						columns: ["product_id"]
						isOneToOne: false
						referencedRelation: "product"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "procurement_ata_item_product_id_fkey"
						columns: ["product_id"]
						isOneToOne: false
						referencedRelation: "v_product_kg_lt_items"
						referencedColumns: ["product_id"]
					},
				]
			}
			procurement_ata_kitchen: {
				Row: {
					ata_id: string
					delivery_notes: string | null
					id: string
					kitchen_id: number
				}
				Insert: {
					ata_id: string
					delivery_notes?: string | null
					id?: string
					kitchen_id: number
				}
				Update: {
					ata_id?: string
					delivery_notes?: string | null
					id?: string
					kitchen_id?: number
				}
				Relationships: [
					{
						foreignKeyName: "procurement_ata_kitchen_ata_id_fkey"
						columns: ["ata_id"]
						isOneToOne: false
						referencedRelation: "procurement_ata"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "procurement_ata_kitchen_kitchen_id_fkey"
						columns: ["kitchen_id"]
						isOneToOne: false
						referencedRelation: "kitchen"
						referencedColumns: ["id"]
					},
				]
			}
			procurement_ata_selection: {
				Row: {
					ata_kitchen_id: string
					id: string
					repetitions: number
					template_id: string
				}
				Insert: {
					ata_kitchen_id: string
					id?: string
					repetitions?: number
					template_id: string
				}
				Update: {
					ata_kitchen_id?: string
					id?: string
					repetitions?: number
					template_id?: string
				}
				Relationships: [
					{
						foreignKeyName: "procurement_ata_selection_ata_kitchen_id_fkey"
						columns: ["ata_kitchen_id"]
						isOneToOne: false
						referencedRelation: "procurement_ata_kitchen"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "procurement_ata_selection_template_id_fkey"
						columns: ["template_id"]
						isOneToOne: false
						referencedRelation: "menu_template"
						referencedColumns: ["id"]
					},
				]
			}
			procurement_pesquisa_preco: {
				Row: {
					ata_id: string
					created_at: string
					filter_estado: string | null
					filter_municipio_code: number | null
					filter_uasg_code: string | null
					id: string
					items_with_price: number
					items_without_catmat: number
					non_compliant_items: number
					period_months: number
					reference_method: string
					similarity_threshold: number
					total_items: number
				}
				Insert: {
					ata_id: string
					created_at?: string
					filter_estado?: string | null
					filter_municipio_code?: number | null
					filter_uasg_code?: string | null
					id?: string
					items_with_price?: number
					items_without_catmat?: number
					non_compliant_items?: number
					period_months?: number
					reference_method?: string
					similarity_threshold: number
					total_items?: number
				}
				Update: {
					ata_id?: string
					created_at?: string
					filter_estado?: string | null
					filter_municipio_code?: number | null
					filter_uasg_code?: string | null
					id?: string
					items_with_price?: number
					items_without_catmat?: number
					non_compliant_items?: number
					period_months?: number
					reference_method?: string
					similarity_threshold?: number
					total_items?: number
				}
				Relationships: [
					{
						foreignKeyName: "procurement_pesquisa_preco_ata_id_fkey"
						columns: ["ata_id"]
						isOneToOne: false
						referencedRelation: "procurement_ata"
						referencedColumns: ["id"]
					},
				]
			}
			procurement_pesquisa_preco_amostra: {
				Row: {
					capacidade_unidade_fornecimento: number | null
					codigo_uasg: string | null
					descricao_item: string | null
					esfera: string | null
					estado: string | null
					id: string
					id_compra: string
					id_item_compra: number | null
					marca: string | null
					municipio: string | null
					nome_uasg: string | null
					normalized_price: number | null
					preco_unitario: number | null
					quantidade: number | null
					reference_date: string | null
					research_item_id: string
					sample_type: string
					sigla_unidade_fornecimento: string | null
					sigla_unidade_medida: string | null
					similarity: number | null
				}
				Insert: {
					capacidade_unidade_fornecimento?: number | null
					codigo_uasg?: string | null
					descricao_item?: string | null
					esfera?: string | null
					estado?: string | null
					id?: string
					id_compra: string
					id_item_compra?: number | null
					marca?: string | null
					municipio?: string | null
					nome_uasg?: string | null
					normalized_price?: number | null
					preco_unitario?: number | null
					quantidade?: number | null
					reference_date?: string | null
					research_item_id: string
					sample_type: string
					sigla_unidade_fornecimento?: string | null
					sigla_unidade_medida?: string | null
					similarity?: number | null
				}
				Update: {
					capacidade_unidade_fornecimento?: number | null
					codigo_uasg?: string | null
					descricao_item?: string | null
					esfera?: string | null
					estado?: string | null
					id?: string
					id_compra?: string
					id_item_compra?: number | null
					marca?: string | null
					municipio?: string | null
					nome_uasg?: string | null
					normalized_price?: number | null
					preco_unitario?: number | null
					quantidade?: number | null
					reference_date?: string | null
					research_item_id?: string
					sample_type?: string
					sigla_unidade_fornecimento?: string | null
					sigla_unidade_medida?: string | null
					similarity?: number | null
				}
				Relationships: [
					{
						foreignKeyName: "procurement_pesquisa_preco_amostra_research_item_id_fkey"
						columns: ["research_item_id"]
						isOneToOne: false
						referencedRelation: "procurement_pesquisa_preco_item"
						referencedColumns: ["id"]
					},
				]
			}
			procurement_pesquisa_preco_item: {
				Row: {
					ata_item_id: string | null
					catmat_codigo: number | null
					catmat_descricao: string | null
					created_at: string
					cv_pct: number | null
					error: string | null
					id: string
					is_compliant: boolean
					measure_unit: string | null
					non_compliance_reasons: string[]
					price_max: number | null
					price_mean: number | null
					price_median: number | null
					price_min: number | null
					product_name: string
					reference_method: string | null
					reference_price: number | null
					research_id: string
					std_dev: number | null
					total_after_date_filter: number
					total_after_outlier: number
					total_after_pollution_filter: number
					total_raw: number
					unique_sources: number | null
				}
				Insert: {
					ata_item_id?: string | null
					catmat_codigo?: number | null
					catmat_descricao?: string | null
					created_at?: string
					cv_pct?: number | null
					error?: string | null
					id?: string
					is_compliant?: boolean
					measure_unit?: string | null
					non_compliance_reasons?: string[]
					price_max?: number | null
					price_mean?: number | null
					price_median?: number | null
					price_min?: number | null
					product_name: string
					reference_method?: string | null
					reference_price?: number | null
					research_id: string
					std_dev?: number | null
					total_after_date_filter?: number
					total_after_outlier?: number
					total_after_pollution_filter?: number
					total_raw?: number
					unique_sources?: number | null
				}
				Update: {
					ata_item_id?: string | null
					catmat_codigo?: number | null
					catmat_descricao?: string | null
					created_at?: string
					cv_pct?: number | null
					error?: string | null
					id?: string
					is_compliant?: boolean
					measure_unit?: string | null
					non_compliance_reasons?: string[]
					price_max?: number | null
					price_mean?: number | null
					price_median?: number | null
					price_min?: number | null
					product_name?: string
					reference_method?: string | null
					reference_price?: number | null
					research_id?: string
					std_dev?: number | null
					total_after_date_filter?: number
					total_after_outlier?: number
					total_after_pollution_filter?: number
					total_raw?: number
					unique_sources?: number | null
				}
				Relationships: [
					{
						foreignKeyName: "procurement_pesquisa_preco_item_ata_item_id_fkey"
						columns: ["ata_item_id"]
						isOneToOne: false
						referencedRelation: "procurement_ata_item"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "procurement_pesquisa_preco_item_research_id_fkey"
						columns: ["research_id"]
						isOneToOne: false
						referencedRelation: "procurement_pesquisa_preco"
						referencedColumns: ["id"]
					},
				]
			}
			product: {
				Row: {
					catmat_item_codigo: number | null
					catmat_item_descricao: string | null
					catmat_match_score: number | null
					catmat_match_status: string | null
					ceafa_id: string | null
					correction_factor: number | null
					created_at: string
					deleted_at: string | null
					density_factor: number | null
					description: string | null
					folder_id: string | null
					id: string
					legacy_id: number | null
					measure_unit: string | null
					unit_price: number | null
				}
				Insert: {
					catmat_item_codigo?: number | null
					catmat_item_descricao?: string | null
					catmat_match_score?: number | null
					catmat_match_status?: string | null
					ceafa_id?: string | null
					correction_factor?: number | null
					created_at?: string
					deleted_at?: string | null
					density_factor?: number | null
					description?: string | null
					folder_id?: string | null
					id?: string
					legacy_id?: number | null
					measure_unit?: string | null
					unit_price?: number | null
				}
				Update: {
					catmat_item_codigo?: number | null
					catmat_item_descricao?: string | null
					catmat_match_score?: number | null
					catmat_match_status?: string | null
					ceafa_id?: string | null
					correction_factor?: number | null
					created_at?: string
					deleted_at?: string | null
					density_factor?: number | null
					description?: string | null
					folder_id?: string | null
					id?: string
					legacy_id?: number | null
					measure_unit?: string | null
					unit_price?: number | null
				}
				Relationships: [
					{
						foreignKeyName: "product_catmat_item_codigo_fkey"
						columns: ["catmat_item_codigo"]
						isOneToOne: false
						referencedRelation: "compras_material_item"
						referencedColumns: ["codigo_item"]
					},
					{
						foreignKeyName: "product_ceafa_id_fkey"
						columns: ["ceafa_id"]
						isOneToOne: false
						referencedRelation: "ceafa"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "product_folder_id_fkey"
						columns: ["folder_id"]
						isOneToOne: false
						referencedRelation: "folder"
						referencedColumns: ["id"]
					},
				]
			}
			product_item: {
				Row: {
					barcode: string | null
					correction_factor: number | null
					created_at: string
					deleted_at: string | null
					description: string | null
					id: string
					product_id: string | null
					purchase_measure_unit: string | null
					unit_content_quantity: number | null
				}
				Insert: {
					barcode?: string | null
					correction_factor?: number | null
					created_at?: string
					deleted_at?: string | null
					description?: string | null
					id?: string
					product_id?: string | null
					purchase_measure_unit?: string | null
					unit_content_quantity?: number | null
				}
				Update: {
					barcode?: string | null
					correction_factor?: number | null
					created_at?: string
					deleted_at?: string | null
					description?: string | null
					id?: string
					product_id?: string | null
					purchase_measure_unit?: string | null
					unit_content_quantity?: number | null
				}
				Relationships: [
					{
						foreignKeyName: "product_item_product_id_fkey"
						columns: ["product_id"]
						isOneToOne: false
						referencedRelation: "product"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "product_item_product_id_fkey"
						columns: ["product_id"]
						isOneToOne: false
						referencedRelation: "v_product_kg_lt_items"
						referencedColumns: ["product_id"]
					},
				]
			}
			product_nutrient: {
				Row: {
					created_at: string
					deleted_at: string | null
					id: string
					nutrient_id: string
					nutrient_value: number | null
					product_id: string
				}
				Insert: {
					created_at?: string
					deleted_at?: string | null
					id?: string
					nutrient_id: string
					nutrient_value?: number | null
					product_id: string
				}
				Update: {
					created_at?: string
					deleted_at?: string | null
					id?: string
					nutrient_id?: string
					nutrient_value?: number | null
					product_id?: string
				}
				Relationships: [
					{
						foreignKeyName: "product_nutrient_nutrient_id_fkey"
						columns: ["nutrient_id"]
						isOneToOne: false
						referencedRelation: "nutrient"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "product_nutrient_product_id_fkey"
						columns: ["product_id"]
						isOneToOne: false
						referencedRelation: "product"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "product_nutrient_product_id_fkey"
						columns: ["product_id"]
						isOneToOne: false
						referencedRelation: "v_product_kg_lt_items"
						referencedColumns: ["product_id"]
					},
				]
			}
			production_task: {
				Row: {
					completed_at: string | null
					created_at: string
					id: string
					kitchen_id: number
					menu_item_id: string
					notes: string | null
					production_date: string
					started_at: string | null
					status: string
					updated_at: string | null
				}
				Insert: {
					completed_at?: string | null
					created_at?: string
					id?: string
					kitchen_id: number
					menu_item_id: string
					notes?: string | null
					production_date: string
					started_at?: string | null
					status?: string
					updated_at?: string | null
				}
				Update: {
					completed_at?: string | null
					created_at?: string
					id?: string
					kitchen_id?: number
					menu_item_id?: string
					notes?: string | null
					production_date?: string
					started_at?: string | null
					status?: string
					updated_at?: string | null
				}
				Relationships: [
					{
						foreignKeyName: "production_task_kitchen_id_fkey"
						columns: ["kitchen_id"]
						isOneToOne: false
						referencedRelation: "kitchen"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "production_task_menu_item_id_fkey"
						columns: ["menu_item_id"]
						isOneToOne: true
						referencedRelation: "menu_items"
						referencedColumns: ["id"]
					},
				]
			}
			profiles_admin: {
				Row: {
					created_at: string | null
					email: string
					id: string
					name: string | null
					om: string | null
					role: "user" | "admin" | "superadmin" | null
					saram: string
					updated_at: string | null
				}
				Insert: {
					created_at?: string | null
					email: string
					id: string
					name?: string | null
					om?: string | null
					role?: "user" | "admin" | "superadmin" | null
					saram: string
					updated_at?: string | null
				}
				Update: {
					created_at?: string | null
					email?: string
					id?: string
					name?: string | null
					om?: string | null
					role?: "user" | "admin" | "superadmin" | null
					saram?: string
					updated_at?: string | null
				}
				Relationships: []
			}
			recipe_ingredient_alternatives: {
				Row: {
					created_at: string
					id: string
					net_quantity: number | null
					priority_order: number | null
					product_id: string | null
					recipe_ingredient_id: string | null
				}
				Insert: {
					created_at?: string
					id?: string
					net_quantity?: number | null
					priority_order?: number | null
					product_id?: string | null
					recipe_ingredient_id?: string | null
				}
				Update: {
					created_at?: string
					id?: string
					net_quantity?: number | null
					priority_order?: number | null
					product_id?: string | null
					recipe_ingredient_id?: string | null
				}
				Relationships: [
					{
						foreignKeyName: "recipe_ingredient_alternatives_product_id_fkey"
						columns: ["product_id"]
						isOneToOne: false
						referencedRelation: "product"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "recipe_ingredient_alternatives_product_id_fkey"
						columns: ["product_id"]
						isOneToOne: false
						referencedRelation: "v_product_kg_lt_items"
						referencedColumns: ["product_id"]
					},
					{
						foreignKeyName: "recipe_ingredient_alternatives_recipe_ingredient_id_fkey"
						columns: ["recipe_ingredient_id"]
						isOneToOne: false
						referencedRelation: "recipe_ingredients"
						referencedColumns: ["id"]
					},
				]
			}
			recipe_ingredients: {
				Row: {
					created_at: string
					deleted_at: string | null
					id: string
					is_optional: boolean | null
					net_quantity: number | null
					priority_order: number | null
					product_id: string | null
					recipe_id: string | null
				}
				Insert: {
					created_at?: string
					deleted_at?: string | null
					id?: string
					is_optional?: boolean | null
					net_quantity?: number | null
					priority_order?: number | null
					product_id?: string | null
					recipe_id?: string | null
				}
				Update: {
					created_at?: string
					deleted_at?: string | null
					id?: string
					is_optional?: boolean | null
					net_quantity?: number | null
					priority_order?: number | null
					product_id?: string | null
					recipe_id?: string | null
				}
				Relationships: [
					{
						foreignKeyName: "recipe_ingredients_product_id_fkey"
						columns: ["product_id"]
						isOneToOne: false
						referencedRelation: "product"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "recipe_ingredients_product_id_fkey"
						columns: ["product_id"]
						isOneToOne: false
						referencedRelation: "v_product_kg_lt_items"
						referencedColumns: ["product_id"]
					},
					{
						foreignKeyName: "recipe_ingredients_recipe_id_fkey"
						columns: ["recipe_id"]
						isOneToOne: false
						referencedRelation: "recipes"
						referencedColumns: ["id"]
					},
				]
			}
			recipes: {
				Row: {
					base_recipe_id: string | null
					cooking_factor: number | null
					created_at: string
					deleted_at: string | null
					id: string
					kitchen_id: number | null
					legacy_id: number | null
					name: string
					portion_yield: number | null
					preparation_method: string | null
					preparation_time_minutes: number | null
					rational_id: string | null
					upstream_version_snapshot: number | null
					version: number
				}
				Insert: {
					base_recipe_id?: string | null
					cooking_factor?: number | null
					created_at?: string
					deleted_at?: string | null
					id?: string
					kitchen_id?: number | null
					legacy_id?: number | null
					name: string
					portion_yield?: number | null
					preparation_method?: string | null
					preparation_time_minutes?: number | null
					rational_id?: string | null
					upstream_version_snapshot?: number | null
					version: number
				}
				Update: {
					base_recipe_id?: string | null
					cooking_factor?: number | null
					created_at?: string
					deleted_at?: string | null
					id?: string
					kitchen_id?: number | null
					legacy_id?: number | null
					name?: string
					portion_yield?: number | null
					preparation_method?: string | null
					preparation_time_minutes?: number | null
					rational_id?: string | null
					upstream_version_snapshot?: number | null
					version?: number
				}
				Relationships: [
					{
						foreignKeyName: "recipes_kitchen_id_fkey"
						columns: ["kitchen_id"]
						isOneToOne: false
						referencedRelation: "kitchen"
						referencedColumns: ["id"]
					},
				]
			}
			super_admin_controller: {
				Row: {
					active: boolean | null
					created_at: string
					key: string
					value: string | null
				}
				Insert: {
					active?: boolean | null
					created_at?: string
					key: string
					value?: string | null
				}
				Update: {
					active?: boolean | null
					created_at?: string
					key?: string
					value?: string | null
				}
				Relationships: []
			}
			units: {
				Row: {
					address_bairro: string | null
					address_cep: string | null
					address_complemento: string | null
					address_logradouro: string | null
					address_municipio: string | null
					address_numero: string | null
					address_uf: string | null
					code: string
					display_name: string | null
					id: number
					type: Database["sisub"]["Enums"]["unit_type"] | null
					uasg: string | null
				}
				Insert: {
					address_bairro?: string | null
					address_cep?: string | null
					address_complemento?: string | null
					address_logradouro?: string | null
					address_municipio?: string | null
					address_numero?: string | null
					address_uf?: string | null
					code: string
					display_name?: string | null
					id?: number
					type?: Database["sisub"]["Enums"]["unit_type"] | null
					uasg?: string | null
				}
				Update: {
					address_bairro?: string | null
					address_cep?: string | null
					address_complemento?: string | null
					address_logradouro?: string | null
					address_municipio?: string | null
					address_numero?: string | null
					address_uf?: string | null
					code?: string
					display_name?: string | null
					id?: number
					type?: Database["sisub"]["Enums"]["unit_type"] | null
					uasg?: string | null
				}
				Relationships: []
			}
			user_data: {
				Row: {
					created_at: string
					default_mess_hall_id: number | null
					email: string
					id: string
					nrOrdem: string | null
				}
				Insert: {
					created_at?: string
					default_mess_hall_id?: number | null
					email: string
					id?: string
					nrOrdem?: string | null
				}
				Update: {
					created_at?: string
					default_mess_hall_id?: number | null
					email?: string
					id?: string
					nrOrdem?: string | null
				}
				Relationships: [
					{
						foreignKeyName: "user_data_default_mess_hall_id_fkey"
						columns: ["default_mess_hall_id"]
						isOneToOne: false
						referencedRelation: "mess_halls"
						referencedColumns: ["id"]
					},
				]
			}
			user_military_data: {
				Row: {
					dataAtualizacao: string | null
					nmGuerra: string | null
					nmPessoa: string | null
					nrCpf: string
					nrOrdem: string | null
					sgOrg: string | null
					sgPosto: string | null
				}
				Insert: {
					dataAtualizacao?: string | null
					nmGuerra?: string | null
					nmPessoa?: string | null
					nrCpf: string
					nrOrdem?: string | null
					sgOrg?: string | null
					sgPosto?: string | null
				}
				Update: {
					dataAtualizacao?: string | null
					nmGuerra?: string | null
					nmPessoa?: string | null
					nrCpf?: string
					nrOrdem?: string | null
					sgOrg?: string | null
					sgPosto?: string | null
				}
				Relationships: []
			}
			user_permissions: {
				Row: {
					created_at: string
					id: string
					kitchen_id: number | null
					level: number
					mess_hall_id: number | null
					module: string
					unit_id: number | null
					user_id: string
				}
				Insert: {
					created_at?: string
					id?: string
					kitchen_id?: number | null
					level?: number
					mess_hall_id?: number | null
					module: string
					unit_id?: number | null
					user_id: string
				}
				Update: {
					created_at?: string
					id?: string
					kitchen_id?: number | null
					level?: number
					mess_hall_id?: number | null
					module?: string
					unit_id?: number | null
					user_id?: string
				}
				Relationships: [
					{
						foreignKeyName: "user_permissions_kitchen_id_fkey"
						columns: ["kitchen_id"]
						isOneToOne: false
						referencedRelation: "kitchen"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "user_permissions_mess_hall_id_fkey"
						columns: ["mess_hall_id"]
						isOneToOne: false
						referencedRelation: "mess_halls"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "user_permissions_unit_id_fkey"
						columns: ["unit_id"]
						isOneToOne: false
						referencedRelation: "units"
						referencedColumns: ["id"]
					},
				]
			}
		}
		Views: {
			v_meal_presences_with_user: {
				Row: {
					created_at: string | null
					date: string | null
					display_name: string | null
					id: string | null
					meal: string | null
					mess_hall_id: number | null
					updated_at: string | null
					user_id: string | null
				}
				Relationships: [
					{
						foreignKeyName: "meal_presences_mess_hall_id_fkey"
						columns: ["mess_hall_id"]
						isOneToOne: false
						referencedRelation: "mess_halls"
						referencedColumns: ["id"]
					},
				]
			}
			v_product_kg_lt_items: {
				Row: {
					base_unit: string | null
					density_factor: number | null
					description: string | null
					item_created_at: string | null
					item_description: string | null
					kg_to_base_factor: number | null
					product_id: string | null
					product_item_id: string | null
					purchase_measure_unit: string | null
				}
				Relationships: []
			}
			v_user_identity: {
				Row: {
					display_name: string | null
					id: string | null
				}
				Relationships: []
			}
		}
		Functions: {
			catmat_match_candidates: {
				Args: { p_limit?: number; p_product_description: string }
				Returns: {
					codigo_classe: number
					codigo_item: number
					codigo_pdm: number
					descricao_item: string
					nome_classe: string
					nome_pdm: string
					score: number
					unidades: string[]
				}[]
			}
			catmat_similarity: {
				Args: { p_left: string; p_right: string }
				Returns: number
			}
			compras_sync_step_failure: {
				Args: { p_sync_id: number }
				Returns: undefined
			}
			compras_sync_step_success: {
				Args: { p_sync_id: number; p_upserted: number }
				Returns: undefined
			}
			execute_analytics_query: { Args: { query: string }; Returns: Json }
			normalize_catmat_match_text: { Args: { p_text: string }; Returns: string }
			normalize_label_text: { Args: { p_text: string }; Returns: string }
			normalize_recipe_name: { Args: { p_name: string }; Returns: string }
		}
		Enums: {
			kitchen_type: "consumption" | "production"
			unit_type: "consumption" | "purchase"
		}
		CompositeTypes: {
			[_ in never]: never
		}
	}
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
	DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals
	}
		? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
				DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals
}
	? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
			DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
			Row: infer R
		}
		? R
		: never
	: DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
		? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
				Row: infer R
			}
			? R
			: never
		: never

export type TablesInsert<
	DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
			Insert: infer I
		}
		? I
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
		? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
				Insert: infer I
			}
			? I
			: never
		: never

export type TablesUpdate<
	DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
			Update: infer U
		}
		? U
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
		? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
				Update: infer U
			}
			? U
			: never
		: never

export type Enums<
	DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
	EnumName extends DefaultSchemaEnumNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
		: never = never,
> = DefaultSchemaEnumNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals
}
	? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
	: DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
		? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
		: never

export type CompositeTypes<
	PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
	CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals
	}
		? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
		: never = never,
> = PublicCompositeTypeNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals
}
	? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
	: PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
		? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
		: never

export const Constants = {
	iefa: {
		Enums: {},
	},
	journal: {
		Enums: {},
	},
	sisub: {
		Enums: {
			kitchen_type: ["consumption", "production"],
			unit_type: ["consumption", "purchase"],
		},
	},
} as const
