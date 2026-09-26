-- ============================================================================
-- Projeto α — demanda do requisitante (change `alpha-requester-demand`)
--
-- Antes do documento, a demanda: o requisitante descreve o problema, os objetivos
-- (fundamentais e meio, com atributos), as alternativas, a solução, os itens, as
-- cotações e os riscos. Dessa estrutura o contrate gera DFD, ETP, Mapa de Riscos e
-- TR campo a campo, e o ETP e o TR vão à ACI como submissões comuns.
--
-- `payload` é o JSON validado por `DemandPayloadSchema` (`@iefa/alpha-client/demand`).
-- Fica em jsonb, e não em tabelas por bloco, porque a forma é do contrate/α e muda com
-- o método; o banco guarda o rascunho e a OM, que é o que decide quem o enxerga.
--
-- Só o α (service_role) lê e escreve: RLS ligada sem policy, como o resto do schema.
-- Sem CPF no payload: o Compras.gov.br pede o CPF dos responsáveis, mas o contrate não
-- o guarda (o guia lembra de tê-lo em mãos).
-- ============================================================================

create table alpha.demand (
	id           uuid primary key default gen_random_uuid(),
	-- Quem criou. Colegas que cobrem a OM como requisitante também editam.
	user_id      uuid not null,
	unit_id      bigint not null references core.units (id) on delete restrict,
	title        text not null,
	payload      jsonb not null default '{}'::jsonb,
	status       text not null default 'rascunho',
	-- Envio à ACI: o ETP e o TR gerados viram submissões com `demand_id`.
	submitted_at timestamptz,
	created_at   timestamptz not null default now(),
	updated_at   timestamptz not null default now(),
	-- Última pessoa que gravou (o autor ou um colega da OM).
	updated_by   uuid,
	constraint demand_title_length check (char_length(title) between 1 and 200),
	constraint demand_status_check check (status in ('rascunho', 'enviada')),
	-- Teto de 1 MiB: 200 itens, 40 cotações e os textos cabem com folga.
	constraint demand_payload_size check (pg_column_size(payload) <= 1048576)
);

create index demand_unit_updated_ix on alpha.demand (unit_id, updated_at desc);
create index demand_user_updated_ix on alpha.demand (user_id, updated_at desc);

create trigger demand_set_updated_at
	before update on alpha.demand
	for each row execute function alpha.set_updated_at();

comment on table alpha.demand is
	'Demanda estruturada do requisitante (problema, objetivos, alternativas, itens, cotações, riscos). Origem das peças geradas no contrate; o ETP e o TR enviados à ACI apontam para ela por submission.demand_id.';
comment on column alpha.demand.payload is
	'DemandPayloadSchema (@iefa/alpha-client/demand), versão em payload.version. Sem CPF.';

-- ----------------------------------------------------------------------------
-- Submissão gerada de uma demanda
-- ----------------------------------------------------------------------------
alter table alpha.submission
	add column demand_id uuid references alpha.demand (id) on delete set null;

create index submission_demand_ix on alpha.submission (demand_id) where demand_id is not null;

comment on column alpha.submission.demand_id is
	'Demanda de origem, quando o documento foi gerado no contrate (e não enviado como arquivo). A ACI a lê para conferir o documento contra a estrutura que o originou.';

-- ----------------------------------------------------------------------------
-- RLS — negação por padrão; só service_role acessa (e bypassa RLS)
-- ----------------------------------------------------------------------------
alter table alpha.demand enable row level security;

grant all on alpha.demand to service_role;
