-- documents_chat_message
-- Histórico da conversa que redigiu o documento, para retomar de onde parou.
--
-- Decisão de retenção (era a pergunta em aberto do design): a conversa vive com o
-- DOCUMENTO e morre com ele. O documento salvo é o registro do que foi despachado; a
-- conversa é o andaime — ela guarda pedido em linguagem natural, às vezes mais revelador
-- que o próprio expediente, e não há motivo para sobreviver ao que ajudou a construir.
-- Por isso a FK é `on delete cascade`, e a exclusão lógica do documento apaga o histórico
-- de fato (ver `deleteDocumentFn`).
--
-- Só conversa de documento SALVO é gravada: enquanto o documento é rascunho de navegador,
-- a conversa é de memória.

create table documents.chat_message (
	id uuid primary key default gen_random_uuid(),
	document_id uuid not null references documents.official_document (id) on delete cascade,
	owner_id uuid not null,
	role text not null check (role in ('user', 'assistant')),
	content text not null,
	created_at timestamptz not null default now()
);

create index chat_message_document_idx on documents.chat_message (document_id, created_at);

alter table documents.chat_message enable row level security;

grant all on documents.chat_message to service_role;
