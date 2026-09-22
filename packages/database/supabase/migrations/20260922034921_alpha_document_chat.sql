-- ============================================================================
-- Projeto α — chat sobre documento (change `alpha-chat-processo`)
--
-- Conversa com o documento do processo (ETP/TR enviado, achados e parecer) ou
-- com arquivos avulsos que o usuário anexa, no contrate. Substitui o que hoje
-- vai para o NotebookLM e o ChatGPT.
--
-- Diferente da sessão do ChatRADA — que não tem tabela e só ganha dono quando a
-- primeira linha cai em `query_log` —, a conversa aqui nasce COM dono. Só o α
-- (service_role) lê e escreve: RLS ligada sem policy, como o resto do schema.
--
-- Guarda (Política de Privacidade):
--   - conversa avulsa não salva: apagada após 180 dias sem atividade, pela
--     rotina `apps/alpha/src/jobs/purge-chats.ts`;
--   - conversa salva (`saved_at`): fica até o dono apagar;
--   - conversa de processo: vive com o processo (`on delete cascade`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- chat_thread — a conversa
-- ----------------------------------------------------------------------------
create table alpha.chat_thread (
	id               uuid primary key default gen_random_uuid(),
	user_id          uuid not null,
	-- NULL = conversa avulsa (anexos próprios). Com processo, as fontes são o
	-- documento enviado, os achados e o parecer, relidos a cada turno.
	submission_id    uuid references alpha.submission(id) on delete cascade,
	title            text,
	-- NULL = não salva. Salva não entra no expurgo.
	saved_at         timestamptz,
	created_at       timestamptz not null default now(),
	-- Relógio do expurgo: turno, anexo enviado e "deixar de salvar" o tocam.
	last_activity_at timestamptz not null default now(),
	constraint chat_thread_title_length check (title is null or char_length(title) <= 200)
);

create index chat_thread_user_activity_ix on alpha.chat_thread (user_id, last_activity_at desc);
create index chat_thread_submission_ix on alpha.chat_thread (submission_id) where submission_id is not null;
-- A rotina de expurgo só olha as avulsas não salvas.
create index chat_thread_purge_ix on alpha.chat_thread (last_activity_at) where submission_id is null and saved_at is null;

comment on table alpha.chat_thread is
	'Conversa do chat sobre documento do contrate. Privada de quem a criou. Com submission_id, é sobre o processo; sem, é avulsa com anexos.';
comment on column alpha.chat_thread.saved_at is
	'Quando o dono salvou a conversa. NULL = não salva: a avulsa é apagada após 180 dias sem atividade.';

-- ----------------------------------------------------------------------------
-- chat_message — os turnos
-- ----------------------------------------------------------------------------
create table alpha.chat_message (
	id            uuid primary key default gen_random_uuid(),
	thread_id     uuid not null references alpha.chat_thread(id) on delete cascade,
	-- Denormalizado de chat_thread.user_id para o teto diário ser uma leitura só,
	-- sem junção, no caminho de todo turno.
	user_id       uuid not null,
	role          text not null,
	content       text not null,
	-- [{ label, kind: norma|achado|documento, ref, located? }] — só as que o α
	-- resolveu contra as fontes do turno (ver apps/alpha/src/chat/citations.ts).
	citations     jsonb not null default '[]'::jsonb,
	status        text not null default 'complete',
	model         text,
	input_tokens  integer,
	output_tokens integer,
	latency_ms    integer,
	created_at    timestamptz not null default now(),
	constraint chat_message_role_check check (role in ('user', 'assistant')),
	constraint chat_message_status_check check (status in ('complete', 'aborted', 'error'))
);

create index chat_message_thread_ix on alpha.chat_message (thread_id, created_at);
-- Teto diário: mensagens do usuário nas últimas 24 h.
create index chat_message_user_turns_ix on alpha.chat_message (user_id, created_at desc) where role = 'user';

comment on table alpha.chat_message is
	'Turnos do chat sobre documento. A pergunta é gravada antes da chamada ao modelo; a resposta, ao fim, com status complete/aborted/error.';

-- ----------------------------------------------------------------------------
-- chat_attachment — arquivos da conversa avulsa
-- ----------------------------------------------------------------------------
create table alpha.chat_attachment (
	id           uuid primary key default gen_random_uuid(),
	thread_id    uuid not null references alpha.chat_thread(id) on delete cascade,
	storage_path text not null unique,
	filename     text not null,
	mime_type    text not null,
	size_bytes   integer not null,
	text_chars   integer not null,
	created_at   timestamptz not null default now()
);

create index chat_attachment_thread_ix on alpha.chat_attachment (thread_id, created_at);

comment on table alpha.chat_attachment is
	'Anexo de conversa avulsa (PDF/DOCX), no bucket alpha-chat-attachments. Só metadado: o texto é reconstruído do arquivo. Apagar a conversa remove o arquivo ANTES da linha.';

-- ----------------------------------------------------------------------------
-- RLS — negação por padrão; só service_role acessa (e bypassa RLS)
-- ----------------------------------------------------------------------------
alter table alpha.chat_thread     enable row level security;
alter table alpha.chat_message    enable row level security;
alter table alpha.chat_attachment enable row level security;

grant all on alpha.chat_thread, alpha.chat_message, alpha.chat_attachment to service_role;

-- ----------------------------------------------------------------------------
-- Bucket dos anexos — privado, mesmo teto e MIME de alpha-submissions
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
	'alpha-chat-attachments',
	'alpha-chat-attachments',
	false,
	26214400, -- 25 MiB, mesmo limite validado na rota de anexo
	array['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/pdf']
)
on conflict (id) do update
set file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    public             = false;
