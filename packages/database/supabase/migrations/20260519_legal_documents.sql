-- Documentos legais (Termos de Uso, Política de Privacidade, etc.) e registro de aceite.
-- Conteúdo em Markdown (TEXT) — renderização via react-markdown no frontend.
-- Metadata JSONB para extras futuros (seções nomeadas, changelog de mudanças, etc.).

-- ============================================================
-- iefa.legal_documents
-- ============================================================

CREATE TABLE iefa.legal_documents (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type       TEXT        NOT NULL,               -- 'terms_of_use' | 'privacy_policy' | livre para novos tipos
  version        TEXT        NOT NULL,               -- semver ou date-based: '1.0.0', '2026-05-19'
  locale         TEXT        NOT NULL DEFAULT 'pt-BR',
  content_md     TEXT        NOT NULL,               -- conteúdo completo em Markdown
  effective_date DATE        NOT NULL,               -- data de vigência
  published_at   TIMESTAMPTZ,                        -- null = rascunho
  metadata       JSONB       NOT NULL DEFAULT '{}',  -- extras: seções, diff_summary, etc.
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (doc_type, version, locale)
);

-- Suporta lookup eficiente da versão atual (DISTINCT ON pattern)
CREATE INDEX legal_documents_type_idx ON iefa.legal_documents (doc_type, locale, effective_date DESC)
  WHERE published_at IS NOT NULL;

-- Versão atual por tipo+locale: publicada com maior effective_date
CREATE VIEW iefa.legal_documents_current AS
SELECT DISTINCT ON (doc_type, locale) *
FROM iefa.legal_documents
WHERE published_at IS NOT NULL
ORDER BY doc_type, locale, effective_date DESC;

ALTER TABLE iefa.legal_documents ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- iefa.user_legal_acceptances
-- ============================================================

CREATE TABLE iefa.user_legal_acceptances (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  document_id uuid        NOT NULL REFERENCES iefa.legal_documents (id) ON DELETE RESTRICT,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address  INET,
  user_agent  TEXT,

  UNIQUE (user_id, document_id)
);

CREATE INDEX user_legal_acceptances_user_idx ON iefa.user_legal_acceptances (user_id, accepted_at DESC);

ALTER TABLE iefa.user_legal_acceptances ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- updated_at trigger
-- ============================================================

CREATE OR REPLACE FUNCTION iefa.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER legal_documents_updated_at
  BEFORE UPDATE ON iefa.legal_documents
  FOR EACH ROW EXECUTE FUNCTION iefa.set_updated_at();
