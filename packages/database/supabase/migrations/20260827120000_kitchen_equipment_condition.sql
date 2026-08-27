-- Estado do parque de equipamentos: ficha técnica, rotina de manutenção e pane.
--
-- O modelo tipado (20260825120000) responde "o que a cozinha TEM". Não responde nada sobre
-- estado: se o forno está quebrado, quando foi a última limpeza da coifa, ou quantas cozinhas
-- da FAB estão sem forno combinado FUNCIONANDO. Esta migration acrescenta a camada de estado.
--
-- Três tabelas novas, seguindo a mesma separação catálogo/instância que o schema já usa:
--
--   equipment_maintenance_plan — o QUE fazer e de quanto em quanto tempo. Ancorado no PAPEL
--                      XOR no MODELO, igual à exigência da preparação: "limpeza de coifa" vale
--                      para toda coifa de qualquer marca (papel); "troca da guarnição da porta"
--                      é de um modelo. kitchen_id null = plano global, igual a equipment_model.
--   equipment_maintenance_log — o que FOI feito, em qual unidade, por quem.
--   equipment_issue  — a PANE relatada por quem está na praça.
--
-- E duas regras que este DDL existe para tornar possíveis:
--
-- 1. CONDIÇÃO NÃO É COLUNA. A condição de uma unidade (operacional / degradado / parado /
--    baixado) é DERIVADA de `equipment_unit.status` + panes abertas, em função pura no domínio.
--    Uma coluna `condition` ao lado de `status` seria uma segunda fonte de verdade para o mesmo
--    fato: o gestor marcaria "em manutenção" e a praça continuaria vendo "ok". `status` segue
--    sendo o fato ADMINISTRATIVO, alterado só pela Gestão Cozinha.
--
-- 2. VENCIMENTO NÃO É COLUNA. `next_due_on` é calculado: último `performed_on` + interval_days;
--    sem log, `installed_on ?? acquired_on` + interval_days; sem nenhuma das duas datas, o par
--    unidade × plano é "SEM REGISTRO" — nunca "vencido". Persistir a data exigiria recalcular
--    toda linha a cada log e a cada mudança de plano, e a primeira divergência seria silenciosa.
--    O estado "sem registro" é o que impede que 100% do parque nasça vermelho no dia desta
--    migration: um relatório que acusa tudo não é lido, e o que ele esconde é justamente a
--    unidade que está mesmo atrasada.
--
-- Acesso: RLS ligada SEM policy, igual às seis tabelas irmãs. Nenhum cliente toca direto; todo
-- caminho passa por server fn com a service key.

begin;

-- ── Ficha técnica: do MODELO, não da unidade ─────────────────────────────────
-- Uma cozinha corrigir a potência do iCombi corrige para TODAS. Se a ficha morasse na unidade,
-- ~130 cozinhas digitariam a mesma ficha 130 vezes e nenhuma estaria certa — é exatamente o
-- problema que `equipment_model` foi criado para resolver.
--
-- Tudo nulo por construção: o modelo genérico ("tenho um forno combinado de 10 GN", sem marca)
-- tem de continuar cadastrável com a ficha inteira em branco. Pelo mesmo motivo do seed de
-- 20260825120100, NADA aqui é semeado: um número errado no catálogo é pior que um campo vazio,
-- porque vira premissa de dimensionamento que ninguém revisa.

alter table kitchen.equipment_model
	add column if not exists energy_source           text,
	add column if not exists voltage                 text,
	add column if not exists width_cm                numeric,
	add column if not exists depth_cm                numeric,
	add column if not exists height_cm               numeric,
	add column if not exists weight_kg               numeric,
	add column if not exists requires_hood           boolean,
	add column if not exists water_inlet             boolean,
	add column if not exists drain_required          boolean,
	add column if not exists manual_url              text,
	add column if not exists expected_lifespan_years smallint;

