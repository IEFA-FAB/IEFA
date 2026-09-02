-- documents_writer_profile
-- Dados fixos do redator: o que se repete em todo documento (OM, contato, signatário,
-- localidade) e hoje é digitado de novo a cada ofício.
--
-- Uma linha por usuário, chaveada pelo próprio dono — não há perfil de OM compartilhado
-- nesta fatia, e por isso `owner_id` é a chave primária: dois perfis para o mesmo usuário
-- não é um estado que a ferramenta saiba resolver.
--
-- O que este perfil NÃO guarda, de propósito: o número sequencial do setor. É contador
-- vivo, compartilhado pela seção, e sugerir "o próximo" a partir do que este usuário usou
-- por último produziria número duplicado — erro que num ofício só aparece depois do
-- despacho.
--
-- Acesso: apenas `service_role`, pelas server functions. RLS ligada sem policy permissiva,
-- como no resto do schema.

create table documents.writer_profile (
	owner_id uuid primary key,
	om_name text,
	om_acronym text,
	om_sector text,
	om_address text,
	om_phone text,
	om_email text,
	signer_name text,
	signer_rank text,
	signer_quadro text,
	signer_position text,
	city text,
	nup_prefix text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create trigger writer_profile_updated_at before update on documents.writer_profile
	for each row execute function documents.set_updated_at();

alter table documents.writer_profile enable row level security;

grant all on documents.writer_profile to service_role;
