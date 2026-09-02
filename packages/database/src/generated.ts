export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  access_control: {
    Tables: {
      mcp_api_keys: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          label: string
          last_used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          label: string
          last_used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          label?: string
          last_used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      policy: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          managed: boolean
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          managed?: boolean
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          managed?: boolean
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      policy_statement: {
        Row: {
          created_at: string
          id: string
          kitchen_id: number | null
          level: number
          mess_hall_id: number | null
          module: string
          policy_id: string
          unit_id: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          kitchen_id?: number | null
          level: number
          mess_hall_id?: number | null
          module: string
          policy_id: string
          unit_id?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          kitchen_id?: number | null
          level?: number
          mess_hall_id?: number | null
          module?: string
          policy_id?: string
          unit_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "policy_statement_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policy"
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
        Relationships: []
      }
      user_policy_attachment: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          policy_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          policy_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          policy_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_policy_attachment_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policy"
            referencedColumns: ["id"]
          },
        ]
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
  alpha: {
    Tables: {
      checklist_rule: {
        Row: {
          applicability: Json
          code: string
          created_at: string
          id: string
          kind: string
          legal_ref: Json
          origin: string
          origin_document_id: string | null
          origin_note_id: string | null
          prompt: string | null
          severity: string
          statement: string
          status: string
          target_field: string | null
          updated_at: string
        }
        Insert: {
          applicability?: Json
          code: string
          created_at?: string
          id?: string
          kind: string
          legal_ref?: Json
          origin: string
          origin_document_id?: string | null
          origin_note_id?: string | null
          prompt?: string | null
          severity: string
          statement: string
          status?: string
          target_field?: string | null
          updated_at?: string
        }
        Update: {
          applicability?: Json
          code?: string
          created_at?: string
          id?: string
          kind?: string
          legal_ref?: Json
          origin?: string
          origin_document_id?: string | null
          origin_note_id?: string | null
          prompt?: string | null
          severity?: string
          statement?: string
          status?: string
          target_field?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_rule_origin_document_id_fkey"
            columns: ["origin_document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_rule_origin_note_id_fkey"
            columns: ["origin_note_id"]
            isOneToOne: false
            referencedRelation: "explanatory_note"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoint_blobs: {
        Row: {
          blob: string | null
          channel: string
          checkpoint_ns: string
          thread_id: string
          type: string
          version: string
        }
        Insert: {
          blob?: string | null
          channel: string
          checkpoint_ns?: string
          thread_id: string
          type: string
          version: string
        }
        Update: {
          blob?: string | null
          channel?: string
          checkpoint_ns?: string
          thread_id?: string
          type?: string
          version?: string
        }
        Relationships: []
      }
      checkpoint_migrations: {
        Row: {
          v: number
        }
        Insert: {
          v: number
        }
        Update: {
          v?: number
        }
        Relationships: []
      }
      checkpoint_writes: {
        Row: {
          blob: string
          channel: string
          checkpoint_id: string
          checkpoint_ns: string
          idx: number
          task_id: string
          thread_id: string
          type: string | null
        }
        Insert: {
          blob: string
          channel: string
          checkpoint_id: string
          checkpoint_ns?: string
          idx: number
          task_id: string
          thread_id: string
          type?: string | null
        }
        Update: {
          blob?: string
          channel?: string
          checkpoint_id?: string
          checkpoint_ns?: string
          idx?: number
          task_id?: string
          thread_id?: string
          type?: string | null
        }
        Relationships: []
      }
      checkpoints: {
        Row: {
          checkpoint: Json
          checkpoint_id: string
          checkpoint_ns: string
          metadata: Json
          parent_checkpoint_id: string | null
          thread_id: string
          type: string | null
        }
        Insert: {
          checkpoint: Json
          checkpoint_id: string
          checkpoint_ns?: string
          metadata?: Json
          parent_checkpoint_id?: string | null
          thread_id: string
          type?: string | null
        }
        Update: {
          checkpoint?: Json
          checkpoint_id?: string
          checkpoint_ns?: string
          metadata?: Json
          parent_checkpoint_id?: string | null
          thread_id?: string
          type?: string | null
        }
        Relationships: []
      }
      compliance_finding: {
        Row: {
          category: string
          confidence: number | null
          created_at: string
          evidence_span: Json | null
          id: string
          legal_ref: Json
          message: string
          rule_id: string | null
          run_id: string
          section_path: string | null
          severity: string
          status: string
          suggestion: string | null
        }
        Insert: {
          category: string
          confidence?: number | null
          created_at?: string
          evidence_span?: Json | null
          id?: string
          legal_ref?: Json
          message: string
          rule_id?: string | null
          run_id: string
          section_path?: string | null
          severity: string
          status: string
          suggestion?: string | null
        }
        Update: {
          category?: string
          confidence?: number | null
          created_at?: string
          evidence_span?: Json | null
          id?: string
          legal_ref?: Json
          message?: string
          rule_id?: string | null
          run_id?: string
          section_path?: string | null
          severity?: string
          status?: string
          suggestion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_finding_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "checklist_rule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_finding_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "compliance_run"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_run: {
        Row: {
          discarded_findings: number
          extraction_id: string
          finished_at: string | null
          id: string
          law_document_ids: string[]
          model_document_id: string | null
          rules_applied: number
          rules_not_assessed: number
          started_at: string
          status: string
          submission_id: string
        }
        Insert: {
          discarded_findings?: number
          extraction_id: string
          finished_at?: string | null
          id?: string
          law_document_ids?: string[]
          model_document_id?: string | null
          rules_applied?: number
          rules_not_assessed?: number
          started_at?: string
          status?: string
          submission_id: string
        }
        Update: {
          discarded_findings?: number
          extraction_id?: string
          finished_at?: string | null
          id?: string
          law_document_ids?: string[]
          model_document_id?: string | null
          rules_applied?: number
          rules_not_assessed?: number
          started_at?: string
          status?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_run_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "extraction"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_run_model_document_id_fkey"
            columns: ["model_document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_run_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submission"
            referencedColumns: ["id"]
          },
        ]
      }
      document: {
        Row: {
          content_hash: string | null
          created_at: string
          document_type: string
          effective_from: string | null
          external_id: string | null
          id: string
          ingested_at: string | null
          raw_content: string | null
          source: string | null
          source_id: string | null
          superseded_at: string | null
          title: string
          updated_at: string
          version_label: string | null
          year: number | null
        }
        Insert: {
          content_hash?: string | null
          created_at?: string
          document_type: string
          effective_from?: string | null
          external_id?: string | null
          id?: string
          ingested_at?: string | null
          raw_content?: string | null
          source?: string | null
          source_id?: string | null
          superseded_at?: string | null
          title: string
          updated_at?: string
          version_label?: string | null
          year?: number | null
        }
        Update: {
          content_hash?: string | null
          created_at?: string
          document_type?: string
          effective_from?: string | null
          external_id?: string | null
          id?: string
          ingested_at?: string | null
          raw_content?: string | null
          source?: string | null
          source_id?: string | null
          superseded_at?: string | null
          title?: string
          updated_at?: string
          version_label?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "normative_source"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunk: {
        Row: {
          article: string | null
          chapter: string | null
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          embedding_model: string | null
          fts: unknown
          id: string
          is_current: boolean
          metadata: Json
          section: string | null
          token_count: number | null
        }
        Insert: {
          article?: string | null
          chapter?: string | null
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          embedding_model?: string | null
          fts?: unknown
          id?: string
          is_current?: boolean
          metadata?: Json
          section?: string | null
          token_count?: number | null
        }
        Update: {
          article?: string | null
          chapter?: string | null
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          embedding_model?: string | null
          fts?: unknown
          id?: string
          is_current?: boolean
          metadata?: Json
          section?: string | null
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunk_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
        ]
      }
      explanatory_note: {
        Row: {
          cited_refs: Json
          content: string
          created_at: string
          id: string
          node_id: string
        }
        Insert: {
          cited_refs?: Json
          content: string
          created_at?: string
          id?: string
          node_id: string
        }
        Update: {
          cited_refs?: Json
          content?: string
          created_at?: string
          id?: string
          node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "explanatory_note_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "structure_node"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction: {
        Row: {
          created_at: string
          id: string
          model: string
          payload: Json
          spans: Json
          submission_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          model: string
          payload: Json
          spans?: Json
          submission_id: string
        }
        Update: {
          created_at?: string
          id?: string
          model?: string
          payload?: Json
          spans?: Json
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extraction_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submission"
            referencedColumns: ["id"]
          },
        ]
      }
      normative_source: {
        Row: {
          authority: string
          base_url: string
          cadence: string
          created_at: string
          enabled: boolean
          id: string
          kind: string
          last_checked_at: string | null
          last_error: string | null
          updated_at: string
        }
        Insert: {
          authority: string
          base_url: string
          cadence?: string
          created_at?: string
          enabled?: boolean
          id: string
          kind: string
          last_checked_at?: string | null
          last_error?: string | null
          updated_at?: string
        }
        Update: {
          authority?: string
          base_url?: string
          cadence?: string
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          last_checked_at?: string | null
          last_error?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      placeholder: {
        Row: {
          hint: string | null
          id: string
          node_id: string
          token: string
        }
        Insert: {
          hint?: string | null
          id?: string
          node_id: string
          token: string
        }
        Update: {
          hint?: string | null
          id?: string
          node_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "placeholder_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "structure_node"
            referencedColumns: ["id"]
          },
        ]
      }
      query_log: {
        Row: {
          cited_documents: string[]
          created_at: string
          grading_retries: number
          id: string
          intent: string | null
          langsmith_run_id: string | null
          latency_ms: number | null
          original_query: string
          reformulated_query: string | null
          retrieval_iterations: number
          session_id: string
          termination_reason: string
          user_id: string | null
        }
        Insert: {
          cited_documents?: string[]
          created_at?: string
          grading_retries?: number
          id?: string
          intent?: string | null
          langsmith_run_id?: string | null
          latency_ms?: number | null
          original_query: string
          reformulated_query?: string | null
          retrieval_iterations?: number
          session_id: string
          termination_reason: string
          user_id?: string | null
        }
        Update: {
          cited_documents?: string[]
          created_at?: string
          grading_retries?: number
          id?: string
          intent?: string | null
          langsmith_run_id?: string | null
          latency_ms?: number | null
          original_query?: string
          reformulated_query?: string | null
          retrieval_iterations?: number
          session_id?: string
          termination_reason?: string
          user_id?: string | null
        }
        Relationships: []
      }
      structure_node: {
        Row: {
          body: string | null
          created_at: string
          document_id: string
          id: string
          is_required: boolean
          level: number
          ordinal: number
          path: unknown
          ref_label: string | null
          title: string
          title_embedding: string | null
          title_norm: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          document_id: string
          id?: string
          is_required?: boolean
          level: number
          ordinal: number
          path: unknown
          ref_label?: string | null
          title: string
          title_embedding?: string | null
          title_norm: string
        }
        Update: {
          body?: string | null
          created_at?: string
          document_id?: string
          id?: string
          is_required?: boolean
          level?: number
          ordinal?: number
          path?: unknown
          ref_label?: string | null
          title?: string
          title_embedding?: string | null
          title_norm?: string
        }
        Relationships: [
          {
            foreignKeyName: "structure_node_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
        ]
      }
      submission: {
        Row: {
          created_at: string
          doc_kind: string
          filename: string
          id: string
          mime_type: string
          modalidade: string | null
          objeto: string | null
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          doc_kind: string
          filename: string
          id?: string
          mime_type: string
          modalidade?: string | null
          objeto?: string | null
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          doc_kind?: string
          filename?: string
          id?: string
          mime_type?: string
          modalidade?: string | null
          objeto?: string | null
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_chunks_cosine:
        | {
            Args: { match_count?: number; query_embedding: string }
            Returns: {
              article: string
              chapter: string
              content: string
              document_id: string
              document_type: string
              id: string
              section: string
              similarity: number
              source: string
              year: number
            }[]
          }
        | {
            Args: {
              embedding_model_filter?: string
              match_count?: number
              query_embedding: string
            }
            Returns: {
              article: string
              chapter: string
              content: string
              document_id: string
              document_type: string
              id: string
              section: string
              similarity: number
              source: string
              year: number
            }[]
          }
      match_chunks_fts: {
        Args: { match_count?: number; query_text: string }
        Returns: {
          article: string
          chapter: string
          content: string
          document_id: string
          document_type: string
          id: string
          rank: number
          section: string
          source: string
          year: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  assignment_selection: {
    Tables: {
      access_grant: {
        Row: {
          active: boolean
          created_at: string
          email: string
          role: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          role?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          role?: string
        }
        Relationships: []
      }
      edition: {
        Row: {
          active: boolean
          created_at: string
          id: string
          locked: boolean
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          locked?: boolean
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          locked?: boolean
          name?: string
        }
        Relationships: []
      }
      person: {
        Row: {
          classificacao: number
          created_at: string
          edition_id: string
          estado: string | null
          hide_card: boolean
          id: number
          localidade: string | null
          nome: string
          show_card: boolean
          show_om: boolean
        }
        Insert: {
          classificacao: number
          created_at?: string
          edition_id: string
          estado?: string | null
          hide_card?: boolean
          id?: number
          localidade?: string | null
          nome: string
          show_card?: boolean
          show_om?: boolean
        }
        Update: {
          classificacao?: number
          created_at?: string
          edition_id?: string
          estado?: string | null
          hide_card?: boolean
          id?: number
          localidade?: string | null
          nome?: string
          show_card?: boolean
          show_om?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "person_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "edition"
            referencedColumns: ["id"]
          },
        ]
      }
      vacancy: {
        Row: {
          created_at: string
          edition_id: string
          estado: string | null
          id: number
          om: string | null
          total_vagas: number | null
        }
        Insert: {
          created_at?: string
          edition_id: string
          estado?: string | null
          id?: number
          om?: string | null
          total_vagas?: number | null
        }
        Update: {
          created_at?: string
          edition_id?: string
          estado?: string | null
          id?: number
          om?: string | null
          total_vagas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vacancy_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "edition"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vacancy_status: {
        Row: {
          chosen: number | null
          edition_id: string | null
          estado: string | null
          om: string | null
          total_vagas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vacancy_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "edition"
            referencedColumns: ["id"]
          },
        ]
      }
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
  compras_gov_integration: {
    Tables: {
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      compras_sync_step_failure: {
        Args: { p_sync_id: number }
        Returns: undefined
      }
      compras_sync_step_success: {
        Args: { p_sync_id: number; p_upserted: number }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  core: {
    Tables: {
      item: {
        Row: {
          catalog_scope: string
          created_at: string
          deleted_at: string | null
          description: string
          id: string
          kind: string
          measure_unit: string | null
          updated_at: string
        }
        Insert: {
          catalog_scope?: string
          created_at?: string
          deleted_at?: string | null
          description: string
          id?: string
          kind?: string
          measure_unit?: string | null
          updated_at?: string
        }
        Update: {
          catalog_scope?: string
          created_at?: string
          deleted_at?: string | null
          description?: string
          id?: string
          kind?: string
          measure_unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_measure_unit_fkey"
            columns: ["measure_unit"]
            isOneToOne: false
            referencedRelation: "measure_unit"
            referencedColumns: ["code"]
          },
        ]
      }
      measure_unit: {
        Row: {
          code: string
          created_at: string
          description: string
          dimension: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          dimension: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          dimension?: string
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
          is_training: boolean
          parent_unit_id: number | null
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
          is_training?: boolean
          parent_unit_id?: number | null
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
          is_training?: boolean
          parent_unit_id?: number | null
          type?: Database["sisub"]["Enums"]["unit_type"] | null
          uasg?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "units_parent_unit_id_fkey"
            columns: ["parent_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      analytics_chat_message: {
        Row: {
          chart: Json | null
          chart_type_override: string | null
          content: string | null
          created_at: string | null
          error: string | null
          id: string | null
          input_tokens: number | null
          langsmith_run_id: string | null
          latency_ms: number | null
          model: string | null
          output_tokens: number | null
          role: string | null
          session_id: string | null
        }
        Insert: {
          chart?: Json | null
          chart_type_override?: string | null
          content?: string | null
          created_at?: string | null
          error?: string | null
          id?: string | null
          input_tokens?: number | null
          langsmith_run_id?: string | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          role?: string | null
          session_id?: string | null
        }
        Update: {
          chart?: Json | null
          chart_type_override?: string | null
          content?: string | null
          created_at?: string | null
          error?: string | null
          id?: string | null
          input_tokens?: number | null
          langsmith_run_id?: string | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          role?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_chat_message_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "analytics_chat_session"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_chat_session: {
        Row: {
          created_at: string | null
          id: string | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      changelog: {
        Row: {
          body: string | null
          id: string | null
          published: boolean | null
          published_at: string | null
          tags: string[] | null
          title: string | null
          version: string | null
        }
        Insert: {
          body?: string | null
          id?: string | null
          published?: boolean | null
          published_at?: string | null
          tags?: string[] | null
          title?: string | null
          version?: string | null
        }
        Update: {
          body?: string | null
          id?: string | null
          published?: boolean | null
          published_at?: string | null
          tags?: string[] | null
          title?: string | null
          version?: string | null
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
          created_at: string | null
          display_name: string | null
          id: number | null
          is_training: boolean | null
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
          created_at?: string | null
          display_name?: string | null
          id?: number | null
          is_training?: boolean | null
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
          created_at?: string | null
          display_name?: string | null
          id?: number | null
          is_training?: boolean | null
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
      mess_halls: {
        Row: {
          code: string | null
          display_name: string | null
          id: number | null
          is_training: boolean | null
          kitchen_id: number | null
          unit_id: number | null
        }
        Insert: {
          code?: string | null
          display_name?: string | null
          id?: number | null
          is_training?: boolean | null
          kitchen_id?: number | null
          unit_id?: number | null
        }
        Update: {
          code?: string | null
          display_name?: string | null
          id?: number | null
          is_training?: boolean | null
          kitchen_id?: number | null
          unit_id?: number | null
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
          legacy_id_grupo_produto: number | null
          new_folder_id: string | null
        }
        Insert: {
          created_at?: string | null
          legacy_id_grupo_produto?: number | null
          new_folder_id?: string | null
        }
        Update: {
          created_at?: string | null
          legacy_id_grupo_produto?: number | null
          new_folder_id?: string | null
        }
        Relationships: []
      }
      migration_nutrient_lookup: {
        Row: {
          created_at: string | null
          legacy_id_nutriente: number | null
          new_nutrient_id: string | null
        }
        Insert: {
          created_at?: string | null
          legacy_id_nutriente?: number | null
          new_nutrient_id?: string | null
        }
        Update: {
          created_at?: string | null
          legacy_id_nutriente?: number | null
          new_nutrient_id?: string | null
        }
        Relationships: []
      }
      migration_product_lookup: {
        Row: {
          created_at: string | null
          legacy_descricao: string | null
          legacy_id_insumo: number | null
          new_product_id: string | null
        }
        Insert: {
          created_at?: string | null
          legacy_descricao?: string | null
          legacy_id_insumo?: number | null
          new_product_id?: string | null
        }
        Update: {
          created_at?: string | null
          legacy_descricao?: string | null
          legacy_id_insumo?: number | null
          new_product_id?: string | null
        }
        Relationships: []
      }
      migration_recipe_lookup: {
        Row: {
          created_at: string | null
          legacy_id_preparacao: number | null
          legacy_rendimento: number | null
          new_recipe_id: string | null
        }
        Insert: {
          created_at?: string | null
          legacy_id_preparacao?: number | null
          legacy_rendimento?: number | null
          new_recipe_id?: string | null
        }
        Update: {
          created_at?: string | null
          legacy_id_preparacao?: number | null
          legacy_rendimento?: number | null
          new_recipe_id?: string | null
        }
        Relationships: []
      }
      module_chat_message: {
        Row: {
          content: string | null
          created_at: string | null
          error: string | null
          id: string | null
          input_tokens: number | null
          langsmith_run_id: string | null
          latency_ms: number | null
          model: string | null
          output_tokens: number | null
          role: string | null
          session_id: string | null
          tool_call_id: string | null
          tool_calls: Json | null
          tool_name: string | null
          tool_result: Json | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          error?: string | null
          id?: string | null
          input_tokens?: number | null
          langsmith_run_id?: string | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          role?: string | null
          session_id?: string | null
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          error?: string | null
          id?: string | null
          input_tokens?: number | null
          langsmith_run_id?: string | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          role?: string | null
          session_id?: string | null
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "module_chat_message_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "module_chat_session"
            referencedColumns: ["id"]
          },
        ]
      }
      module_chat_session: {
        Row: {
          created_at: string | null
          id: string | null
          module: string | null
          scope_id: number | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          module?: string | null
          scope_id?: number | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          module?: string | null
          scope_id?: number | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      opinions: {
        Row: {
          created_at: string | null
          id: number | null
          question: string | null
          userId: string | null
          value: number | null
        }
        Insert: {
          created_at?: string | null
          id?: number | null
          question?: string | null
          userId?: string | null
          value?: number | null
        }
        Update: {
          created_at?: string | null
          id?: number | null
          question?: string | null
          userId?: string | null
          value?: number | null
        }
        Relationships: []
      }
      rancho: {
        Row: {
          active: boolean | null
          code: string | null
          created_at: string | null
          display_name: string | null
          elo_code: string | null
          id: number | null
          kitchen_id: number | null
          mess_hall_id: number | null
          notes: string | null
          produces_own_meals: boolean | null
          unit_id: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          code?: string | null
          created_at?: string | null
          display_name?: string | null
          elo_code?: string | null
          id?: number | null
          kitchen_id?: number | null
          mess_hall_id?: number | null
          notes?: string | null
          produces_own_meals?: boolean | null
          unit_id?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          code?: string | null
          created_at?: string | null
          display_name?: string | null
          elo_code?: string | null
          id?: number | null
          kitchen_id?: number | null
          mess_hall_id?: number | null
          notes?: string | null
          produces_own_meals?: boolean | null
          unit_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rancho_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancho_mess_hall_id_fkey"
            columns: ["mess_hall_id"]
            isOneToOne: false
            referencedRelation: "mess_halls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancho_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admin_controller: {
        Row: {
          active: boolean | null
          created_at: string | null
          key: string | null
          value: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          key?: string | null
          value?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          key?: string | null
          value?: string | null
        }
        Relationships: []
      }
      training_reset_log: {
        Row: {
          actor_id: string | null
          deleted_counts: Json | null
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string | null
          queued_ms: number | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          actor_id?: string | null
          deleted_counts?: Json | null
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string | null
          queued_ms?: number | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          actor_id?: string | null
          deleted_counts?: Json | null
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string | null
          queued_ms?: number | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      v_measure_unit_review: {
        Row: {
          raw_value: string | null
          source_description: string | null
          source_id: string | null
          source_table: string | null
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
      workforce_category: {
        Row: {
          code: string | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          id: string | null
          is_career: boolean | null
          is_technical: boolean | null
          name: string | null
          sort_order: number | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string | null
          is_career?: boolean | null
          is_technical?: boolean | null
          name?: string | null
          sort_order?: number | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string | null
          is_career?: boolean | null
          is_technical?: boolean | null
          name?: string | null
          sort_order?: number | null
        }
        Relationships: []
      }
      workforce_headcount: {
        Row: {
          category_id: string | null
          created_at: string | null
          headcount: number | null
          id: string | null
          submission_id: string | null
          updated_at: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          headcount?: number | null
          id?: string | null
          submission_id?: string | null
          updated_at?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          headcount?: number | null
          id?: string | null
          submission_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workforce_headcount_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "workforce_category"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workforce_headcount_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "workforce_submission"
            referencedColumns: ["id"]
          },
        ]
      }
      workforce_note: {
        Row: {
          created_at: string | null
          detail: string | null
          id: string | null
          kind: string | null
          quantity: number | null
          submission_id: string | null
        }
        Insert: {
          created_at?: string | null
          detail?: string | null
          id?: string | null
          kind?: string | null
          quantity?: number | null
          submission_id?: string | null
        }
        Update: {
          created_at?: string | null
          detail?: string | null
          id?: string | null
          kind?: string | null
          quantity?: number | null
          submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workforce_note_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "workforce_submission"
            referencedColumns: ["id"]
          },
        ]
      }
      workforce_submission: {
        Row: {
          created_at: string | null
          declared_total: number | null
          id: string | null
          rancho_id: number | null
          submitted_at: string | null
          submitted_by: string | null
          survey_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          declared_total?: number | null
          id?: string | null
          rancho_id?: number | null
          submitted_at?: string | null
          submitted_by?: string | null
          survey_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          declared_total?: number | null
          id?: string | null
          rancho_id?: number | null
          submitted_at?: string | null
          submitted_by?: string | null
          survey_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workforce_submission_rancho_id_fkey"
            columns: ["rancho_id"]
            isOneToOne: false
            referencedRelation: "rancho"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workforce_submission_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "workforce_survey"
            referencedColumns: ["id"]
          },
        ]
      }
      workforce_survey: {
        Row: {
          closed_at: string | null
          created_at: string | null
          created_by: string | null
          id: string | null
          opened_at: string | null
          reference_date: string | null
          source: string | null
          status: string | null
          title: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          opened_at?: string | null
          reference_date?: string | null
          source?: string | null
          status?: string | null
          title?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          opened_at?: string | null
          reference_date?: string | null
          source?: string | null
          status?: string | null
          title?: string | null
        }
        Relationships: []
      }
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
  documents: {
    Tables: {
      ai_generation: {
        Row: {
          created_at: string
          document_id: string | null
          erro: string | null
          especie: string
          id: string
          modo: string
          owner_id: string
          rascunho: string
          resultado: Json | null
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          erro?: string | null
          especie: string
          id?: string
          modo: string
          owner_id: string
          rascunho: string
          resultado?: Json | null
        }
        Update: {
          created_at?: string
          document_id?: string | null
          erro?: string | null
          especie?: string
          id?: string
          modo?: string
          owner_id?: string
          rascunho?: string
          resultado?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_generation_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "official_document"
            referencedColumns: ["id"]
          },
        ]
      }
      official_document: {
        Row: {
          ambito: string
          created_at: string
          deleted_at: string | null
          especie: string
          id: string
          owner_id: string
          payload: Json
          sigilo: string
          titulo: string | null
          updated_at: string
        }
        Insert: {
          ambito: string
          created_at?: string
          deleted_at?: string | null
          especie: string
          id?: string
          owner_id: string
          payload: Json
          sigilo?: string
          titulo?: string | null
          updated_at?: string
        }
        Update: {
          ambito?: string
          created_at?: string
          deleted_at?: string | null
          especie?: string
          id?: string
          owner_id?: string
          payload?: Json
          sigilo?: string
          titulo?: string | null
          updated_at?: string
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
  finance: {
    Tables: {
      budget_credit: {
        Row: {
          competencia: string
          created_at: string
          dotacao: number
          empenhado_siafi: number
          fonte: string | null
          id: string
          import_batch_id: string | null
          nd: string
          ptres: string | null
          saldo_siafi: number
          snapshot_at: string
          ug: string | null
          unit_id: number
        }
        Insert: {
          competencia: string
          created_at?: string
          dotacao?: number
          empenhado_siafi?: number
          fonte?: string | null
          id?: string
          import_batch_id?: string | null
          nd: string
          ptres?: string | null
          saldo_siafi?: number
          snapshot_at?: string
          ug?: string | null
          unit_id: number
        }
        Update: {
          competencia?: string
          created_at?: string
          dotacao?: number
          empenhado_siafi?: number
          fonte?: string | null
          id?: string
          import_batch_id?: string | null
          nd?: string
          ptres?: string | null
          saldo_siafi?: number
          snapshot_at?: string
          ug?: string | null
          unit_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_credit_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "v_siafi_reconciliation"
            referencedColumns: ["batch_id"]
          },
        ]
      }
      empenho: {
        Row: {
          arp_item_id: string
          created_at: string
          created_by: string | null
          data_empenho: string
          exercicio: number | null
          favorecido_cnpj: string | null
          favorecido_nome: string | null
          fonte: string | null
          id: string
          import_batch_id: string | null
          nd: string | null
          nota_lancamento: string | null
          numero_empenho: string
          origem: string
          ptres: string | null
          quantidade_empenhada: number
          rp_exercicio: number | null
          rp_inscrito: boolean
          rp_tipo: string | null
          siafi_synced_at: string | null
          status: string
          tipo: string | null
          ug_emitente: string | null
          unit_id: number
          valor_total: number
          valor_unitario: number
        }
        Insert: {
          arp_item_id: string
          created_at?: string
          created_by?: string | null
          data_empenho: string
          exercicio?: number | null
          favorecido_cnpj?: string | null
          favorecido_nome?: string | null
          fonte?: string | null
          id?: string
          import_batch_id?: string | null
          nd?: string | null
          nota_lancamento?: string | null
          numero_empenho: string
          origem?: string
          ptres?: string | null
          quantidade_empenhada: number
          rp_exercicio?: number | null
          rp_inscrito?: boolean
          rp_tipo?: string | null
          siafi_synced_at?: string | null
          status?: string
          tipo?: string | null
          ug_emitente?: string | null
          unit_id: number
          valor_total: number
          valor_unitario: number
        }
        Update: {
          arp_item_id?: string
          created_at?: string
          created_by?: string | null
          data_empenho?: string
          exercicio?: number | null
          favorecido_cnpj?: string | null
          favorecido_nome?: string | null
          fonte?: string | null
          id?: string
          import_batch_id?: string | null
          nd?: string | null
          nota_lancamento?: string | null
          numero_empenho?: string
          origem?: string
          ptres?: string | null
          quantidade_empenhada?: number
          rp_exercicio?: number | null
          rp_inscrito?: boolean
          rp_tipo?: string | null
          siafi_synced_at?: string | null
          status?: string
          tipo?: string | null
          ug_emitente?: string | null
          unit_id?: number
          valor_total?: number
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "empenho_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "v_siafi_reconciliation"
            referencedColumns: ["batch_id"]
          },
        ]
      }
      empenho_event: {
        Row: {
          created_at: string
          created_by: string | null
          data: string
          documento: string | null
          empenho_id: string
          id: string
          justificativa: string
          origem: string
          tipo: string
          valor: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: string
          documento?: string | null
          empenho_id: string
          id?: string
          justificativa: string
          origem?: string
          tipo: string
          valor: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string
          documento?: string | null
          empenho_id?: string
          id?: string
          justificativa?: string
          origem?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "empenho_event_empenho_id_fkey"
            columns: ["empenho_id"]
            isOneToOne: false
            referencedRelation: "empenho"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empenho_event_empenho_id_fkey"
            columns: ["empenho_id"]
            isOneToOne: false
            referencedRelation: "v_empenho_saldo"
            referencedColumns: ["empenho_id"]
          },
          {
            foreignKeyName: "empenho_event_empenho_id_fkey"
            columns: ["empenho_id"]
            isOneToOne: false
            referencedRelation: "v_empenho_vigente"
            referencedColumns: ["empenho_id"]
          },
        ]
      }
      liquidacao: {
        Row: {
          competencia: string | null
          created_at: string
          created_by: string | null
          data: string
          empenho_id: string
          goods_receipt_id: string | null
          id: string
          import_batch_id: string | null
          nfe_document_id: string | null
          numero_ns: string
          observacao: string | null
          origem: string
          unit_id: number
          valor: number
        }
        Insert: {
          competencia?: string | null
          created_at?: string
          created_by?: string | null
          data: string
          empenho_id: string
          goods_receipt_id?: string | null
          id?: string
          import_batch_id?: string | null
          nfe_document_id?: string | null
          numero_ns: string
          observacao?: string | null
          origem?: string
          unit_id: number
          valor: number
        }
        Update: {
          competencia?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          empenho_id?: string
          goods_receipt_id?: string | null
          id?: string
          import_batch_id?: string | null
          nfe_document_id?: string | null
          numero_ns?: string
          observacao?: string | null
          origem?: string
          unit_id?: number
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "liquidacao_empenho_id_fkey"
            columns: ["empenho_id"]
            isOneToOne: false
            referencedRelation: "empenho"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidacao_empenho_id_fkey"
            columns: ["empenho_id"]
            isOneToOne: false
            referencedRelation: "v_empenho_saldo"
            referencedColumns: ["empenho_id"]
          },
          {
            foreignKeyName: "liquidacao_empenho_id_fkey"
            columns: ["empenho_id"]
            isOneToOne: false
            referencedRelation: "v_empenho_vigente"
            referencedColumns: ["empenho_id"]
          },
          {
            foreignKeyName: "liquidacao_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "v_physical_accounting_reconciliation"
            referencedColumns: ["goods_receipt_id"]
          },
          {
            foreignKeyName: "liquidacao_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "v_siafi_reconciliation"
            referencedColumns: ["batch_id"]
          },
        ]
      }
      pagamento: {
        Row: {
          agencia: string | null
          banco: string | null
          conta: string | null
          created_at: string
          created_by: string | null
          data: string
          id: string
          import_batch_id: string | null
          liquidacao_id: string
          numero_ob: string
          origem: string
          unit_id: number
          valor: number
        }
        Insert: {
          agencia?: string | null
          banco?: string | null
          conta?: string | null
          created_at?: string
          created_by?: string | null
          data: string
          id?: string
          import_batch_id?: string | null
          liquidacao_id: string
          numero_ob: string
          origem?: string
          unit_id: number
          valor: number
        }
        Update: {
          agencia?: string | null
          banco?: string | null
          conta?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          import_batch_id?: string | null
          liquidacao_id?: string
          numero_ob?: string
          origem?: string
          unit_id?: number
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamento_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "v_siafi_reconciliation"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "pagamento_liquidacao_id_fkey"
            columns: ["liquidacao_id"]
            isOneToOne: false
            referencedRelation: "liquidacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamento_liquidacao_id_fkey"
            columns: ["liquidacao_id"]
            isOneToOne: false
            referencedRelation: "v_physical_accounting_reconciliation"
            referencedColumns: ["liquidacao_id"]
          },
        ]
      }
      reconciliation_decision: {
        Row: {
          decided_at: string
          decided_by: string | null
          decisao: string
          documento_tipo: string
          id: string
          justificativa: string | null
          numero_documento: string
          unit_id: number
          valor_siafi: number | null
          valor_sisub: number | null
        }
        Insert: {
          decided_at?: string
          decided_by?: string | null
          decisao: string
          documento_tipo: string
          id?: string
          justificativa?: string | null
          numero_documento: string
          unit_id: number
          valor_siafi?: number | null
          valor_sisub?: number | null
        }
        Update: {
          decided_at?: string
          decided_by?: string | null
          decisao?: string
          documento_tipo?: string
          id?: string
          justificativa?: string | null
          numero_documento?: string
          unit_id?: number
          valor_siafi?: number | null
          valor_sisub?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      v_empenho_saldo: {
        Row: {
          ajustes: number | null
          empenho_id: string | null
          saldo_a_liquidar: number | null
          unit_id: number | null
          valor_a_pagar: number | null
          valor_liquidado: number | null
          valor_original: number | null
          valor_pago: number | null
          valor_vigente: number | null
        }
        Relationships: []
      }
      v_empenho_vigente: {
        Row: {
          ajustes: number | null
          empenho_id: string | null
          unit_id: number | null
          valor_original: number | null
          valor_vigente: number | null
        }
        Relationships: []
      }
      v_physical_accounting_reconciliation: {
        Row: {
          definitive_at: string | null
          dias_desde_recebimento: number | null
          goods_receipt_id: string | null
          kitchen_id: number | null
          liquidacao_id: string | null
          numero_ns: string | null
          situacao: string | null
          valor_liquidado: number | null
          valor_recebido: number | null
        }
        Relationships: []
      }
      v_siafi_reconciliation: {
        Row: {
          batch_id: string | null
          decisao: string | null
          decisao_vigente: boolean | null
          diferenca: number | null
          documento_tipo: string | null
          justificativa: string | null
          lote_em: string | null
          numero_documento: string | null
          situacao: string | null
          unit_id: number | null
          valor_siafi: number | null
          valor_sisub: number | null
        }
        Relationships: []
      }
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
  forms: {
    Tables: {
      om_option: {
        Row: {
          active: boolean
          id: number
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          id?: number
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          id?: number
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      question: {
        Row: {
          created_at: string
          description: string | null
          id: string
          options: Json | null
          required: boolean
          section_id: string
          sort_order: number
          text: string
          type: Database["forms"]["Enums"]["question_type"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          options?: Json | null
          required?: boolean
          section_id: string
          sort_order?: number
          text: string
          type?: Database["forms"]["Enums"]["question_type"]
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          options?: Json | null
          required?: boolean
          section_id?: string
          sort_order?: number
          text?: string
          type?: Database["forms"]["Enums"]["question_type"]
        }
        Relationships: [
          {
            foreignKeyName: "question_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "section"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaire: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          response_metadata_config: Json
          status: Database["forms"]["Enums"]["questionnaire_status"]
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          response_metadata_config?: Json
          status?: Database["forms"]["Enums"]["questionnaire_status"]
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          response_metadata_config?: Json
          status?: Database["forms"]["Enums"]["questionnaire_status"]
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      questionnaire_editor: {
        Row: {
          added_by: string
          created_at: string
          editor_email: string
          editor_id: string
          id: string
          questionnaire_id: string
        }
        Insert: {
          added_by: string
          created_at?: string
          editor_email: string
          editor_id: string
          id?: string
          questionnaire_id: string
        }
        Update: {
          added_by?: string
          created_at?: string
          editor_email?: string
          editor_id?: string
          id?: string
          questionnaire_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "questionnaire_editor_questionnaire_id_fkey"
            columns: ["questionnaire_id"]
            isOneToOne: false
            referencedRelation: "questionnaire"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaire_response: {
        Row: {
          current_version: number | null
          evaluation_type: Database["forms"]["Enums"]["evaluation_type"] | null
          id: string
          om: string | null
          questionnaire_id: string
          respondent_id: string
          secao: string | null
          started_at: string
          status: Database["forms"]["Enums"]["questionnaire_response_status"]
          submitted_at: string | null
        }
        Insert: {
          current_version?: number | null
          evaluation_type?: Database["forms"]["Enums"]["evaluation_type"] | null
          id?: string
          om?: string | null
          questionnaire_id: string
          respondent_id: string
          secao?: string | null
          started_at?: string
          status?: Database["forms"]["Enums"]["questionnaire_response_status"]
          submitted_at?: string | null
        }
        Update: {
          current_version?: number | null
          evaluation_type?: Database["forms"]["Enums"]["evaluation_type"] | null
          id?: string
          om?: string | null
          questionnaire_id?: string
          respondent_id?: string
          secao?: string | null
          started_at?: string
          status?: Database["forms"]["Enums"]["questionnaire_response_status"]
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questionnaire_response_questionnaire_id_fkey"
            columns: ["questionnaire_id"]
            isOneToOne: false
            referencedRelation: "questionnaire"
            referencedColumns: ["id"]
          },
        ]
      }
      response: {
        Row: {
          id: string
          observation: string | null
          question_id: string
          questionnaire_response_id: string
          updated_at: string
          value: Json | null
        }
        Insert: {
          id?: string
          observation?: string | null
          question_id: string
          questionnaire_response_id: string
          updated_at?: string
          value?: Json | null
        }
        Update: {
          id?: string
          observation?: string | null
          question_id?: string
          questionnaire_response_id?: string
          updated_at?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "response_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_questionnaire_response_id_fkey"
            columns: ["questionnaire_response_id"]
            isOneToOne: false
            referencedRelation: "questionnaire_response"
            referencedColumns: ["id"]
          },
        ]
      }
      response_version: {
        Row: {
          answers: Json
          created_at: string
          evaluation_type: string | null
          id: string
          om: string | null
          questionnaire_response_id: string
          secao: string | null
          submitted_at: string
          version_number: number
        }
        Insert: {
          answers: Json
          created_at?: string
          evaluation_type?: string | null
          id?: string
          om?: string | null
          questionnaire_response_id: string
          secao?: string | null
          submitted_at: string
          version_number: number
        }
        Update: {
          answers?: Json
          created_at?: string
          evaluation_type?: string | null
          id?: string
          om?: string | null
          questionnaire_response_id?: string
          secao?: string | null
          submitted_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "response_version_questionnaire_response_id_fkey"
            columns: ["questionnaire_response_id"]
            isOneToOne: false
            referencedRelation: "questionnaire_response"
            referencedColumns: ["id"]
          },
        ]
      }
      response_viewer: {
        Row: {
          added_by: string
          created_at: string
          id: string
          questionnaire_id: string
          scope_mode: Database["forms"]["Enums"]["response_scope_mode"]
          viewer_email: string
          viewer_id: string
        }
        Insert: {
          added_by: string
          created_at?: string
          id?: string
          questionnaire_id: string
          scope_mode?: Database["forms"]["Enums"]["response_scope_mode"]
          viewer_email: string
          viewer_id: string
        }
        Update: {
          added_by?: string
          created_at?: string
          id?: string
          questionnaire_id?: string
          scope_mode?: Database["forms"]["Enums"]["response_scope_mode"]
          viewer_email?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "response_viewer_questionnaire_id_fkey"
            columns: ["questionnaire_id"]
            isOneToOne: false
            referencedRelation: "questionnaire"
            referencedColumns: ["id"]
          },
        ]
      }
      response_viewer_scope_binding: {
        Row: {
          attribute_key: string
          created_at: string
          effect: Database["forms"]["Enums"]["response_scope_effect"]
          id: string
          response_viewer_id: string
          value: string
        }
        Insert: {
          attribute_key: string
          created_at?: string
          effect: Database["forms"]["Enums"]["response_scope_effect"]
          id?: string
          response_viewer_id: string
          value: string
        }
        Update: {
          attribute_key?: string
          created_at?: string
          effect?: Database["forms"]["Enums"]["response_scope_effect"]
          id?: string
          response_viewer_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "response_viewer_scope_binding_response_viewer_id_fkey"
            columns: ["response_viewer_id"]
            isOneToOne: false
            referencedRelation: "response_viewer"
            referencedColumns: ["id"]
          },
        ]
      }
      section: {
        Row: {
          created_at: string
          description: string | null
          id: string
          questionnaire_id: string
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          questionnaire_id: string
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          questionnaire_id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_questionnaire_id_fkey"
            columns: ["questionnaire_id"]
            isOneToOne: false
            referencedRelation: "questionnaire"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      lookup_user_id_by_email: { Args: { p_email: string }; Returns: string }
    }
    Enums: {
      evaluation_type:
        | "auditoria_interna"
        | "auditoria_externa"
        | "preparatoria"
      question_type:
        | "text"
        | "textarea"
        | "single_choice"
        | "multiple_choice"
        | "number"
        | "date"
        | "scale"
        | "boolean"
        | "conformity"
      questionnaire_response_status: "draft" | "sent"
      questionnaire_status: "draft" | "sent"
      response_scope_effect: "allow" | "deny"
      response_scope_mode: "global" | "scoped"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  gs1_integration: {
    Tables: {
      gpc_attribute: {
        Row: {
          attribute_code: string
          attribute_title: string
          synced_at: string
        }
        Insert: {
          attribute_code: string
          attribute_title: string
          synced_at?: string
        }
        Update: {
          attribute_code?: string
          attribute_title?: string
          synced_at?: string
        }
        Relationships: []
      }
      gpc_attribute_value: {
        Row: {
          attribute_code: string
          synced_at: string
          value_code: string
          value_title: string
        }
        Insert: {
          attribute_code: string
          synced_at?: string
          value_code: string
          value_title: string
        }
        Update: {
          attribute_code?: string
          synced_at?: string
          value_code?: string
          value_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "gpc_attribute_value_attribute_code_fkey"
            columns: ["attribute_code"]
            isOneToOne: false
            referencedRelation: "gpc_attribute"
            referencedColumns: ["attribute_code"]
          },
        ]
      }
      gpc_brick: {
        Row: {
          brick_code: string
          brick_title: string
          class_code: string
          class_title: string
          family_code: string
          family_title: string
          segment_code: string
          segment_title: string
          synced_at: string
        }
        Insert: {
          brick_code: string
          brick_title: string
          class_code: string
          class_title: string
          family_code: string
          family_title: string
          segment_code: string
          segment_title: string
          synced_at?: string
        }
        Update: {
          brick_code?: string
          brick_title?: string
          class_code?: string
          class_title?: string
          family_code?: string
          family_title?: string
          segment_code?: string
          segment_title?: string
          synced_at?: string
        }
        Relationships: []
      }
      gpc_brick_attribute: {
        Row: {
          attribute_code: string
          brick_code: string
          synced_at: string
        }
        Insert: {
          attribute_code: string
          brick_code: string
          synced_at?: string
        }
        Update: {
          attribute_code?: string
          brick_code?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gpc_brick_attribute_attribute_code_fkey"
            columns: ["attribute_code"]
            isOneToOne: false
            referencedRelation: "gpc_attribute"
            referencedColumns: ["attribute_code"]
          },
        ]
      }
      gtin: {
        Row: {
          brand: string | null
          created_at: string
          description: string | null
          gpc_brick_code: string | null
          gtin: string
          ncm: string | null
          net_content: number | null
          net_content_unit: string | null
          parent_gtin: string | null
          raw_payload: Json | null
          source: string
          units_per_parent: number | null
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          description?: string | null
          gpc_brick_code?: string | null
          gtin: string
          ncm?: string | null
          net_content?: number | null
          net_content_unit?: string | null
          parent_gtin?: string | null
          raw_payload?: Json | null
          source: string
          units_per_parent?: number | null
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          description?: string | null
          gpc_brick_code?: string | null
          gtin?: string
          ncm?: string | null
          net_content?: number | null
          net_content_unit?: string | null
          parent_gtin?: string | null
          raw_payload?: Json | null
          source?: string
          units_per_parent?: number | null
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gtin_parent_gtin_fkey"
            columns: ["parent_gtin"]
            isOneToOne: false
            referencedRelation: "gtin"
            referencedColumns: ["gtin"]
          },
        ]
      }
      gtin_gpc_attribute: {
        Row: {
          attribute_code: string
          declared_at: string
          declared_by: string | null
          gtin: string
          source: string
          value_code: string
        }
        Insert: {
          attribute_code: string
          declared_at?: string
          declared_by?: string | null
          gtin: string
          source?: string
          value_code: string
        }
        Update: {
          attribute_code?: string
          declared_at?: string
          declared_by?: string | null
          gtin?: string
          source?: string
          value_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "gtin_gpc_attribute_attribute_code_fkey"
            columns: ["attribute_code"]
            isOneToOne: false
            referencedRelation: "gpc_attribute"
            referencedColumns: ["attribute_code"]
          },
          {
            foreignKeyName: "gtin_gpc_attribute_gtin_fkey"
            columns: ["gtin"]
            isOneToOne: false
            referencedRelation: "gtin"
            referencedColumns: ["gtin"]
          },
          {
            foreignKeyName: "gtin_gpc_attribute_value_code_fkey"
            columns: ["value_code"]
            isOneToOne: false
            referencedRelation: "gpc_attribute_value"
            referencedColumns: ["value_code"]
          },
        ]
      }
      gtin_specification_check: {
        Row: {
          checked_at: string
          checked_by: string | null
          divergences: Json
          gtin: string
          id: string
          purchase_item_id: string
          raw_response: Json | null
          source: string
          spec_fingerprint: string
          verdict: string
        }
        Insert: {
          checked_at?: string
          checked_by?: string | null
          divergences?: Json
          gtin: string
          id?: string
          purchase_item_id: string
          raw_response?: Json | null
          source: string
          spec_fingerprint: string
          verdict: string
        }
        Update: {
          checked_at?: string
          checked_by?: string | null
          divergences?: Json
          gtin?: string
          id?: string
          purchase_item_id?: string
          raw_response?: Json | null
          source?: string
          spec_fingerprint?: string
          verdict?: string
        }
        Relationships: []
      }
      supplier_product_map: {
        Row: {
          confidence: string
          created_at: string
          id: string
          ingredient_item_id: string | null
          purchase_item_id: string | null
          supplier_cnpj: string
          supplier_code: string
        }
        Insert: {
          confidence?: string
          created_at?: string
          id?: string
          ingredient_item_id?: string | null
          purchase_item_id?: string | null
          supplier_cnpj: string
          supplier_code: string
        }
        Update: {
          confidence?: string
          created_at?: string
          id?: string
          ingredient_item_id?: string | null
          purchase_item_id?: string | null
          supplier_cnpj?: string
          supplier_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_product_map_ingredient_item_id_fkey"
            columns: ["ingredient_item_id"]
            isOneToOne: false
            referencedRelation: "v_barcode_review"
            referencedColumns: ["ingredient_item_id"]
          },
        ]
      }
    }
    Views: {
      v_barcode_review: {
        Row: {
          description: string | null
          ingredient_id: string | null
          ingredient_item_id: string | null
          raw_barcode: string | null
        }
        Insert: {
          description?: never
          ingredient_id?: string | null
          ingredient_item_id?: string | null
          raw_barcode?: string | null
        }
        Update: {
          description?: never
          ingredient_id?: string | null
          ingredient_item_id?: string | null
          raw_barcode?: string | null
        }
        Relationships: []
      }
      v_gtin_specification_latest: {
        Row: {
          checked_at: string | null
          divergences: Json | null
          gtin: string | null
          purchase_item_id: string | null
          source: string | null
          spec_fingerprint: string | null
          verdict: string | null
        }
        Relationships: []
      }
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
      legal_documents: {
        Row: {
          content_md: string
          created_at: string
          doc_type: string
          effective_date: string
          id: string
          locale: string
          metadata: Json
          published_at: string | null
          updated_at: string
          version: string
        }
        Insert: {
          content_md: string
          created_at?: string
          doc_type: string
          effective_date: string
          id?: string
          locale?: string
          metadata?: Json
          published_at?: string | null
          updated_at?: string
          version: string
        }
        Update: {
          content_md?: string
          created_at?: string
          doc_type?: string
          effective_date?: string
          id?: string
          locale?: string
          metadata?: Json
          published_at?: string | null
          updated_at?: string
          version?: string
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
      user_app_favorites: {
        Row: {
          app_ids: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          app_ids?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          app_ids?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_legal_acceptances: {
        Row: {
          accepted_at: string
          document_id: string
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          document_id: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          document_id?: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_legal_acceptances_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_legal_acceptances_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents_current"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      legal_documents_current: {
        Row: {
          content_md: string | null
          created_at: string | null
          doc_type: string | null
          effective_date: string | null
          id: string | null
          locale: string | null
          metadata: Json | null
          published_at: string | null
          updated_at: string | null
          version: string | null
        }
        Relationships: []
      }
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
  inventory: {
    Tables: {
      goods_receipt: {
        Row: {
          created_at: string
          created_by: string | null
          definitive_at: string | null
          definitive_by: string | null
          empenho_id: string | null
          id: string
          kitchen_id: number
          liquidacao_id: string | null
          nfe_document_id: string | null
          notes: string | null
          provisional_at: string | null
          provisional_by: string | null
          status: string
          supply_order_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          definitive_at?: string | null
          definitive_by?: string | null
          empenho_id?: string | null
          id?: string
          kitchen_id: number
          liquidacao_id?: string | null
          nfe_document_id?: string | null
          notes?: string | null
          provisional_at?: string | null
          provisional_by?: string | null
          status?: string
          supply_order_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          definitive_at?: string | null
          definitive_by?: string | null
          empenho_id?: string | null
          id?: string
          kitchen_id?: number
          liquidacao_id?: string | null
          nfe_document_id?: string | null
          notes?: string | null
          provisional_at?: string | null
          provisional_by?: string | null
          status?: string
          supply_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_nfe_document_id_fkey"
            columns: ["nfe_document_id"]
            isOneToOne: false
            referencedRelation: "nfe_document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_supply_order_id_fkey"
            columns: ["supply_order_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_lead_time"
            referencedColumns: ["supply_order_id"]
          },
        ]
      }
      goods_receipt_item: {
        Row: {
          divergence_reason: string | null
          frozen_preparation_id: string | null
          id: string
          ingredient_id: string | null
          ingredient_item_id: string | null
          invoiced_qty_base: number | null
          nfe_item_id: string | null
          purchase_item_id: string | null
          receipt_id: string
          received_qty_base: number
          unit_cost: number | null
        }
        Insert: {
          divergence_reason?: string | null
          frozen_preparation_id?: string | null
          id?: string
          ingredient_id?: string | null
          ingredient_item_id?: string | null
          invoiced_qty_base?: number | null
          nfe_item_id?: string | null
          purchase_item_id?: string | null
          receipt_id: string
          received_qty_base: number
          unit_cost?: number | null
        }
        Update: {
          divergence_reason?: string | null
          frozen_preparation_id?: string | null
          id?: string
          ingredient_id?: string | null
          ingredient_item_id?: string | null
          invoiced_qty_base?: number | null
          nfe_item_id?: string | null
          purchase_item_id?: string | null
          receipt_id?: string
          received_qty_base?: number
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_item_nfe_item_id_fkey"
            columns: ["nfe_item_id"]
            isOneToOne: false
            referencedRelation: "nfe_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_item_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipt"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipt_item_lot: {
        Row: {
          created_at: string
          divergence_reason: string | null
          expiry_date: string | null
          id: string
          lot_code: string
          measured_temperature_c: number | null
          quantity_base: number
          receipt_item_id: string
          temperature_ack_at: string | null
          temperature_ack_by: string | null
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          divergence_reason?: string | null
          expiry_date?: string | null
          id?: string
          lot_code: string
          measured_temperature_c?: number | null
          quantity_base: number
          receipt_item_id: string
          temperature_ack_at?: string | null
          temperature_ack_by?: string | null
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          divergence_reason?: string | null
          expiry_date?: string | null
          id?: string
          lot_code?: string
          measured_temperature_c?: number | null
          quantity_base?: number
          receipt_item_id?: string
          temperature_ack_at?: string | null
          temperature_ack_by?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_item_lot_receipt_item_id_fkey"
            columns: ["receipt_item_id"]
            isOneToOne: false
            referencedRelation: "goods_receipt_item"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          kitchen_id: number
          notes: string | null
          status: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kitchen_id: number
          notes?: string | null
          status?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kitchen_id?: number
          notes?: string | null
          status?: string
        }
        Relationships: []
      }
      inventory_count_item: {
        Row: {
          count_id: string
          counted_qty: number
          id: string
          ledger_qty: number | null
          lot_id: string
        }
        Insert: {
          count_id: string
          counted_qty: number
          id?: string
          ledger_qty?: number | null
          lot_id: string
        }
        Update: {
          count_id?: string
          counted_qty?: number
          id?: string
          ledger_qty?: number | null
          lot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_item_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "inventory_count"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_item_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "stock_lot"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_closing: {
        Row: {
          balance_snapshot: Json
          closed_at: string
          closed_by: string | null
          closing_value: number
          competencia: string
          id: string
          kitchen_id: number
          opening_value: number
          total_in: number
          total_out: number
          value_in: number
          value_out: number
        }
        Insert: {
          balance_snapshot: Json
          closed_at?: string
          closed_by?: string | null
          closing_value?: number
          competencia: string
          id?: string
          kitchen_id: number
          opening_value?: number
          total_in?: number
          total_out?: number
          value_in?: number
          value_out?: number
        }
        Update: {
          balance_snapshot?: Json
          closed_at?: string
          closed_by?: string | null
          closing_value?: number
          competencia?: string
          id?: string
          kitchen_id?: number
          opening_value?: number
          total_in?: number
          total_out?: number
          value_in?: number
          value_out?: number
        }
        Relationships: []
      }
      nfe_document: {
        Row: {
          access_key: string
          created_at: string
          created_by: string | null
          dest_cnpj: string | null
          id: string
          issued_at: string | null
          kitchen_id: number | null
          status: string
          supplier_cnpj: string | null
          supplier_name: string | null
          total_value: number | null
          xml: string
        }
        Insert: {
          access_key: string
          created_at?: string
          created_by?: string | null
          dest_cnpj?: string | null
          id?: string
          issued_at?: string | null
          kitchen_id?: number | null
          status?: string
          supplier_cnpj?: string | null
          supplier_name?: string | null
          total_value?: number | null
          xml: string
        }
        Update: {
          access_key?: string
          created_at?: string
          created_by?: string | null
          dest_cnpj?: string | null
          id?: string
          issued_at?: string | null
          kitchen_id?: number | null
          status?: string
          supplier_cnpj?: string | null
          supplier_name?: string | null
          total_value?: number | null
          xml?: string
        }
        Relationships: []
      }
      nfe_item: {
        Row: {
          cest: string | null
          cfop: string | null
          commercial_qty: number | null
          commercial_unit: string | null
          created_at: string
          description: string | null
          expiry_date: string | null
          gtin: string | null
          gtin_trib: string | null
          id: string
          ingredient_id: string | null
          ingredient_item_id: string | null
          lot_code: string | null
          lot_qty: number | null
          match_status: string
          matched_qty_base: number | null
          mfg_date: string | null
          n_item: number
          ncm: string | null
          nfe_document_id: string
          purchase_item_id: string | null
          supplier_code: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          cest?: string | null
          cfop?: string | null
          commercial_qty?: number | null
          commercial_unit?: string | null
          created_at?: string
          description?: string | null
          expiry_date?: string | null
          gtin?: string | null
          gtin_trib?: string | null
          id?: string
          ingredient_id?: string | null
          ingredient_item_id?: string | null
          lot_code?: string | null
          lot_qty?: number | null
          match_status?: string
          matched_qty_base?: number | null
          mfg_date?: string | null
          n_item: number
          ncm?: string | null
          nfe_document_id: string
          purchase_item_id?: string | null
          supplier_code?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          cest?: string | null
          cfop?: string | null
          commercial_qty?: number | null
          commercial_unit?: string | null
          created_at?: string
          description?: string | null
          expiry_date?: string | null
          gtin?: string | null
          gtin_trib?: string | null
          id?: string
          ingredient_id?: string | null
          ingredient_item_id?: string | null
          lot_code?: string | null
          lot_qty?: number | null
          match_status?: string
          matched_qty_base?: number | null
          mfg_date?: string | null
          n_item?: number
          ncm?: string | null
          nfe_document_id?: string
          purchase_item_id?: string | null
          supplier_code?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nfe_item_nfe_document_id_fkey"
            columns: ["nfe_document_id"]
            isOneToOne: false
            referencedRelation: "nfe_document"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_cost: {
        Row: {
          avg_unit_cost: number
          frozen_preparation_id: string | null
          ingredient_id: string | null
          kitchen_id: number
          quantity: number
          updated_at: string
        }
        Insert: {
          avg_unit_cost?: number
          frozen_preparation_id?: string | null
          ingredient_id?: string | null
          kitchen_id: number
          quantity?: number
          updated_at?: string
        }
        Update: {
          avg_unit_cost?: number
          frozen_preparation_id?: string | null
          ingredient_id?: string | null
          kitchen_id?: number
          quantity?: number
          updated_at?: string
        }
        Relationships: []
      }
      stock_lot: {
        Row: {
          conservation_class: string | null
          created_at: string
          expiry_date: string | null
          frozen_preparation_id: string | null
          goods_receipt_item_id: string | null
          goods_receipt_item_lot_id: string | null
          id: string
          ingredient_id: string | null
          kitchen_id: number
          lot_code: string
          unit_cost: number | null
        }
        Insert: {
          conservation_class?: string | null
          created_at?: string
          expiry_date?: string | null
          frozen_preparation_id?: string | null
          goods_receipt_item_id?: string | null
          goods_receipt_item_lot_id?: string | null
          id?: string
          ingredient_id?: string | null
          kitchen_id: number
          lot_code: string
          unit_cost?: number | null
        }
        Update: {
          conservation_class?: string | null
          created_at?: string
          expiry_date?: string | null
          frozen_preparation_id?: string | null
          goods_receipt_item_id?: string | null
          goods_receipt_item_lot_id?: string | null
          id?: string
          ingredient_id?: string | null
          kitchen_id?: number
          lot_code?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_lot_goods_receipt_item_id_fkey"
            columns: ["goods_receipt_item_id"]
            isOneToOne: false
            referencedRelation: "goods_receipt_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lot_goods_receipt_item_lot_id_fkey"
            columns: ["goods_receipt_item_lot_id"]
            isOneToOne: false
            referencedRelation: "goods_receipt_item_lot"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movement: {
        Row: {
          created_at: string
          created_by: string | null
          frozen_preparation_id: string | null
          goods_receipt_item_id: string | null
          id: string
          ingredient_id: string | null
          inventory_count_id: string | null
          justification: string | null
          kitchen_id: number
          lot_id: string | null
          production_task_id: string | null
          quantity: number
          total_cost: number | null
          transfer_pair_id: string | null
          type: string
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          frozen_preparation_id?: string | null
          goods_receipt_item_id?: string | null
          id?: string
          ingredient_id?: string | null
          inventory_count_id?: string | null
          justification?: string | null
          kitchen_id: number
          lot_id?: string | null
          production_task_id?: string | null
          quantity: number
          total_cost?: number | null
          transfer_pair_id?: string | null
          type: string
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          frozen_preparation_id?: string | null
          goods_receipt_item_id?: string | null
          id?: string
          ingredient_id?: string | null
          inventory_count_id?: string | null
          justification?: string | null
          kitchen_id?: number
          lot_id?: string | null
          production_task_id?: string | null
          quantity?: number
          total_cost?: number | null
          transfer_pair_id?: string | null
          type?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movement_count_fk"
            columns: ["inventory_count_id"]
            isOneToOne: false
            referencedRelation: "inventory_count"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movement_goods_receipt_item_id_fkey"
            columns: ["goods_receipt_item_id"]
            isOneToOne: false
            referencedRelation: "goods_receipt_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movement_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "stock_lot"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_policy: {
        Row: {
          coverage_days: number
          created_at: string
          id: string
          ingredient_id: string
          kitchen_id: number
          min_stock: number
          updated_at: string
          urgency_threshold_days: number | null
        }
        Insert: {
          coverage_days?: number
          created_at?: string
          id?: string
          ingredient_id: string
          kitchen_id: number
          min_stock?: number
          updated_at?: string
          urgency_threshold_days?: number | null
        }
        Update: {
          coverage_days?: number
          created_at?: string
          id?: string
          ingredient_id?: string
          kitchen_id?: number
          min_stock?: number
          updated_at?: string
          urgency_threshold_days?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      v_stock_balance: {
        Row: {
          balance: number | null
          balance_value: number | null
          expiry_date: string | null
          frozen_preparation_id: string | null
          ingredient_id: string | null
          kitchen_id: number | null
          last_movement_at: string | null
          lot_code: string | null
          lot_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movement_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "stock_lot"
            referencedColumns: ["id"]
          },
        ]
      }
      v_supplier_lead_time: {
        Row: {
          deviation_days: number | null
          expected_delivery: string | null
          lead_time_days: number | null
          ni_fornecedor: string | null
          purchase_item_id: string | null
          received_at: string | null
          sent_at: string | null
          supply_order_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      close_month: {
        Args: { p_competencia: string; p_kitchen_id: number; p_user: string }
        Returns: {
          closing_id: string
          items: number
        }[]
      }
      confirm_inventory_count: {
        Args: { p_count_id: string; p_user: string }
        Returns: {
          adjustments: number
        }[]
      }
      finalize_goods_receipt: {
        Args: { p_receipt_id: string; p_user: string }
        Returns: {
          movements: number
        }[]
      }
      register_leftover: {
        Args: {
          p_discard: boolean
          p_expiry_date: string
          p_frozen_preparation_id: string
          p_kitchen_id: number
          p_lot_code: string
          p_quantity: number
          p_reason: string
          p_task_id: string
          p_user: string
        }
        Returns: {
          lot_id: string
        }[]
      }
      register_production_issue: {
        Args: { p_movements: Json; p_task_id: string; p_user: string }
        Returns: {
          movements: number
        }[]
      }
      suggest_purchase_items: {
        Args: { p_description: string; p_gpc_brick?: string; p_limit?: number }
        Returns: {
          description: string
          purchase_item_id: string
          score: number
        }[]
      }
      transfer_stock: {
        Args: {
          p_lot_id: string
          p_quantity: number
          p_to_kitchen: number
          p_user: string
        }
        Returns: {
          transfer_pair_id: string
        }[]
      }
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
          comments_for_authors: string | null
          comments_for_editors: string | null
          has_ethical_concerns: boolean | null
          has_methodology_issues: boolean | null
          has_statistical_errors: boolean | null
          id: string
          is_draft: boolean | null
          recommendation: string | null
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
          comments_for_authors?: string | null
          comments_for_editors?: string | null
          has_ethical_concerns?: boolean | null
          has_methodology_issues?: boolean | null
          has_statistical_errors?: boolean | null
          id?: string
          is_draft?: boolean | null
          recommendation?: string | null
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
          comments_for_authors?: string | null
          comments_for_editors?: string | null
          has_ethical_concerns?: boolean | null
          has_methodology_issues?: boolean | null
          has_statistical_errors?: boolean | null
          id?: string
          is_draft?: boolean | null
          recommendation?: string | null
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
  kitchen: {
    Tables: {
      analytics_chat_message: {
        Row: {
          chart: Json | null
          chart_type_override: string | null
          content: string
          created_at: string
          error: string | null
          id: string
          input_tokens: number | null
          langsmith_run_id: string | null
          latency_ms: number | null
          model: string | null
          output_tokens: number | null
          role: string
          session_id: string
        }
        Insert: {
          chart?: Json | null
          chart_type_override?: string | null
          content?: string
          created_at?: string
          error?: string | null
          id?: string
          input_tokens?: number | null
          langsmith_run_id?: string | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          role: string
          session_id: string
        }
        Update: {
          chart?: Json | null
          chart_type_override?: string | null
          content?: string
          created_at?: string
          error?: string | null
          id?: string
          input_tokens?: number | null
          langsmith_run_id?: string | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_chat_message_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "analytics_chat_session"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_chat_session: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
      equipment_issue: {
        Row: {
          category: string
          created_at: string
          deleted_at: string | null
          description: string
          id: string
          reported_at: string
          reported_by: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          deleted_at?: string | null
          description: string
          id?: string
          reported_at?: string
          reported_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          status?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          deleted_at?: string | null
          description?: string
          id?: string
          reported_at?: string
          reported_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_issue_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "equipment_unit"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_maintenance_log: {
        Row: {
          cost: number | null
          created_at: string
          deleted_at: string | null
          id: string
          issue_id: string | null
          kind: string
          notes: string | null
          performed_by: string | null
          performed_on: string
          plan_id: string | null
          provider: string
          unit_id: string
        }
        Insert: {
          cost?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          issue_id?: string | null
          kind?: string
          notes?: string | null
          performed_by?: string | null
          performed_on: string
          plan_id?: string | null
          provider?: string
          unit_id: string
        }
        Update: {
          cost?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          issue_id?: string | null
          kind?: string
          notes?: string | null
          performed_by?: string | null
          performed_on?: string
          plan_id?: string | null
          provider?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_maintenance_log_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "equipment_issue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_maintenance_log_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "equipment_maintenance_plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_maintenance_log_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "equipment_unit"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_maintenance_plan: {
        Row: {
          code: string | null
          created_at: string
          deleted_at: string | null
          estimated_minutes: number | null
          id: string
          instructions: string | null
          interval_days: number
          is_required: boolean
          kind: string
          kitchen_id: number | null
          model_id: string | null
          role_id: string | null
          sort_order: number
          title: string
          tolerance_days: number
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          estimated_minutes?: number | null
          id?: string
          instructions?: string | null
          interval_days: number
          is_required?: boolean
          kind?: string
          kitchen_id?: number | null
          model_id?: string | null
          role_id?: string | null
          sort_order?: number
          title: string
          tolerance_days?: number
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          estimated_minutes?: number | null
          id?: string
          instructions?: string | null
          interval_days?: number
          is_required?: boolean
          kind?: string
          kitchen_id?: number | null
          model_id?: string | null
          role_id?: string | null
          sort_order?: number
          title?: string
          tolerance_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_maintenance_plan_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_maintenance_plan_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "equipment_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_maintenance_plan_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "equipment_role"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_model: {
        Row: {
          capacity_label: string | null
          created_at: string
          deleted_at: string | null
          depth_cm: number | null
          drain_required: boolean | null
          energy_source: string | null
          expected_lifespan_years: number | null
          height_cm: number | null
          id: string
          is_generic: boolean
          kitchen_id: number | null
          manual_url: string | null
          manufacturer: string | null
          name: string
          notes: string | null
          power_kw: number | null
          requires_hood: boolean | null
          simultaneous_slots: number
          slot_capacity_gn: number | null
          slot_capacity_liters: number | null
          slug: string | null
          voltage: string | null
          water_inlet: boolean | null
          weight_kg: number | null
          width_cm: number | null
        }
        Insert: {
          capacity_label?: string | null
          created_at?: string
          deleted_at?: string | null
          depth_cm?: number | null
          drain_required?: boolean | null
          energy_source?: string | null
          expected_lifespan_years?: number | null
          height_cm?: number | null
          id?: string
          is_generic?: boolean
          kitchen_id?: number | null
          manual_url?: string | null
          manufacturer?: string | null
          name: string
          notes?: string | null
          power_kw?: number | null
          requires_hood?: boolean | null
          simultaneous_slots?: number
          slot_capacity_gn?: number | null
          slot_capacity_liters?: number | null
          slug?: string | null
          voltage?: string | null
          water_inlet?: boolean | null
          weight_kg?: number | null
          width_cm?: number | null
        }
        Update: {
          capacity_label?: string | null
          created_at?: string
          deleted_at?: string | null
          depth_cm?: number | null
          drain_required?: boolean | null
          energy_source?: string | null
          expected_lifespan_years?: number | null
          height_cm?: number | null
          id?: string
          is_generic?: boolean
          kitchen_id?: number | null
          manual_url?: string | null
          manufacturer?: string | null
          name?: string
          notes?: string | null
          power_kw?: number | null
          requires_hood?: boolean | null
          simultaneous_slots?: number
          slot_capacity_gn?: number | null
          slot_capacity_liters?: number | null
          slug?: string | null
          voltage?: string | null
          water_inlet?: boolean | null
          weight_kg?: number | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_model_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchen"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_model_role: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          is_primary: boolean
          model_id: string
          notes: string | null
          role_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_primary?: boolean
          model_id: string
          notes?: string | null
          role_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_primary?: boolean
          model_id?: string
          notes?: string | null
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_model_role_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "equipment_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_model_role_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "equipment_role"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_role: {
        Row: {
          category: string
          code: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      equipment_unit: {
        Row: {
          acquired_on: string | null
          asset_tag: string | null
          created_at: string
          deleted_at: string | null
          id: string
          installed_on: string | null
          kitchen_id: number
          label: string
          model_id: string
          notes: string | null
          serial_number: string | null
          simultaneous_slots: number | null
          status: string
          supplier: string | null
          updated_at: string
          warranty_until: string | null
        }
        Insert: {
          acquired_on?: string | null
          asset_tag?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          installed_on?: string | null
          kitchen_id: number
          label: string
          model_id: string
          notes?: string | null
          serial_number?: string | null
          simultaneous_slots?: number | null
          status?: string
          supplier?: string | null
          updated_at?: string
          warranty_until?: string | null
        }
        Update: {
          acquired_on?: string | null
          asset_tag?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          installed_on?: string | null
          kitchen_id?: number
          label?: string
          model_id?: string
          notes?: string | null
          serial_number?: string | null
          simultaneous_slots?: number | null
          status?: string
          supplier?: string | null
          updated_at?: string
          warranty_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_unit_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_unit_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "equipment_model"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_unit_role: {
        Row: {
          available: boolean
          created_at: string
          deleted_at: string | null
          id: string
          notes: string | null
          role_id: string
          unit_id: string
        }
        Insert: {
          available: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          role_id: string
          unit_id: string
        }
        Update: {
          available?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          role_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_unit_role_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "equipment_role"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_unit_role_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "equipment_unit"
            referencedColumns: ["id"]
          },
        ]
      }
      folder: {
        Row: {
          catalog_scope: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          legacy_id: number | null
          parent_id: string | null
        }
        Insert: {
          catalog_scope?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          legacy_id?: number | null
          parent_id?: string | null
        }
        Update: {
          catalog_scope?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          legacy_id?: number | null
          parent_id?: string | null
        }
        Relationships: []
      }
      folder_review: {
        Row: {
          folder_id: string
          id: string
          note: string | null
          reviewed_at: string
          reviewed_by: string | null
          reviewed_by_name: string | null
        }
        Insert: {
          folder_id: string
          id?: string
          note?: string | null
          reviewed_at?: string
          reviewed_by?: string | null
          reviewed_by_name?: string | null
        }
        Update: {
          folder_id?: string
          id?: string
          note?: string | null
          reviewed_at?: string
          reviewed_by?: string | null
          reviewed_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "folder_review_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folder"
            referencedColumns: ["id"]
          },
        ]
      }
      frozen_preparation: {
        Row: {
          category: string
          ceafa_id: string | null
          correction_factor: number | null
          created_at: string
          deleted_at: string | null
          density_factor: number | null
          description: string
          id: string
          legacy_id: number | null
          measure_unit: string | null
          production_recipe_id: string | null
          regeneration_recipe_id: string | null
          shelf_life_days: number | null
          source_ingredient_id: string | null
          storage_instructions: string | null
          storage_temperature_c: number | null
          yield_quantity: number | null
        }
        Insert: {
          category?: string
          ceafa_id?: string | null
          correction_factor?: number | null
          created_at?: string
          deleted_at?: string | null
          density_factor?: number | null
          description: string
          id?: string
          legacy_id?: number | null
          measure_unit?: string | null
          production_recipe_id?: string | null
          regeneration_recipe_id?: string | null
          shelf_life_days?: number | null
          source_ingredient_id?: string | null
          storage_instructions?: string | null
          storage_temperature_c?: number | null
          yield_quantity?: number | null
        }
        Update: {
          category?: string
          ceafa_id?: string | null
          correction_factor?: number | null
          created_at?: string
          deleted_at?: string | null
          density_factor?: number | null
          description?: string
          id?: string
          legacy_id?: number | null
          measure_unit?: string | null
          production_recipe_id?: string | null
          regeneration_recipe_id?: string | null
          shelf_life_days?: number | null
          source_ingredient_id?: string | null
          storage_instructions?: string | null
          storage_temperature_c?: number | null
          yield_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "frozen_preparation_ceafa_id_fkey"
            columns: ["ceafa_id"]
            isOneToOne: false
            referencedRelation: "ceafa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "frozen_preparation_production_recipe_id_fkey"
            columns: ["production_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "frozen_preparation_regeneration_recipe_id_fkey"
            columns: ["regeneration_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "frozen_preparation_source_ingredient_id_fkey"
            columns: ["source_ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "frozen_preparation_source_ingredient_id_fkey"
            columns: ["source_ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_kg_lt_items"
            referencedColumns: ["product_id"]
          },
        ]
      }
      ingredient: {
        Row: {
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
          preparation_group_id: string | null
          rehydration_index: number | null
        }
        Insert: {
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
          preparation_group_id?: string | null
          rehydration_index?: number | null
        }
        Update: {
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
          preparation_group_id?: string | null
          rehydration_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_preparation_group_id_fkey"
            columns: ["preparation_group_id"]
            isOneToOne: false
            referencedRelation: "preparation_group"
            referencedColumns: ["id"]
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
      ingredient_item: {
        Row: {
          barcode: string | null
          correction_factor: number | null
          created_at: string
          deleted_at: string | null
          description: string | null
          gtin: string | null
          id: string
          ingredient_id: string | null
          purchase_item_id: string | null
          purchase_measure_unit: string | null
          unit_content_quantity: number | null
        }
        Insert: {
          barcode?: string | null
          correction_factor?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          gtin?: string | null
          id?: string
          ingredient_id?: string | null
          purchase_item_id?: string | null
          purchase_measure_unit?: string | null
          unit_content_quantity?: number | null
        }
        Update: {
          barcode?: string | null
          correction_factor?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          gtin?: string | null
          id?: string
          ingredient_id?: string | null
          purchase_item_id?: string | null
          purchase_measure_unit?: string | null
          unit_content_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_item_product_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_item_product_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_kg_lt_items"
            referencedColumns: ["product_id"]
          },
        ]
      }
      ingredient_nutrient: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          ingredient_id: string
          nutrient_id: string
          nutrient_value: number | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          ingredient_id: string
          nutrient_id: string
          nutrient_value?: number | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          ingredient_id?: string
          nutrient_id?: string
          nutrient_value?: number | null
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
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_nutrient_product_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_kg_lt_items"
            referencedColumns: ["product_id"]
          },
        ]
      }
      ingredient_nutrition_reference: {
        Row: {
          food_revision_id: string
          ingredient_id: string
          linked_at: string
          linked_by: string | null
          match_status: string
          notes: string | null
        }
        Insert: {
          food_revision_id: string
          ingredient_id: string
          linked_at?: string
          linked_by?: string | null
          match_status?: string
          notes?: string | null
        }
        Update: {
          food_revision_id?: string
          ingredient_id?: string
          linked_at?: string
          linked_by?: string | null
          match_status?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_nutrition_reference_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: true
            referencedRelation: "ingredient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_nutrition_reference_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: true
            referencedRelation: "v_ingredient_kg_lt_items"
            referencedColumns: ["product_id"]
          },
        ]
      }
      ingredient_review: {
        Row: {
          id: string
          ingredient_id: string
          note: string | null
          reviewed_at: string
          reviewed_by: string | null
          reviewed_by_name: string | null
        }
        Insert: {
          id?: string
          ingredient_id: string
          note?: string | null
          reviewed_at?: string
          reviewed_by?: string | null
          reviewed_by_name?: string | null
        }
        Update: {
          id?: string
          ingredient_id?: string
          note?: string | null
          reviewed_at?: string
          reviewed_by?: string | null
          reviewed_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_review_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_review_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_kg_lt_items"
            referencedColumns: ["product_id"]
          },
        ]
      }
      ingredient_substitution: {
        Row: {
          created_at: string
          factor: number
          id: string
          ingredient_id: string
          substitute_ingredient_id: string
        }
        Insert: {
          created_at?: string
          factor?: number
          id?: string
          ingredient_id: string
          substitute_ingredient_id: string
        }
        Update: {
          created_at?: string
          factor?: number
          id?: string
          ingredient_id?: string
          substitute_ingredient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_substitution_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_substitution_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_kg_lt_items"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "ingredient_substitution_substitute_ingredient_id_fkey"
            columns: ["substitute_ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_substitution_substitute_ingredient_id_fkey"
            columns: ["substitute_ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_kg_lt_items"
            referencedColumns: ["product_id"]
          },
        ]
      }
      ingredient_version: {
        Row: {
          change_summary: string | null
          changed_by: string | null
          changed_by_name: string | null
          created_at: string
          id: string
          ingredient_id: string
          snapshot: Json
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          id?: string
          ingredient_id: string
          snapshot: Json
          version_number: number
        }
        Update: {
          change_summary?: string | null
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          id?: string
          ingredient_id?: string
          snapshot?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_version_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_version_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_kg_lt_items"
            referencedColumns: ["product_id"]
          },
        ]
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
          is_training: boolean
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
          is_training?: boolean
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
          is_training?: boolean
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
          item_group: string | null
          origin_template_id: string | null
          origin_template_type: string | null
          planned_portion_quantity: number | null
          recipe: Json | null
          recipe_origin_id: string | null
          recommended_proportion: number | null
          sort_order: number
          substitutions: Json | null
        }
        Insert: {
          created_at?: string
          daily_menu_id?: string | null
          deleted_at?: string | null
          excluded_from_procurement?: number | null
          id?: string
          item_group?: string | null
          origin_template_id?: string | null
          origin_template_type?: string | null
          planned_portion_quantity?: number | null
          recipe?: Json | null
          recipe_origin_id?: string | null
          recommended_proportion?: number | null
          sort_order?: number
          substitutions?: Json | null
        }
        Update: {
          created_at?: string
          daily_menu_id?: string | null
          deleted_at?: string | null
          excluded_from_procurement?: number | null
          id?: string
          item_group?: string | null
          origin_template_id?: string | null
          origin_template_type?: string | null
          planned_portion_quantity?: number | null
          recipe?: Json | null
          recipe_origin_id?: string | null
          recommended_proportion?: number | null
          sort_order?: number
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
            foreignKeyName: "menu_items_origin_template_id_fkey"
            columns: ["origin_template_id"]
            isOneToOne: false
            referencedRelation: "menu_template"
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
          expected_monthly_occurrences: number | null
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
          expected_monthly_occurrences?: number | null
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
          expected_monthly_occurrences?: number | null
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
          item_group: string | null
          meal_type_id: string | null
          menu_template_id: string | null
          recipe_id: string | null
          recommended_proportion: number | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          day_of_week?: number | null
          headcount_override?: number | null
          id?: string
          item_group?: string | null
          meal_type_id?: string | null
          menu_template_id?: string | null
          recipe_id?: string | null
          recommended_proportion?: number | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          day_of_week?: number | null
          headcount_override?: number | null
          id?: string
          item_group?: string | null
          meal_type_id?: string | null
          menu_template_id?: string | null
          recipe_id?: string | null
          recommended_proportion?: number | null
          sort_order?: number
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
      menu_template_meal: {
        Row: {
          base_headcount: number | null
          created_at: string
          day_of_week: number
          id: string
          meal_type_id: string
          menu_template_id: string
        }
        Insert: {
          base_headcount?: number | null
          created_at?: string
          day_of_week: number
          id?: string
          meal_type_id: string
          menu_template_id: string
        }
        Update: {
          base_headcount?: number | null
          created_at?: string
          day_of_week?: number
          id?: string
          meal_type_id?: string
          menu_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_template_meal_meal_type_id_fkey"
            columns: ["meal_type_id"]
            isOneToOne: false
            referencedRelation: "meal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_template_meal_menu_template_id_fkey"
            columns: ["menu_template_id"]
            isOneToOne: false
            referencedRelation: "menu_template"
            referencedColumns: ["id"]
          },
        ]
      }
      mess_halls: {
        Row: {
          code: string
          display_name: string | null
          id: number
          is_training: boolean
          kitchen_id: number | null
          unit_id: number
        }
        Insert: {
          code: string
          display_name?: string | null
          id?: number
          is_training?: boolean
          kitchen_id?: number | null
          unit_id: number
        }
        Update: {
          code?: string
          display_name?: string | null
          id?: number
          is_training?: boolean
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
      module_chat_message: {
        Row: {
          content: string
          created_at: string
          error: string | null
          id: string
          input_tokens: number | null
          langsmith_run_id: string | null
          latency_ms: number | null
          model: string | null
          output_tokens: number | null
          role: string
          session_id: string
          tool_call_id: string | null
          tool_calls: Json | null
          tool_name: string | null
          tool_result: Json | null
        }
        Insert: {
          content?: string
          created_at?: string
          error?: string | null
          id?: string
          input_tokens?: number | null
          langsmith_run_id?: string | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          role: string
          session_id: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
        }
        Update: {
          content?: string
          created_at?: string
          error?: string | null
          id?: string
          input_tokens?: number | null
          langsmith_run_id?: string | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          role?: string
          session_id?: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "module_chat_message_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "module_chat_session"
            referencedColumns: ["id"]
          },
        ]
      }
      module_chat_session: {
        Row: {
          created_at: string
          id: string
          module: string
          scope_id: number | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          module: string
          scope_id?: number | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          module?: string
          scope_id?: number | null
          title?: string
          updated_at?: string
          user_id?: string
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
      preparation_group: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          legacy_id: number | null
          name: string
          parent_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          legacy_id?: number | null
          name: string
          parent_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          legacy_id?: number | null
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "preparation_group_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "preparation_group"
            referencedColumns: ["id"]
          },
        ]
      }
      production_task: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          kitchen_id: number
          leftover_quantity: number | null
          menu_item_id: string
          notes: string | null
          produced_quantity: number | null
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
          leftover_quantity?: number | null
          menu_item_id: string
          notes?: string | null
          produced_quantity?: number | null
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
          leftover_quantity?: number | null
          menu_item_id?: string
          notes?: string | null
          produced_quantity?: number | null
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
      rancho: {
        Row: {
          active: boolean
          code: string
          created_at: string
          display_name: string
          elo_code: string
          id: number
          kitchen_id: number | null
          mess_hall_id: number | null
          notes: string | null
          produces_own_meals: boolean
          unit_id: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          display_name: string
          elo_code: string
          id?: number
          kitchen_id?: number | null
          mess_hall_id?: number | null
          notes?: string | null
          produces_own_meals?: boolean
          unit_id: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          display_name?: string
          elo_code?: string
          id?: number
          kitchen_id?: number | null
          mess_hall_id?: number | null
          notes?: string | null
          produces_own_meals?: boolean
          unit_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rancho_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancho_mess_hall_id_fkey"
            columns: ["mess_hall_id"]
            isOneToOne: false
            referencedRelation: "mess_halls"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_equipment_requirement: {
        Row: {
          batch_portions: number | null
          created_at: string
          deleted_at: string | null
          id: string
          min_capacity_gn: number | null
          min_capacity_liters: number | null
          model_id: string | null
          notes: string | null
          quantity: number
          recipe_id: string
          recipe_step_id: string | null
          role_id: string | null
          scaling: string
        }
        Insert: {
          batch_portions?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          min_capacity_gn?: number | null
          min_capacity_liters?: number | null
          model_id?: string | null
          notes?: string | null
          quantity?: number
          recipe_id: string
          recipe_step_id?: string | null
          role_id?: string | null
          scaling?: string
        }
        Update: {
          batch_portions?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          min_capacity_gn?: number | null
          min_capacity_liters?: number | null
          model_id?: string | null
          notes?: string | null
          quantity?: number
          recipe_id?: string
          recipe_step_id?: string | null
          role_id?: string | null
          scaling?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_equipment_requirement_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "equipment_model"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_equipment_requirement_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_equipment_requirement_recipe_step_id_fkey"
            columns: ["recipe_step_id"]
            isOneToOne: false
            referencedRelation: "recipe_step"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_equipment_requirement_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "equipment_role"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_folder: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      recipe_ingredient_alternatives: {
        Row: {
          created_at: string
          frozen_preparation_id: string | null
          id: string
          ingredient_id: string | null
          net_quantity: number | null
          priority_order: number | null
          recipe_ingredient_id: string
        }
        Insert: {
          created_at?: string
          frozen_preparation_id?: string | null
          id?: string
          ingredient_id?: string | null
          net_quantity?: number | null
          priority_order?: number | null
          recipe_ingredient_id: string
        }
        Update: {
          created_at?: string
          frozen_preparation_id?: string | null
          id?: string
          ingredient_id?: string | null
          net_quantity?: number | null
          priority_order?: number | null
          recipe_ingredient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredient_alternatives_frozen_preparation_id_fkey"
            columns: ["frozen_preparation_id"]
            isOneToOne: false
            referencedRelation: "frozen_preparation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredient_alternatives_product_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredient_alternatives_product_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_kg_lt_items"
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
          correction_factor: number | null
          created_at: string
          deleted_at: string | null
          frozen_preparation_id: string | null
          id: string
          ingredient_id: string | null
          is_optional: boolean | null
          net_quantity: number | null
          priority_order: number | null
          recipe_id: string | null
          rehydration_index: number | null
        }
        Insert: {
          correction_factor?: number | null
          created_at?: string
          deleted_at?: string | null
          frozen_preparation_id?: string | null
          id?: string
          ingredient_id?: string | null
          is_optional?: boolean | null
          net_quantity?: number | null
          priority_order?: number | null
          recipe_id?: string | null
          rehydration_index?: number | null
        }
        Update: {
          correction_factor?: number | null
          created_at?: string
          deleted_at?: string | null
          frozen_preparation_id?: string | null
          id?: string
          ingredient_id?: string | null
          is_optional?: boolean | null
          net_quantity?: number | null
          priority_order?: number | null
          recipe_id?: string | null
          rehydration_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_frozen_preparation_id_fkey"
            columns: ["frozen_preparation_id"]
            isOneToOne: false
            referencedRelation: "frozen_preparation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_product_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_product_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_kg_lt_items"
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
      recipe_review: {
        Row: {
          id: string
          note: string | null
          recipe_id: string
          reviewed_at: string
          reviewed_by: string | null
          reviewed_by_name: string | null
        }
        Insert: {
          id?: string
          note?: string | null
          recipe_id: string
          reviewed_at?: string
          reviewed_by?: string | null
          reviewed_by_name?: string | null
        }
        Update: {
          id?: string
          note?: string | null
          recipe_id?: string
          reviewed_at?: string
          reviewed_by?: string | null
          reviewed_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_review_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_step: {
        Row: {
          canvas_x: number
          canvas_y: number
          created_at: string
          deleted_at: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          label: string | null
          recipe_id: string
          step_template_id: string | null
        }
        Insert: {
          canvas_x?: number
          canvas_y?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          label?: string | null
          recipe_id: string
          step_template_id?: string | null
        }
        Update: {
          canvas_x?: number
          canvas_y?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          label?: string | null
          recipe_id?: string
          step_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_step_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_step_step_template_id_fkey"
            columns: ["step_template_id"]
            isOneToOne: false
            referencedRelation: "step_template"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_step_input: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          measure_unit: string | null
          quantity: number | null
          recipe_ingredient_id: string | null
          recipe_step_id: string
          source_output_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          measure_unit?: string | null
          quantity?: number | null
          recipe_ingredient_id?: string | null
          recipe_step_id: string
          source_output_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          measure_unit?: string | null
          quantity?: number | null
          recipe_ingredient_id?: string | null
          recipe_step_id?: string
          source_output_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_step_input_recipe_ingredient_id_fkey"
            columns: ["recipe_ingredient_id"]
            isOneToOne: false
            referencedRelation: "recipe_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_step_input_recipe_step_id_fkey"
            columns: ["recipe_step_id"]
            isOneToOne: false
            referencedRelation: "recipe_step"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_step_input_source_output_id_fkey"
            columns: ["source_output_id"]
            isOneToOne: false
            referencedRelation: "recipe_step_output"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_step_output: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          is_final: boolean
          label: string | null
          measure_unit: string | null
          quantity: number | null
          recipe_id: string
          recipe_step_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_final?: boolean
          label?: string | null
          measure_unit?: string | null
          quantity?: number | null
          recipe_id: string
          recipe_step_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_final?: boolean
          label?: string | null
          measure_unit?: string | null
          quantity?: number | null
          recipe_id?: string
          recipe_step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_step_output_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_step_output_recipe_step_id_fkey"
            columns: ["recipe_step_id"]
            isOneToOne: false
            referencedRelation: "recipe_step"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_step_utensil: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          recipe_step_id: string
          utensil_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          recipe_step_id: string
          utensil_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          recipe_step_id?: string
          utensil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_step_utensil_recipe_step_id_fkey"
            columns: ["recipe_step_id"]
            isOneToOne: false
            referencedRelation: "recipe_step"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_step_utensil_utensil_id_fkey"
            columns: ["utensil_id"]
            isOneToOne: false
            referencedRelation: "utensil"
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
          folder_id: string | null
          id: string
          kitchen_id: number | null
          legacy_id: number | null
          name: string
          portion_yield: number | null
          pre_preparation_method: string | null
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
          folder_id?: string | null
          id?: string
          kitchen_id?: number | null
          legacy_id?: number | null
          name: string
          portion_yield?: number | null
          pre_preparation_method?: string | null
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
          folder_id?: string | null
          id?: string
          kitchen_id?: number | null
          legacy_id?: number | null
          name?: string
          portion_yield?: number | null
          pre_preparation_method?: string | null
          preparation_method?: string | null
          preparation_time_minutes?: number | null
          rational_id?: string | null
          upstream_version_snapshot?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipes_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "recipe_folder"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchen"
            referencedColumns: ["id"]
          },
        ]
      }
      step_template: {
        Row: {
          created_at: string
          default_duration_minutes: number | null
          deleted_at: string | null
          description: string | null
          id: string
          kitchen_id: number | null
          name: string
        }
        Insert: {
          created_at?: string
          default_duration_minutes?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          kitchen_id?: number | null
          name: string
        }
        Update: {
          created_at?: string
          default_duration_minutes?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          kitchen_id?: number | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "step_template_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchen"
            referencedColumns: ["id"]
          },
        ]
      }
      step_template_utensil: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          step_template_id: string
          utensil_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          step_template_id: string
          utensil_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          step_template_id?: string
          utensil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "step_template_utensil_step_template_id_fkey"
            columns: ["step_template_id"]
            isOneToOne: false
            referencedRelation: "step_template"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_template_utensil_utensil_id_fkey"
            columns: ["utensil_id"]
            isOneToOne: false
            referencedRelation: "utensil"
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
      training_reset_log: {
        Row: {
          actor_id: string
          deleted_counts: Json
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          queued_ms: number | null
          started_at: string
          status: string
        }
        Insert: {
          actor_id: string
          deleted_counts?: Json
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          queued_ms?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          actor_id?: string
          deleted_counts?: Json
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          queued_ms?: number | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      utensil: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          kitchen_id: number | null
          name: string
          role_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          kitchen_id?: number | null
          name: string
          role_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          kitchen_id?: number | null
          name?: string
          role_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "utensil_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "utensil_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "equipment_role"
            referencedColumns: ["id"]
          },
        ]
      }
      workforce_category: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_career: boolean
          is_technical: boolean
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_career?: boolean
          is_technical?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_career?: boolean
          is_technical?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      workforce_headcount: {
        Row: {
          category_id: string
          created_at: string
          headcount: number
          id: string
          submission_id: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          headcount: number
          id?: string
          submission_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          headcount?: number
          id?: string
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workforce_headcount_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "workforce_category"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workforce_headcount_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "workforce_submission"
            referencedColumns: ["id"]
          },
        ]
      }
      workforce_note: {
        Row: {
          created_at: string
          detail: string
          id: string
          kind: string
          quantity: number | null
          submission_id: string
        }
        Insert: {
          created_at?: string
          detail: string
          id?: string
          kind: string
          quantity?: number | null
          submission_id: string
        }
        Update: {
          created_at?: string
          detail?: string
          id?: string
          kind?: string
          quantity?: number | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workforce_note_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "workforce_submission"
            referencedColumns: ["id"]
          },
        ]
      }
      workforce_submission: {
        Row: {
          created_at: string
          declared_total: number | null
          id: string
          rancho_id: number
          submitted_at: string | null
          submitted_by: string | null
          survey_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          declared_total?: number | null
          id?: string
          rancho_id: number
          submitted_at?: string | null
          submitted_by?: string | null
          survey_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          declared_total?: number | null
          id?: string
          rancho_id?: number
          submitted_at?: string | null
          submitted_by?: string | null
          survey_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workforce_submission_rancho_id_fkey"
            columns: ["rancho_id"]
            isOneToOne: false
            referencedRelation: "rancho"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workforce_submission_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "workforce_survey"
            referencedColumns: ["id"]
          },
        ]
      }
      workforce_survey: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          opened_at: string
          reference_date: string
          source: string | null
          status: string
          title: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          opened_at?: string
          reference_date: string
          source?: string | null
          status?: string
          title: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          opened_at?: string
          reference_date?: string
          source?: string | null
          status?: string
          title?: string
        }
        Relationships: []
      }
    }
    Views: {
      folder_last_review: {
        Row: {
          folder_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "folder_review_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folder"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_last_review: {
        Row: {
          ingredient_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_review_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_review_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "v_ingredient_kg_lt_items"
            referencedColumns: ["product_id"]
          },
        ]
      }
      recipe_last_review: {
        Row: {
          recipe_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_review_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ingredient_kg_lt_items: {
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
  nutrition_reference: {
    Tables: {
      food_item: {
        Row: {
          created_at: string
          current_revision_id: string | null
          external_code: string
          id: string
          source_id: string
        }
        Insert: {
          created_at?: string
          current_revision_id?: string | null
          external_code: string
          id?: string
          source_id: string
        }
        Update: {
          created_at?: string
          current_revision_id?: string | null
          external_code?: string
          id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_item_current_revision_id_fkey"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "food_item_revision"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_item_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "source"
            referencedColumns: ["id"]
          },
        ]
      }
      food_item_revision: {
        Row: {
          base_quantity: number
          base_unit: string
          brand_name: string | null
          content_hash: string
          created_at: string
          display_name: string
          edible_portion_factor: number | null
          food_item_id: string
          food_type: string | null
          group_code: string | null
          group_name: string | null
          id: string
          is_current: boolean
          normalized_name: string
          original_name: string | null
          preparation_state: string | null
          raw: Json
          scientific_name: string | null
          source_release_id: string
        }
        Insert: {
          base_quantity?: number
          base_unit?: string
          brand_name?: string | null
          content_hash: string
          created_at?: string
          display_name: string
          edible_portion_factor?: number | null
          food_item_id: string
          food_type?: string | null
          group_code?: string | null
          group_name?: string | null
          id?: string
          is_current?: boolean
          normalized_name: string
          original_name?: string | null
          preparation_state?: string | null
          raw?: Json
          scientific_name?: string | null
          source_release_id: string
        }
        Update: {
          base_quantity?: number
          base_unit?: string
          brand_name?: string | null
          content_hash?: string
          created_at?: string
          display_name?: string
          edible_portion_factor?: number | null
          food_item_id?: string
          food_type?: string | null
          group_code?: string | null
          group_name?: string | null
          id?: string
          is_current?: boolean
          normalized_name?: string
          original_name?: string | null
          preparation_state?: string | null
          raw?: Json
          scientific_name?: string | null
          source_release_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_item_revision_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_item_revision_source_release_id_fkey"
            columns: ["source_release_id"]
            isOneToOne: false
            referencedRelation: "source_release"
            referencedColumns: ["id"]
          },
        ]
      }
      food_nutrient_value: {
        Row: {
          component_id: string
          created_at: string
          food_revision_id: string
          id: string
          raw: Json
          raw_value: string | null
          value: number | null
          value_kind: string
        }
        Insert: {
          component_id: string
          created_at?: string
          food_revision_id: string
          id?: string
          raw?: Json
          raw_value?: string | null
          value?: number | null
          value_kind?: string
        }
        Update: {
          component_id?: string
          created_at?: string
          food_revision_id?: string
          id?: string
          raw?: Json
          raw_value?: string | null
          value?: number | null
          value_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_nutrient_value_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "nutrient_component"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_nutrient_value_food_revision_id_fkey"
            columns: ["food_revision_id"]
            isOneToOne: false
            referencedRelation: "food_item_revision"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrient_component: {
        Row: {
          created_at: string
          external_code: string
          id: string
          infoods_tag: string | null
          name: string
          raw: Json
          source_id: string
          unit: string | null
        }
        Insert: {
          created_at?: string
          external_code: string
          id?: string
          infoods_tag?: string | null
          name: string
          raw?: Json
          source_id: string
          unit?: string | null
        }
        Update: {
          created_at?: string
          external_code?: string
          id?: string
          infoods_tag?: string | null
          name?: string
          raw?: Json
          source_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrient_component_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "source"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrient_component_mapping: {
        Row: {
          component_id: string
          confidence: string
          conversion_multiplier: number
          conversion_offset: number
          created_at: string
          id: string
          is_preferred: boolean
          nutrient_id: string
        }
        Insert: {
          component_id: string
          confidence?: string
          conversion_multiplier?: number
          conversion_offset?: number
          created_at?: string
          id?: string
          is_preferred?: boolean
          nutrient_id: string
        }
        Update: {
          component_id?: string
          confidence?: string
          conversion_multiplier?: number
          conversion_offset?: number
          created_at?: string
          id?: string
          is_preferred?: boolean
          nutrient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrient_component_mapping_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "nutrient_component"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_sync_log: {
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
      nutrition_sync_step: {
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
            foreignKeyName: "nutrition_sync_step_sync_id_fkey"
            columns: ["sync_id"]
            isOneToOne: false
            referencedRelation: "nutrition_sync_log"
            referencedColumns: ["id"]
          },
        ]
      }
      source: {
        Row: {
          citation: string | null
          country_code: string | null
          created_at: string
          display_name: string
          id: string
          import_mode: string
          license_name: string | null
          license_url: string | null
          metadata: Json
          publisher: string | null
          source_priority: number
          sync_enabled: boolean
          updated_at: string
        }
        Insert: {
          citation?: string | null
          country_code?: string | null
          created_at?: string
          display_name: string
          id: string
          import_mode?: string
          license_name?: string | null
          license_url?: string | null
          metadata?: Json
          publisher?: string | null
          source_priority?: number
          sync_enabled?: boolean
          updated_at?: string
        }
        Update: {
          citation?: string | null
          country_code?: string | null
          created_at?: string
          display_name?: string
          id?: string
          import_mode?: string
          license_name?: string | null
          license_url?: string | null
          metadata?: Json
          publisher?: string | null
          source_priority?: number
          sync_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      source_release: {
        Row: {
          checksum_sha256: string | null
          created_at: string
          download_url: string | null
          etag: string | null
          fetched_at: string | null
          id: string
          imported_at: string | null
          last_modified: string | null
          metadata: Json
          published_at: string | null
          source_id: string
          status: string
          upstream_url: string | null
          version_label: string
        }
        Insert: {
          checksum_sha256?: string | null
          created_at?: string
          download_url?: string | null
          etag?: string | null
          fetched_at?: string | null
          id?: string
          imported_at?: string | null
          last_modified?: string | null
          metadata?: Json
          published_at?: string | null
          source_id: string
          status?: string
          upstream_url?: string | null
          version_label: string
        }
        Update: {
          checksum_sha256?: string | null
          created_at?: string
          download_url?: string | null
          etag?: string | null
          fetched_at?: string | null
          id?: string
          imported_at?: string | null
          last_modified?: string | null
          metadata?: Json
          published_at?: string | null
          source_id?: string
          status?: string
          upstream_url?: string | null
          version_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_release_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "source"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      nutrition_sync_step_failure: {
        Args: { p_sync_id: number }
        Returns: undefined
      }
      nutrition_sync_step_success: {
        Args: { p_sync_id: number; p_upserted: number }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  procurement: {
    Tables: {
      compras_amostra: {
        Row: {
          capacidade_unidade_fornecimento: number | null
          codigo_uasg: string | null
          created_at: string
          descricao_item: string | null
          esfera: string | null
          estado: string | null
          fingerprint: string | null
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
          sigla_unidade_fornecimento: string | null
          sigla_unidade_medida: string | null
        }
        Insert: {
          capacidade_unidade_fornecimento?: number | null
          codigo_uasg?: string | null
          created_at?: string
          descricao_item?: string | null
          esfera?: string | null
          estado?: string | null
          fingerprint?: string | null
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
          sigla_unidade_fornecimento?: string | null
          sigla_unidade_medida?: string | null
        }
        Update: {
          capacidade_unidade_fornecimento?: number | null
          codigo_uasg?: string | null
          created_at?: string
          descricao_item?: string | null
          esfera?: string | null
          estado?: string | null
          fingerprint?: string | null
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
          sigla_unidade_fornecimento?: string | null
          sigla_unidade_medida?: string | null
        }
        Relationships: []
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
        Relationships: []
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
            referencedRelation: "procurement_list"
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
            referencedRelation: "procurement_list_item"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_list: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          notes: string | null
          status: string
          title: string
          unit_id: number
          updated_at: string | null
          validity_months: number | null
          wizard_step: number | null
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
          validity_months?: number | null
          wizard_step?: number | null
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
          validity_months?: number | null
          wizard_step?: number | null
        }
        Relationships: []
      }
      procurement_list_item: {
        Row: {
          catmat_item_codigo: number | null
          catmat_item_descricao: string | null
          computed_at: string | null
          conversion_factor: number | null
          folder_description: string | null
          folder_id: string | null
          id: string
          ingredient_id: string | null
          ingredient_name: string
          item_description: string | null
          list_id: string
          measure_unit: string | null
          purchase_item_description: string | null
          purchase_item_id: string | null
          purchase_measure_unit: string | null
          purchase_quantity: number | null
          total_quantity: number
          unit_price: number | null
        }
        Insert: {
          catmat_item_codigo?: number | null
          catmat_item_descricao?: string | null
          computed_at?: string | null
          conversion_factor?: number | null
          folder_description?: string | null
          folder_id?: string | null
          id?: string
          ingredient_id?: string | null
          ingredient_name: string
          item_description?: string | null
          list_id: string
          measure_unit?: string | null
          purchase_item_description?: string | null
          purchase_item_id?: string | null
          purchase_measure_unit?: string | null
          purchase_quantity?: number | null
          total_quantity: number
          unit_price?: number | null
        }
        Update: {
          catmat_item_codigo?: number | null
          catmat_item_descricao?: string | null
          computed_at?: string | null
          conversion_factor?: number | null
          folder_description?: string | null
          folder_id?: string | null
          id?: string
          ingredient_id?: string | null
          ingredient_name?: string
          item_description?: string | null
          list_id?: string
          measure_unit?: string | null
          purchase_item_description?: string | null
          purchase_item_id?: string | null
          purchase_measure_unit?: string | null
          purchase_quantity?: number | null
          total_quantity?: number
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_ata_item_ata_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "procurement_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_list_item_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_list_item_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_item_conditioning_review"
            referencedColumns: ["purchase_item_id"]
          },
        ]
      }
      procurement_list_kitchen: {
        Row: {
          delivery_notes: string | null
          id: string
          kitchen_id: number
          list_id: string
        }
        Insert: {
          delivery_notes?: string | null
          id?: string
          kitchen_id: number
          list_id: string
        }
        Update: {
          delivery_notes?: string | null
          id?: string
          kitchen_id?: number
          list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_ata_kitchen_ata_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "procurement_list"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_list_selection: {
        Row: {
          id: string
          list_kitchen_id: string
          origin_template_id: string | null
          repetitions: number
          template_id: string
        }
        Insert: {
          id?: string
          list_kitchen_id: string
          origin_template_id?: string | null
          repetitions?: number
          template_id: string
        }
        Update: {
          id?: string
          list_kitchen_id?: string
          origin_template_id?: string | null
          repetitions?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_ata_selection_ata_kitchen_id_fkey"
            columns: ["list_kitchen_id"]
            isOneToOne: false
            referencedRelation: "procurement_list_kitchen"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_list_snapshot_component: {
        Row: {
          catmat_item_codigo: number | null
          computed_at: string
          folder_description: string | null
          id: string
          ingredient_id: string | null
          ingredient_name: string
          list_id: string
          measure_unit: string | null
          purchase_item_description: string | null
          purchase_item_id: string | null
          purchase_measure_unit: string | null
          purchase_quantity: number | null
          snapshot_source: string
          total_quantity: number
          unit_price: number | null
        }
        Insert: {
          catmat_item_codigo?: number | null
          computed_at?: string
          folder_description?: string | null
          id?: string
          ingredient_id?: string | null
          ingredient_name: string
          list_id: string
          measure_unit?: string | null
          purchase_item_description?: string | null
          purchase_item_id?: string | null
          purchase_measure_unit?: string | null
          purchase_quantity?: number | null
          snapshot_source?: string
          total_quantity: number
          unit_price?: number | null
        }
        Update: {
          catmat_item_codigo?: number | null
          computed_at?: string
          folder_description?: string | null
          id?: string
          ingredient_id?: string | null
          ingredient_name?: string
          list_id?: string
          measure_unit?: string | null
          purchase_item_description?: string | null
          purchase_item_id?: string | null
          purchase_measure_unit?: string | null
          purchase_quantity?: number | null
          snapshot_source?: string
          total_quantity?: number
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_list_snapshot_component_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "procurement_list"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_list_snapshot_selection: {
        Row: {
          created_at: string
          id: string
          kitchen_id: number | null
          kitchen_name: string | null
          list_id: string
          origin_template_id: string | null
          repetitions: number
          snapshot_source: string
          template_name: string | null
          template_type: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kitchen_id?: number | null
          kitchen_name?: string | null
          list_id: string
          origin_template_id?: string | null
          repetitions?: number
          snapshot_source?: string
          template_name?: string | null
          template_type?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kitchen_id?: number | null
          kitchen_name?: string | null
          list_id?: string
          origin_template_id?: string | null
          repetitions?: number
          snapshot_source?: string
          template_name?: string | null
          template_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_list_snapshot_selection_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "procurement_list"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_pesquisa_preco: {
        Row: {
          ata_id: string | null
          created_at: string
          filter_estado: string | null
          filter_municipio_code: number | null
          filter_uasg_code: string | null
          id: string
          idempotency_key: string | null
          items_with_price: number
          items_without_catmat: number
          non_compliant_items: number
          period_months: number | null
          reference_method: string
          similarity_threshold: number | null
          total_items: number
        }
        Insert: {
          ata_id?: string | null
          created_at?: string
          filter_estado?: string | null
          filter_municipio_code?: number | null
          filter_uasg_code?: string | null
          id?: string
          idempotency_key?: string | null
          items_with_price?: number
          items_without_catmat?: number
          non_compliant_items?: number
          period_months?: number | null
          reference_method?: string
          similarity_threshold?: number | null
          total_items?: number
        }
        Update: {
          ata_id?: string | null
          created_at?: string
          filter_estado?: string | null
          filter_municipio_code?: number | null
          filter_uasg_code?: string | null
          id?: string
          idempotency_key?: string | null
          items_with_price?: number
          items_without_catmat?: number
          non_compliant_items?: number
          period_months?: number | null
          reference_method?: string
          similarity_threshold?: number | null
          total_items?: number
        }
        Relationships: [
          {
            foreignKeyName: "procurement_pesquisa_preco_ata_id_fkey"
            columns: ["ata_id"]
            isOneToOne: false
            referencedRelation: "procurement_list"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_pesquisa_preco_amostra: {
        Row: {
          amostra_id: string
          id: string
          research_item_id: string
          sample_type: string
          similarity: number | null
        }
        Insert: {
          amostra_id: string
          id?: string
          research_item_id: string
          sample_type: string
          similarity?: number | null
        }
        Update: {
          amostra_id?: string
          id?: string
          research_item_id?: string
          sample_type?: string
          similarity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_pesquisa_preco_amostra_amostra_id_fkey"
            columns: ["amostra_id"]
            isOneToOne: false
            referencedRelation: "compras_amostra"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "procurement_list_item"
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
      purchase_item: {
        Row: {
          catmat_item_codigo: number | null
          catmat_item_descricao: string | null
          catmat_match_score: number | null
          catmat_match_status: string | null
          conservation_class: string | null
          created_at: string
          deleted_at: string | null
          delivery_conditioning: string | null
          description: string
          detailed_description: string | null
          gpc_brick_code: string | null
          gpc_class_code: string | null
          gpc_family_code: string | null
          gpc_segment_code: string | null
          id: string
          min_shelf_life_days_on_delivery: number | null
          package_net_content: number | null
          package_net_content_unit: string | null
          package_type: string | null
          purchase_measure_unit: string | null
          storage_temp_max_c: number | null
          storage_temp_min_c: number | null
          transport_requirement: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          catmat_item_codigo?: number | null
          catmat_item_descricao?: string | null
          catmat_match_score?: number | null
          catmat_match_status?: string | null
          conservation_class?: string | null
          created_at?: string
          deleted_at?: string | null
          delivery_conditioning?: string | null
          description: string
          detailed_description?: string | null
          gpc_brick_code?: string | null
          gpc_class_code?: string | null
          gpc_family_code?: string | null
          gpc_segment_code?: string | null
          id?: string
          min_shelf_life_days_on_delivery?: number | null
          package_net_content?: number | null
          package_net_content_unit?: string | null
          package_type?: string | null
          purchase_measure_unit?: string | null
          storage_temp_max_c?: number | null
          storage_temp_min_c?: number | null
          transport_requirement?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          catmat_item_codigo?: number | null
          catmat_item_descricao?: string | null
          catmat_match_score?: number | null
          catmat_match_status?: string | null
          conservation_class?: string | null
          created_at?: string
          deleted_at?: string | null
          delivery_conditioning?: string | null
          description?: string
          detailed_description?: string | null
          gpc_brick_code?: string | null
          gpc_class_code?: string | null
          gpc_family_code?: string | null
          gpc_segment_code?: string | null
          id?: string
          min_shelf_life_days_on_delivery?: number | null
          package_net_content?: number | null
          package_net_content_unit?: string | null
          package_type?: string | null
          purchase_measure_unit?: string | null
          storage_temp_max_c?: number | null
          storage_temp_min_c?: number | null
          transport_requirement?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      purchase_item_gpc_requirement: {
        Row: {
          accepted_value_codes: string[]
          attribute_code: string
          created_at: string
          id: string
          notes: string | null
          purchase_item_id: string
          updated_at: string
        }
        Insert: {
          accepted_value_codes: string[]
          attribute_code: string
          created_at?: string
          id?: string
          notes?: string | null
          purchase_item_id: string
          updated_at?: string
        }
        Update: {
          accepted_value_codes?: string[]
          attribute_code?: string
          created_at?: string
          id?: string
          notes?: string | null
          purchase_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_item_gpc_requirement_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_item_gpc_requirement_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_item_conditioning_review"
            referencedColumns: ["purchase_item_id"]
          },
        ]
      }
      purchase_item_ingredient: {
        Row: {
          conversion_factor: number
          conversion_notes: string | null
          created_at: string
          id: string
          ingredient_id: string
          is_default: boolean
          purchase_item_id: string
        }
        Insert: {
          conversion_factor?: number
          conversion_notes?: string | null
          created_at?: string
          id?: string
          ingredient_id: string
          is_default?: boolean
          purchase_item_id: string
        }
        Update: {
          conversion_factor?: number
          conversion_notes?: string | null
          created_at?: string
          id?: string
          ingredient_id?: string
          is_default?: boolean
          purchase_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_item_ingredient_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_item_ingredient_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_item_conditioning_review"
            referencedColumns: ["purchase_item_id"]
          },
        ]
      }
      supply_order: {
        Row: {
          created_at: string
          created_by: string | null
          empenho_id: string
          expected_delivery: string | null
          id: string
          kitchen_id: number
          notes: string | null
          number: string | null
          sent_at: string | null
          sicaf_ack_by: string | null
          sicaf_status: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          empenho_id: string
          expected_delivery?: string | null
          id?: string
          kitchen_id: number
          notes?: string | null
          number?: string | null
          sent_at?: string | null
          sicaf_ack_by?: string | null
          sicaf_status?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          empenho_id?: string
          expected_delivery?: string | null
          id?: string
          kitchen_id?: number
          notes?: string | null
          number?: string | null
          sent_at?: string | null
          sicaf_ack_by?: string | null
          sicaf_status?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      supply_order_item: {
        Row: {
          arp_item_id: string | null
          id: string
          ordered_qty: number
          purchase_item_id: string | null
          supply_order_id: string
          unit_price: number | null
        }
        Insert: {
          arp_item_id?: string | null
          id?: string
          ordered_qty: number
          purchase_item_id?: string | null
          supply_order_id: string
          unit_price?: number | null
        }
        Update: {
          arp_item_id?: string | null
          id?: string
          ordered_qty?: number
          purchase_item_id?: string | null
          supply_order_id?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supply_order_item_arp_item_id_fkey"
            columns: ["arp_item_id"]
            isOneToOne: false
            referencedRelation: "procurement_arp_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_order_item_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_order_item_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_item_conditioning_review"
            referencedColumns: ["purchase_item_id"]
          },
          {
            foreignKeyName: "supply_order_item_supply_order_id_fkey"
            columns: ["supply_order_id"]
            isOneToOne: false
            referencedRelation: "supply_order"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_purchase_item_conditioning_review: {
        Row: {
          catmat_item_codigo: number | null
          conservation_class: string | null
          delivery_conditioning: string | null
          description: string | null
          itens_vinculados: number | null
          pendencia: string | null
          pista_catmat: string | null
          purchase_item_id: string | null
        }
        Insert: {
          catmat_item_codigo?: number | null
          conservation_class?: string | null
          delivery_conditioning?: string | null
          description?: string | null
          itens_vinculados?: never
          pendencia?: never
          pista_catmat?: never
          purchase_item_id?: string | null
        }
        Update: {
          catmat_item_codigo?: number | null
          conservation_class?: string | null
          delivery_conditioning?: string | null
          description?: string | null
          itens_vinculados?: never
          pendencia?: never
          pista_catmat?: never
          purchase_item_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      upsert_compras_amostras: { Args: { p_samples: Json }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  rumaer: {
    Tables: {
      piece: {
        Row: {
          codigo: string | null
          created_at: string
          deleted_at: string | null
          descricao_md: string | null
          id: string
          nome: string
          slug: string
          tipo: Database["rumaer"]["Enums"]["tipo_peca"] | null
          updated_at: string
        }
        Insert: {
          codigo?: string | null
          created_at?: string
          deleted_at?: string | null
          descricao_md?: string | null
          id?: string
          nome: string
          slug: string
          tipo?: Database["rumaer"]["Enums"]["tipo_peca"] | null
          updated_at?: string
        }
        Update: {
          codigo?: string | null
          created_at?: string
          deleted_at?: string | null
          descricao_md?: string | null
          id?: string
          nome?: string
          slug?: string
          tipo?: Database["rumaer"]["Enums"]["tipo_peca"] | null
          updated_at?: string
        }
        Relationships: []
      }
      piece_item: {
        Row: {
          cor: string | null
          created_at: string
          deleted_at: string | null
          especialidade: string | null
          genero: Database["rumaer"]["Enums"]["genero"] | null
          id: string
          nome: string
          piece_id: string
          posto: string | null
          quadro: string | null
          tamanho: string | null
          updated_at: string
        }
        Insert: {
          cor?: string | null
          created_at?: string
          deleted_at?: string | null
          especialidade?: string | null
          genero?: Database["rumaer"]["Enums"]["genero"] | null
          id?: string
          nome: string
          piece_id: string
          posto?: string | null
          quadro?: string | null
          tamanho?: string | null
          updated_at?: string
        }
        Update: {
          cor?: string | null
          created_at?: string
          deleted_at?: string | null
          especialidade?: string | null
          genero?: Database["rumaer"]["Enums"]["genero"] | null
          id?: string
          nome?: string
          piece_id?: string
          posto?: string | null
          quadro?: string | null
          tamanho?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "piece_item_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "piece"
            referencedColumns: ["id"]
          },
        ]
      }
      uniform: {
        Row: {
          art_referencia: string | null
          created_at: string
          deleted_at: string | null
          descricao_md: string | null
          eq_civil: Database["rumaer"]["Enums"]["equivalencia_civil"] | null
          eq_eb: string | null
          eq_mb: string | null
          grupo: Database["rumaer"]["Enums"]["grupo_uniforme"]
          id: string
          letra: string | null
          nome: string
          numero: number | null
          ordem: number
          subgrupo: string | null
          traje: string | null
          updated_at: string
        }
        Insert: {
          art_referencia?: string | null
          created_at?: string
          deleted_at?: string | null
          descricao_md?: string | null
          eq_civil?: Database["rumaer"]["Enums"]["equivalencia_civil"] | null
          eq_eb?: string | null
          eq_mb?: string | null
          grupo: Database["rumaer"]["Enums"]["grupo_uniforme"]
          id?: string
          letra?: string | null
          nome: string
          numero?: number | null
          ordem?: number
          subgrupo?: string | null
          traje?: string | null
          updated_at?: string
        }
        Update: {
          art_referencia?: string | null
          created_at?: string
          deleted_at?: string | null
          descricao_md?: string | null
          eq_civil?: Database["rumaer"]["Enums"]["equivalencia_civil"] | null
          eq_eb?: string | null
          eq_mb?: string | null
          grupo?: Database["rumaer"]["Enums"]["grupo_uniforme"]
          id?: string
          letra?: string | null
          nome?: string
          numero?: number | null
          ordem?: number
          subgrupo?: string | null
          traje?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      uniform_category: {
        Row: {
          categoria: Database["rumaer"]["Enums"]["categoria_militar"]
          id: string
          uniform_id: string
        }
        Insert: {
          categoria: Database["rumaer"]["Enums"]["categoria_militar"]
          id?: string
          uniform_id: string
        }
        Update: {
          categoria?: Database["rumaer"]["Enums"]["categoria_militar"]
          id?: string
          uniform_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uniform_category_uniform_id_fkey"
            columns: ["uniform_id"]
            isOneToOne: false
            referencedRelation: "uniform"
            referencedColumns: ["id"]
          },
        ]
      }
      uniform_variant: {
        Row: {
          blur_placeholder: string | null
          circulo: Database["rumaer"]["Enums"]["circulo_hierarquico"]
          descricao_md: string | null
          genero: Database["rumaer"]["Enums"]["genero"]
          id: string
          image_path: string | null
          ordem: number
          sub_variacao: string | null
          uniform_id: string
        }
        Insert: {
          blur_placeholder?: string | null
          circulo: Database["rumaer"]["Enums"]["circulo_hierarquico"]
          descricao_md?: string | null
          genero: Database["rumaer"]["Enums"]["genero"]
          id?: string
          image_path?: string | null
          ordem?: number
          sub_variacao?: string | null
          uniform_id: string
        }
        Update: {
          blur_placeholder?: string | null
          circulo?: Database["rumaer"]["Enums"]["circulo_hierarquico"]
          descricao_md?: string | null
          genero?: Database["rumaer"]["Enums"]["genero"]
          id?: string
          image_path?: string | null
          ordem?: number
          sub_variacao?: string | null
          uniform_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uniform_variant_uniform_id_fkey"
            columns: ["uniform_id"]
            isOneToOne: false
            referencedRelation: "uniform"
            referencedColumns: ["id"]
          },
        ]
      }
      uniform_variant_image: {
        Row: {
          blur_placeholder: string | null
          created_at: string
          id: string
          image_path: string
          legenda: string | null
          ordem: number
          piece_id: string
          variant_id: string
        }
        Insert: {
          blur_placeholder?: string | null
          created_at?: string
          id?: string
          image_path: string
          legenda?: string | null
          ordem?: number
          piece_id: string
          variant_id: string
        }
        Update: {
          blur_placeholder?: string | null
          created_at?: string
          id?: string
          image_path?: string
          legenda?: string | null
          ordem?: number
          piece_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uniform_variant_image_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "piece"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uniform_variant_image_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "uniform_variant"
            referencedColumns: ["id"]
          },
        ]
      }
      uniform_variant_piece: {
        Row: {
          id: string
          obrigatoriedade: Database["rumaer"]["Enums"]["obrigatoriedade"]
          observacao: string | null
          ordem: number
          piece_id: string
          piece_item_id: string | null
          restricao_posto: string[] | null
          restricao_quadro: string[] | null
          variant_id: string
        }
        Insert: {
          id?: string
          obrigatoriedade: Database["rumaer"]["Enums"]["obrigatoriedade"]
          observacao?: string | null
          ordem?: number
          piece_id: string
          piece_item_id?: string | null
          restricao_posto?: string[] | null
          restricao_quadro?: string[] | null
          variant_id: string
        }
        Update: {
          id?: string
          obrigatoriedade?: Database["rumaer"]["Enums"]["obrigatoriedade"]
          observacao?: string | null
          ordem?: number
          piece_id?: string
          piece_item_id?: string | null
          restricao_posto?: string[] | null
          restricao_quadro?: string[] | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uniform_variant_piece_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "piece"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uniform_variant_piece_piece_item_id_fkey"
            columns: ["piece_item_id"]
            isOneToOne: false
            referencedRelation: "piece_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uniform_variant_piece_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "uniform_variant"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      categoria_militar:
        | "oficiais"
        | "cadetes"
        | "suboficiais"
        | "sargentos"
        | "alunos_formacao"
        | "pracas"
      circulo_hierarquico:
        | "oficiais_generais"
        | "oficiais"
        | "sargentos"
        | "suboficiais"
        | "cadetes"
        | "alunos"
        | "pracas"
      equivalencia_civil:
        | "esporte"
        | "esporte_fino"
        | "passeio"
        | "passeio_completo"
        | "gala"
      genero: "masculino" | "feminino" | "unissex"
      grupo_uniforme:
        | "historicos"
        | "representacao"
        | "servicos"
        | "educacao_fisica"
        | "desfile"
      obrigatoriedade: "obrigatorio" | "eventual" | "facultativo"
      tipo_peca:
        | "cabeca"
        | "torso"
        | "pernas"
        | "calcado"
        | "acessorio"
        | "insignia"
        | "distintivo"
        | "identificacao"
        | "arma"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  siafi_integration: {
    Tables: {
      import_batch: {
        Row: {
          applied_at: string | null
          applied_rows: number
          competencia: string | null
          content_hash: string
          created_at: string
          created_by: string | null
          error_message: string | null
          file_name: string
          id: string
          recognized_rows: number
          report_type: string
          status: string
          total_rows: number
          unit_id: number
        }
        Insert: {
          applied_at?: string | null
          applied_rows?: number
          competencia?: string | null
          content_hash: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          file_name: string
          id?: string
          recognized_rows?: number
          report_type: string
          status?: string
          total_rows?: number
          unit_id: number
        }
        Update: {
          applied_at?: string | null
          applied_rows?: number
          competencia?: string | null
          content_hash?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          file_name?: string
          id?: string
          recognized_rows?: number
          report_type?: string
          status?: string
          total_rows?: number
          unit_id?: number
        }
        Relationships: []
      }
      import_row: {
        Row: {
          applied_id: string | null
          applied_table: string | null
          batch_id: string
          id: string
          parse_error: string | null
          parse_status: string
          parsed: Json | null
          raw: Json
          row_number: number
        }
        Insert: {
          applied_id?: string | null
          applied_table?: string | null
          batch_id: string
          id?: string
          parse_error?: string | null
          parse_status?: string
          parsed?: Json | null
          raw: Json
          row_number: number
        }
        Update: {
          applied_id?: string | null
          applied_table?: string | null
          batch_id?: string
          id?: string
          parse_error?: string | null
          parse_status?: string
          parsed?: Json | null
          raw?: Json
          row_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_row_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batch"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_import_batch: {
        Args: { p_batch_id: string }
        Returns: {
          claimed: boolean
          competencia: string
          report_type: string
          unit_id: number
        }[]
      }
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
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
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
          pdm_score: number
          score: number
          unidades: string[]
        }[]
      }
      catmat_similarity: {
        Args: { p_left: string; p_right: string }
        Returns: number
      }
      catmat_word_similarity: {
        Args: { p_query: string; p_text: string }
        Returns: number
      }
      compras_amostra_fingerprint: {
        Args: {
          p_capacidade_unidade_fornecimento: number
          p_codigo_uasg: string
          p_descricao_item: string
          p_esfera: string
          p_estado: string
          p_id_compra: string
          p_id_item_compra: number
          p_marca: string
          p_municipio: string
          p_nome_uasg: string
          p_normalized_price: number
          p_preco_unitario: number
          p_quantidade: number
          p_reference_date: string
          p_sigla_unidade_fornecimento: string
          p_sigla_unidade_medida: string
        }
        Returns: string
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
  sucont: {
    Tables: {
      analysis_run: {
        Row: {
          created_at: string
          created_by: string | null
          filename: string | null
          id: string
          period: string | null
          records_count: number | null
          summary: Json | null
          tool: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filename?: string | null
          id?: string
          period?: string | null
          records_count?: number | null
          summary?: Json | null
          tool: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filename?: string | null
          id?: string
          period?: string | null
          records_count?: number | null
          summary?: Json | null
          tool?: string
        }
        Relationships: []
      }
      checklist_item: {
        Row: {
          created_at: string
          deadline: string | null
          description: string | null
          done: boolean
          id: string
          path: string | null
          responsible: string | null
          sort_order: number
          task: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deadline?: string | null
          description?: string | null
          done?: boolean
          id?: string
          path?: string | null
          responsible?: string | null
          sort_order?: number
          task: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deadline?: string | null
          description?: string | null
          done?: boolean
          id?: string
          path?: string | null
          responsible?: string | null
          sort_order?: number
          task?: string
          updated_at?: string
        }
        Relationships: []
      }
      dgc_analysis: {
        Row: {
          alert_count: number
          analysis: Json
          competence: string
          created_at: string
          created_by: string | null
          finding_count: number
          id: string
          model: string | null
          period: string | null
          run_id: string
          ug_codigo: string
          ug_grupo: string | null
          ug_nome: string | null
          updated_at: string
        }
        Insert: {
          alert_count?: number
          analysis: Json
          competence: string
          created_at?: string
          created_by?: string | null
          finding_count?: number
          id?: string
          model?: string | null
          period?: string | null
          run_id: string
          ug_codigo: string
          ug_grupo?: string | null
          ug_nome?: string | null
          updated_at?: string
        }
        Update: {
          alert_count?: number
          analysis?: Json
          competence?: string
          created_at?: string
          created_by?: string | null
          finding_count?: number
          id?: string
          model?: string | null
          period?: string | null
          run_id?: string
          ug_codigo?: string
          ug_grupo?: string | null
          ug_nome?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dgc_analysis_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "analysis_run"
            referencedColumns: ["id"]
          },
        ]
      }
      document: {
        Row: {
          created_at: string
          created_by: string | null
          draft: string
          generated: Json | null
          id: string
          title: string | null
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          draft: string
          generated?: Json | null
          id?: string
          title?: string | null
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          draft?: string
          generated?: Json | null
          id?: string
          title?: string | null
          type?: string
        }
        Relationships: []
      }
      generated_message: {
        Row: {
          analysis_run_id: string | null
          corpo: string
          created_at: string
          created_by: string | null
          id: string
          number: number
          tipo: string | null
          tool: string
          ug_codigo: string | null
        }
        Insert: {
          analysis_run_id?: string | null
          corpo: string
          created_at?: string
          created_by?: string | null
          id?: string
          number?: number
          tipo?: string | null
          tool: string
          ug_codigo?: string | null
        }
        Update: {
          analysis_run_id?: string | null
          corpo?: string
          created_at?: string
          created_by?: string | null
          id?: string
          number?: number
          tipo?: string | null
          tool?: string
          ug_codigo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_message_analysis_run_id_fkey"
            columns: ["analysis_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_run"
            referencedColumns: ["id"]
          },
        ]
      }
      notice: {
        Row: {
          content: string
          created_at: string
          date: string | null
          id: string
          type: string
        }
        Insert: {
          content: string
          created_at?: string
          date?: string | null
          id?: string
          type?: string
        }
        Update: {
          content?: string
          created_at?: string
          date?: string | null
          id?: string
          type?: string
        }
        Relationships: []
      }
      report: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          title: string
          url: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          title: string
          url: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          title?: string
          url?: string
        }
        Relationships: []
      }
      siloms_siafi_balance: {
        Row: {
          account_group: string
          created_at: string
          created_by: string | null
          difference: number | null
          id: string
          period: string
          siafi_value: number
          siloms_value: number
          source_run_id: string | null
          ug_codigo: string
          ug_nome: string | null
          updated_at: string
        }
        Insert: {
          account_group: string
          created_at?: string
          created_by?: string | null
          difference?: number | null
          id?: string
          period: string
          siafi_value?: number
          siloms_value?: number
          source_run_id?: string | null
          ug_codigo: string
          ug_nome?: string | null
          updated_at?: string
        }
        Update: {
          account_group?: string
          created_at?: string
          created_by?: string | null
          difference?: number | null
          id?: string
          period?: string
          siafi_value?: number
          siloms_value?: number
          source_run_id?: string | null
          ug_codigo?: string
          ug_nome?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "siloms_siafi_balance_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_run"
            referencedColumns: ["id"]
          },
        ]
      }
      unidade_gestora: {
        Row: {
          codigo: string
          created_at: string
          is_setorial: boolean
          is_stn: boolean
          nome: string
          ods: string | null
          operador: string | null
          orgao_superior: string | null
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          is_setorial?: boolean
          is_stn?: boolean
          nome: string
          ods?: string | null
          operador?: string | null
          orgao_superior?: string | null
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          is_setorial?: boolean
          is_stn?: boolean
          nome?: string
          ods?: string | null
          operador?: string | null
          orgao_superior?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      workspace_note: {
        Row: {
          content: string
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: string
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          id?: number
          updated_at?: string
          updated_by?: string | null
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
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  access_control: {
    Enums: {},
  },
  alpha: {
    Enums: {},
  },
  assignment_selection: {
    Enums: {},
  },
  compras_gov_integration: {
    Enums: {},
  },
  core: {
    Enums: {},
  },
  documents: {
    Enums: {},
  },
  finance: {
    Enums: {},
  },
  forms: {
    Enums: {
      evaluation_type: [
        "auditoria_interna",
        "auditoria_externa",
        "preparatoria",
      ],
      question_type: [
        "text",
        "textarea",
        "single_choice",
        "multiple_choice",
        "number",
        "date",
        "scale",
        "boolean",
        "conformity",
      ],
      questionnaire_response_status: ["draft", "sent"],
      questionnaire_status: ["draft", "sent"],
      response_scope_effect: ["allow", "deny"],
      response_scope_mode: ["global", "scoped"],
    },
  },
  gs1_integration: {
    Enums: {},
  },
  iefa: {
    Enums: {},
  },
  inventory: {
    Enums: {},
  },
  journal: {
    Enums: {},
  },
  kitchen: {
    Enums: {},
  },
  nutrition_reference: {
    Enums: {},
  },
  procurement: {
    Enums: {},
  },
  rumaer: {
    Enums: {
      categoria_militar: [
        "oficiais",
        "cadetes",
        "suboficiais",
        "sargentos",
        "alunos_formacao",
        "pracas",
      ],
      circulo_hierarquico: [
        "oficiais_generais",
        "oficiais",
        "sargentos",
        "suboficiais",
        "cadetes",
        "alunos",
        "pracas",
      ],
      equivalencia_civil: [
        "esporte",
        "esporte_fino",
        "passeio",
        "passeio_completo",
        "gala",
      ],
      genero: ["masculino", "feminino", "unissex"],
      grupo_uniforme: [
        "historicos",
        "representacao",
        "servicos",
        "educacao_fisica",
        "desfile",
      ],
      obrigatoriedade: ["obrigatorio", "eventual", "facultativo"],
      tipo_peca: [
        "cabeca",
        "torso",
        "pernas",
        "calcado",
        "acessorio",
        "insignia",
        "distintivo",
        "identificacao",
        "arma",
      ],
    },
  },
  siafi_integration: {
    Enums: {},
  },
  sisub: {
    Enums: {
      kitchen_type: ["consumption", "production"],
      unit_type: ["consumption", "purchase"],
    },
  },
  sucont: {
    Enums: {},
  },
} as const