do $$
begin
	if not exists (select 1 from pg_constraint where conname = 'equipment_model_energy_source_check') then
		alter table kitchen.equipment_model
			add constraint equipment_model_energy_source_check
			check (energy_source is null or energy_source in ('electric', 'gas', 'steam', 'mixed', 'manual'));
	end if;
	if not exists (select 1 from pg_constraint where conname = 'equipment_model_dimensions_check') then
		alter table kitchen.equipment_model
			add constraint equipment_model_dimensions_check
			check (
				(width_cm  is null or width_cm  > 0) and
				(depth_cm  is null or depth_cm  > 0) and
				(height_cm is null or height_cm > 0) and
				(weight_kg is null or weight_kg > 0) and
				(expected_lifespan_years is null or expected_lifespan_years > 0)
			);
	end if;
end $$;

comment on column kitchen.equipment_model.energy_source is
	'Fonte de energia do modelo: electric | gas | steam | mixed | manual. Nulo = desconhecido, que é o estado normal do modelo genérico.';
comment on column kitchen.equipment_model.requires_hood is
	'Exige captação de gases (coifa) na instalação. Informação de projeto de cozinha, não de operação — mora no modelo porque não varia peça a peça.';

-- ── Dados patrimoniais: da UNIDADE, não do modelo ────────────────────────────
-- O que varia peça a peça. `asset_tag`, `serial_number` e `acquired_on` já existem.
-- `installed_on` é a âncora de vencimento quando a unidade nunca teve manutenção registrada
-- (ver regra 2 no topo) — é por isso que ela é uma coluna e não uma nota em texto livre.

alter table kitchen.equipment_unit
	add column if not exists installed_on   date,
	add column if not exists warranty_until date,
	add column if not exists supplier       text;

comment on column kitchen.equipment_unit.installed_on is
	'Data de instalação/entrada em operação. Segunda âncora do cálculo de vencimento de manutenção, usada quando não há nenhuma execução registrada. Sem ela e sem acquired_on, o par unidade × plano é reportado como "sem registro", NUNCA como vencido.';

-- ── Plano de manutenção ──────────────────────────────────────────────────────

create table if not exists kitchen.equipment_maintenance_plan (
	id                uuid primary key default gen_random_uuid(),
	role_id           uuid references kitchen.equipment_role(id),   -- XOR com model_id
	model_id          uuid references kitchen.equipment_model(id),
	kitchen_id        bigint references core.kitchen(id),           -- null = plano global (Catálogo Global)
	code              text,                                         -- slug estável do plano global; null em plano local
	title             text not null,
	kind              text not null default 'preventive',
	interval_days     integer not null,
	tolerance_days    integer not null default 0,
	instructions      text,
	estimated_minutes integer,
	is_required       boolean not null default true,
	sort_order        integer not null default 100,
	created_at        timestamptz not null default now(),
	updated_at        timestamptz not null default now(),
	deleted_at        timestamptz,
	constraint equipment_maintenance_plan_target_xor check (
		(role_id is not null and model_id is null) or (role_id is null and model_id is not null)
	),
	constraint equipment_maintenance_plan_kind_check check (
		kind in ('preventive', 'inspection', 'cleaning', 'calibration', 'legal')
	),
	constraint equipment_maintenance_plan_interval_check check (interval_days > 0),
	constraint equipment_maintenance_plan_tolerance_check check (tolerance_days >= 0 and tolerance_days < interval_days),
	constraint equipment_maintenance_plan_minutes_check check (estimated_minutes is null or estimated_minutes > 0),
	-- Plano local não tem chave natural global: `code` é do catálogo, e reaproveitá-lo numa
	-- cozinha faria dois planos diferentes responderem pelo mesmo identificador de seed.
	constraint equipment_maintenance_plan_code_scope_check check (code is null or kitchen_id is null)
);
create unique index if not exists equipment_maintenance_plan_code_uniq
	on kitchen.equipment_maintenance_plan (code) where code is not null;
