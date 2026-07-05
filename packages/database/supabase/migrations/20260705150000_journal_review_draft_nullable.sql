-- ============================================
-- journal.reviews — suporte a rascunho (draft) de parecer
-- ============================================
-- A tabela `journal.reviews` tem `is_draft boolean default true`, mas as colunas
-- `recommendation` e `comments_for_authors` eram NOT NULL. Isso impedia salvar um
-- rascunho de parecer antes do revisor escolher a recomendação / escrever os
-- comentários (violava NOT NULL na primeira gravação do rascunho).
--
-- Tornamos ambas nullable. A obrigatoriedade passa a ser garantida na submissão
-- (submitReviewFn + validação do formulário), não no schema. O CHECK de
-- `recommendation` permanece e continua válido (CHECK aceita NULL).

alter table journal.reviews alter column recommendation drop not null;
alter table journal.reviews alter column comments_for_authors drop not null;
