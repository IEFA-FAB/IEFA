-- ============================================================================
-- ALPHA — bucket de submissões
-- ============================================================================
-- ETP/TR enviados para análise. Bucket privado: os documentos são contratações
-- em elaboração e o acesso passa sempre pelo serviço `alpha`, que usa
-- service_role. Nenhuma policy é criada para anon/authenticated, o que os
-- deixa sem acesso por padrão.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
	'alpha-submissions',
	'alpha-submissions',
	false,
	26214400, -- 25 MiB, mesmo limite validado na rota de upload
	array['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/pdf']
)
on conflict (id) do update
set file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    public             = false;