-- Mesmo título duas vezes para o mesmo alvo, no mesmo escopo, é duplicata — e duplicata em
-- plano de manutenção duplica a coluna da matriz e o alarme de vencimento.
create unique index if not exists equipment_maintenance_plan_title_uniq
	on kitchen.equipment_maintenance_plan (
		coalesce(role_id, model_id),
		lower(title),
		coalesce(kitchen_id, 0)
	) where deleted_at is null;
create index if not exists equipment_maintenance_plan_role_idx
	on kitchen.equipment_maintenance_plan (role_id) where role_id is not null and deleted_at is null;
create index if not exists equipment_maintenance_plan_model_idx
	on kitchen.equipment_maintenance_plan (model_id) where model_id is not null and deleted_at is null;
create index if not exists equipment_maintenance_plan_kitchen_idx
	on kitchen.equipment_maintenance_plan (kitchen_id) where deleted_at is null;

comment on table kitchen.equipment_maintenance_plan is
	'Rotina de manutenção: o QUE fazer e de quanto em quanto tempo. Ancorada no PAPEL (vale para toda unidade que assume o papel, de qualquer marca) XOR no MODELO (vale só para aquele modelo). kitchen_id null = plano global; preenchido = rotina da própria cozinha. RLS ligada sem policy.';
comment on column kitchen.equipment_maintenance_plan.interval_days is
	'Periodicidade em DIAS, não um enum de frequência: "a cada 45 dias" continua representável e a conta de vencimento fica trivial. A UI oferece atalhos (semanal/mensal/trimestral/semestral/anual) que gravam o número.';
comment on column kitchen.equipment_maintenance_plan.tolerance_days is
	'Folga antes de a rotina ser reportada como vencida. Menor que interval_days: tolerância maior que o próprio período tornaria a rotina inalcançável — nunca venceria.';
comment on column kitchen.equipment_maintenance_plan.kind is
	'preventive | inspection | cleaning | calibration | legal. `legal` marca rotina de periodicidade regulada — nenhuma é semeada, porque errar a periodicidade de uma obrigação legal no catálogo é pior que não tê-la.';

-- ── Registro de execução ─────────────────────────────────────────────────────

create table if not exists kitchen.equipment_maintenance_log (
	id           uuid primary key default gen_random_uuid(),
	unit_id      uuid not null references kitchen.equipment_unit(id),
	plan_id      uuid references kitchen.equipment_maintenance_plan(id), -- null = corretiva / avulsa
	issue_id     uuid,                                                   -- FK adicionada abaixo (equipment_issue ainda não existe)
	kind         text not null default 'preventive',
	performed_on date not null,
	performed_by uuid references auth.users(id),
	provider     text not null default 'in_house',
	cost         numeric,
	notes        text,
	created_at   timestamptz not null default now(),
	deleted_at   timestamptz,
	constraint equipment_maintenance_log_kind_check check (
		kind in ('preventive', 'inspection', 'cleaning', 'calibration', 'legal', 'corrective')
	),
	constraint equipment_maintenance_log_provider_check check (
		provider in ('in_house', 'contract', 'manufacturer')
	),
	constraint equipment_maintenance_log_cost_check check (cost is null or cost >= 0)
);
create index if not exists equipment_maintenance_log_unit_idx
	on kitchen.equipment_maintenance_log (unit_id, performed_on desc) where deleted_at is null;
create index if not exists equipment_maintenance_log_plan_idx
	on kitchen.equipment_maintenance_log (plan_id, unit_id, performed_on desc) where plan_id is not null and deleted_at is null;
create index if not exists equipment_maintenance_log_issue_idx
	on kitchen.equipment_maintenance_log (issue_id) where issue_id is not null and deleted_at is null;

comment on table kitchen.equipment_maintenance_log is
	'Execução de manutenção numa unidade. É a primeira âncora do cálculo de vencimento. RLS ligada sem policy.';
comment on column kitchen.equipment_maintenance_log.plan_id is
	'Plano executado, ou null para manutenção corretiva/avulsa — que é a maioria. Exigir um plano em todo registro faria a praça inventar plano só para conseguir registrar um conserto, e o catálogo de rotinas viraria lixo.';
