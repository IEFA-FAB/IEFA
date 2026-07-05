-- ============================================
-- journal.review_assignments — convite único ativo por (artigo, revisor)
-- ============================================
-- inviteReviewerFn fazia SELECT-then-INSERT para barrar convite duplicado, o que
-- é vulnerável a TOCTOU (dois requests concorrentes passam na checagem e inserem
-- dois convites). Este índice único parcial garante a atomicidade no banco:
-- só pode existir UM assignment ativo (invited/accepted/completed) por
-- (article_id, reviewer_id). Convites recusados/expirados não contam, então o
-- editor ainda pode reconvidar o mesmo revisor após uma recusa.
--
-- A aplicação passa a tratar a violação (SQLSTATE 23505) com mensagem amigável.

create unique index if not exists uq_review_assignments_active_reviewer
on journal.review_assignments (article_id, reviewer_id)
where status in ('invited', 'accepted', 'completed') and reviewer_id is not null;
