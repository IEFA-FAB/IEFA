-- create_documents_schema
-- App: portal — Comunicações Oficiais (NSCA 5-3/2026, Anexo I).
--
-- Persiste os documentos redigidos na ferramenta, que antes viviam só no
-- `localStorage` do navegador: rascunho perdido em troca de máquina, e nenhuma forma
-- de retomar um ofício começado ontem.
--
-- Autorização: o dono é `owner_id` e ele é lido da SESSÃO na server function, nunca do
-- payload. Não há papel, nem compartilhamento: documento oficial em redação é do
-- redator até virar expediente no SIGADAER.
--
-- Acesso: apenas `service_role`, pelas server functions do portal. anon/authenticated
-- não recebem grant nenhum e as tabelas têm RLS ligada sem policy permissiva — mesmo
-- que o schema seja exposto no PostgREST, um token de usuário não lê linha alguma
-- direto. É o mesmo desenho do schema `alpha`.

create schema if not exists documents;
grant usage on schema documents to service_role;

create or replace function documents.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	new.updated_at = now();
	return new;
end;
$$;

-- ── Documento oficial em redação ──────────────────────────────────────────────
-- `payload` é o DocumentoInput inteiro (`apps/portal/src/lib/comaer/tipos.ts`): a forma
-- do documento muda por espécie e a norma é revisada por portaria, então normalizar
-- cada campo em coluna transformaria toda mudança de anexo da NSCA em migration. O que
-- vira coluna é só o que a LISTA precisa filtrar e ordenar.
create table documents.official_document (
	id uuid primary key default gen_random_uuid(),
	owner_id uuid not null,
	especie text not null,
	ambito text not null check (ambito in ('interno-om', 'comaer', 'externo')),
	sigilo text not null default 'ostensivo' check (sigilo in ('ostensivo', 'reservado', 'secreto', 'ultrassecreto')),
	titulo text,
	payload jsonb not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	deleted_at timestamptz
);
create trigger official_document_updated_at before update on documents.official_document
	for each row execute function documents.set_updated_at();

-- A lista do usuário é sempre "meus documentos, mais recentes primeiro, sem os apagados".
create index official_document_owner_idx on documents.official_document (owner_id, updated_at desc) where deleted_at is null;

-- ── Trilha das gerações por IA ────────────────────────────────────────────────
-- Registra o que foi enviado ao modelo e o que ele devolveu. Existe por dois motivos:
-- reconstituir de onde veio um texto que já foi despachado, e ter a prova de que
-- documento classificado nunca foi submetido a provider (a server function recusa
-- sigilo diferente de ostensivo — a trilha é o que torna a recusa auditável).
create table documents.ai_generation (
	id uuid primary key default gen_random_uuid(),
	owner_id uuid not null,
	document_id uuid references documents.official_document (id) on delete set null,
	modo text not null check (modo in ('redigir', 'revisar')),
	especie text not null,
	rascunho text not null,
	resultado jsonb,
	erro text,
	created_at timestamptz not null default now()
);
create index ai_generation_owner_idx on documents.ai_generation (owner_id, created_at desc);

-- ── RLS: sem policy permissiva; só service_role passa ─────────────────────────
alter table documents.official_document enable row level security;
alter table documents.ai_generation     enable row level security;

grant all on all tables in schema documents to service_role;
grant usage, select on all sequences in schema documents to service_role;
grant execute on all functions in schema documents to service_role;
alter default privileges in schema documents grant all on tables to service_role;
alter default privileges in schema documents grant usage, select on sequences to service_role;
alter default privileges in schema documents grant execute on functions to service_role;

-- ── Expor schema no PostgREST (append à lista existente) ──────────────────────
alter role authenticator set pgrst.db_schemas to 'public, graphql_public, sisub, iefa, journal, forms, rumaer, core, access_control, kitchen, procurement, finance, compras_gov_integration, inventory, siafi_integration, gs1_integration, nutrition_reference, assignment_selection, sucont, alpha, documents';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