comment on column kitchen.equipment_maintenance_log.issue_id is
	'Pane que originou o conserto, quando houve. É o que fecha o ciclo relato → conserto e permite medir quanto tempo a unidade ficou parada.';

-- ── Pane ─────────────────────────────────────────────────────────────────────

create table if not exists kitchen.equipment_issue (
	id              uuid primary key default gen_random_uuid(),
	unit_id         uuid not null references kitchen.equipment_unit(id),
	severity        text not null,
	status          text not null default 'open',
	category        text not null default 'other',
	description     text not null,
	reported_by     uuid references auth.users(id),
	reported_at     timestamptz not null default now(),
	resolved_by     uuid references auth.users(id),
	resolved_at     timestamptz,
	resolution_note text,
	created_at      timestamptz not null default now(),
	updated_at      timestamptz not null default now(),
	deleted_at      timestamptz,
	constraint equipment_issue_severity_check check (severity in ('degraded', 'inoperative')),
	constraint equipment_issue_status_check check (status in ('open', 'in_repair', 'resolved', 'dismissed')),
	constraint equipment_issue_category_check check (
		category in ('mechanical', 'electrical', 'gas', 'hydraulic', 'refrigeration', 'structural', 'other')
	),
	constraint equipment_issue_description_check check (length(btrim(description)) > 0),
	-- Encerrada exige desfecho registrado: quem encerrou e quando. Sem isto, "descartada" é
	-- uma pane que sumiu do relatório sem responsável — e descartar é justamente a decisão
	-- que devolve um equipamento quebrado ao cálculo do planejamento.
	constraint equipment_issue_closure_check check (
		(status in ('open', 'in_repair') and resolved_at is null)
		or (status in ('resolved', 'dismissed') and resolved_at is not null)
	)
);
create index if not exists equipment_issue_unit_open_idx
	on kitchen.equipment_issue (unit_id, severity)
	where status in ('open', 'in_repair') and deleted_at is null;
create index if not exists equipment_issue_unit_idx
	on kitchen.equipment_issue (unit_id, reported_at desc) where deleted_at is null;
create index if not exists equipment_issue_status_idx
	on kitchen.equipment_issue (status, reported_at) where deleted_at is null;

comment on table kitchen.equipment_issue is
	'Pane relatada por quem opera a cozinha. NÃO tem kitchen_id: a cozinha vem de equipment_unit por join — duas colunas para o mesmo fato divergem, e equipment_unit_kitchen_idx já existe. Sem unique de "uma pane aberta por unidade": dois defeitos distintos no mesmo forno são dois problemas distintos.';
comment on column kitchen.equipment_issue.severity is
	'degraded = dá para usar com limitação; inoperative = não dá para usar. Só `inoperative` aberta REMOVE a unidade do cálculo de atendimento das preparações, do mesmo modo que status <> active. `degraded` sinaliza e não remove.';
comment on column kitchen.equipment_issue.status is
	'open → in_repair → resolved | dismissed. `dismissed` é a saída da Gestão Cozinha quando o relato não procede: a unidade volta a contar no planejamento e a pane PERMANECE no histórico, com autor e justificativa. Pane nunca é apagada.';

-- FK circular resolvida depois das duas tabelas existirem.
do $$
begin
	if not exists (select 1 from pg_constraint where conname = 'equipment_maintenance_log_issue_id_fkey') then
		alter table kitchen.equipment_maintenance_log
			add constraint equipment_maintenance_log_issue_id_fkey
			foreign key (issue_id) references kitchen.equipment_issue(id);
	end if;
end $$;

-- ── Segurança ────────────────────────────────────────────────────────────────

alter table kitchen.equipment_maintenance_plan enable row level security;
alter table kitchen.equipment_maintenance_log  enable row level security;
alter table kitchen.equipment_issue            enable row level security;

commit;
