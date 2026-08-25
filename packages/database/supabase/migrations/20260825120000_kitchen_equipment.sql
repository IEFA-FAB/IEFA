-- Equipamentos de cozinha: catálogo tipado, parque instalado e exigência por preparação.
--
-- O que existia: `kitchen.utensil` — uma linha de TEXTO LIVRE por nome, ligada à etapa do
-- fluxo de produção. Serve para utensílio de mão ("colher de pau", "tábua"), mas não
-- responde a nenhuma das perguntas que o planejamento precisa fazer:
--   - "esta cozinha consegue produzir esta preparação?"
--   - "quantos fornos combinados a cozinha tem, e de que capacidade?"
--   - "o iVario está ocupado como panela de pressão nesta etapa, sobra chapa?"
--
-- Modelo em três camadas, espelhando a separação catálogo/instância já usada em
-- ingredient × recipe_ingredients:
--
--   equipment_role   — o PAPEL funcional ("forno combinado", "panela de pressão", "chapa").
--                      Taxonomia global, é por ela que a exigência da preparação fala.
--   equipment_model  — o MODELO comercial ("Rational iVario Pro 2-S", "Caldeira 100 L").
--                      Declara QUAIS papéis pode assumir (m:n) — é o que resolve o
--                      multifuncional: um iVario é chapa, panela de pressão, fritadeira,
--                      caldeirão e panela comum, um de cada vez por cuba.
--   equipment_unit   — a UNIDADE FÍSICA instalada numa cozinha ("Forno 1", patrimônio
--                      123456). É o que se conta ao perguntar se a cozinha atende.
--
-- E do lado da preparação:
--
--   recipe_equipment_requirement — a lista MÍNIMA. Cada linha exige um papel XOR um modelo
--                      específico, com quantidade. "1 forno combinado" (papel, qualquer
--                      modelo que o assuma) ou "1 Rational iVario Pro L" (modelo, quando a
--                      ficha depende daquele equipamento). Opcionalmente amarrada a uma
--                      etapa do fluxo (`recipe_step_id`), para quem já montou o DAG.
--
-- Por que `simultaneous_slots` e não uma contagem simples: um iVario Pro 2-S tem DUAS cubas
-- independentes — assume dois papéis ao mesmo tempo. Um fogão de 6 bocas atende 6 exigências
-- de boca. Um iCombi tem uma câmara: um papel por vez. Sem isso, o cálculo de atendimento ou
-- superestima (contando o multifuncional uma vez por papel que sabe fazer) ou subestima
-- (contando o fogão como uma panela só). O casamento exigência × unidade é feito no domínio
-- (`utils/equipment-matching.ts`), que trata cada slot como um recurso disputado.
--
-- `kitchen.utensil` PERMANECE e não é tocado: utensílio de mão continua sendo utensílio.
-- Equipamento é a camada nova, com tipo, parque e exigência.
--
-- Acesso: só via Drizzle/conexão direta do domínio. RLS ligada SEM policy — mesma postura
-- das tabelas do fluxo de produção (20260722120000): nenhum cliente toca estas tabelas
-- direto, todo caminho passa por server fn com a service key.

begin;

-- ── Catálogo: papéis ─────────────────────────────────────────────────────────

create table if not exists kitchen.equipment_role (
	id          uuid primary key default gen_random_uuid(),
	code        text not null,                          -- slug estável: 'combi_oven', 'pressure_cooker'
	name        text not null,                          -- rótulo em pt-BR: "Forno combinado"
	description text,
	category    text not null default 'coccao',
	sort_order  integer not null default 100,
	created_at  timestamptz not null default now(),
	deleted_at  timestamptz,
	constraint equipment_role_category_check check (category in ('coccao', 'preparo', 'conservacao', 'apoio'))
);
-- `code` é o identificador citado por seed, import e contrato de IA: único inclusive entre
-- soft-deletados, para que reativar não colida com um code reintroduzido no meio tempo.
create unique index if not exists equipment_role_code_uniq
	on kitchen.equipment_role (code);
create index if not exists equipment_role_category_idx
	on kitchen.equipment_role (category, sort_order) where deleted_at is null;

comment on table kitchen.equipment_role is
	'Papel funcional de um equipamento (forno combinado, panela de pressão, chapa…). Taxonomia global — é por ela que a exigência da preparação fala. RLS ligada sem policy: acesso exclusivo via service key.';
comment on column kitchen.equipment_role.code is
	'Slug estável do papel. Chave natural de seed/import — nunca reaproveitar um code para outro papel.';

-- ── Catálogo: modelos ────────────────────────────────────────────────────────

create table if not exists kitchen.equipment_model (
	id                 uuid primary key default gen_random_uuid(),
	slug               text,                             -- chave natural do catálogo global (null em modelo de cozinha)
	manufacturer       text,                             -- 'Rational'; null em modelo genérico
	name               text not null,                    -- 'iVario Pro 2-S'
	slot_capacity_liters numeric,                        -- capacidade útil de UMA zona, em litros (uma cuba, a caldeira)
	slot_capacity_gn     smallint,                       -- capacidade útil de UMA zona, em cubas GN 1/1
	capacity_label       text,                           -- como o fabricante anuncia o TOTAL: '6 × GN 1/1', '2 × 25 L'
	simultaneous_slots integer not null default 1,       -- zonas independentes (cubas, bocas, câmaras)
	power_kw           numeric,
	is_generic         boolean not null default false,   -- modelo sem marca, p/ cozinha que só sabe "tem um forno combinado"
	kitchen_id         bigint references core.kitchen(id), -- null = catálogo global (SDAB)
	notes              text,
	created_at         timestamptz not null default now(),
	deleted_at         timestamptz,
	constraint equipment_model_slots_check check (simultaneous_slots > 0),
	constraint equipment_model_capacity_check check (slot_capacity_liters is null or slot_capacity_liters > 0),
	constraint equipment_model_capacity_gn_check check (slot_capacity_gn is null or slot_capacity_gn > 0)
);
create unique index if not exists equipment_model_slug_uniq
	on kitchen.equipment_model (slug) where slug is not null;
-- Nome único por escopo (global = kitchen_id null → coalesce 0), só entre ativos.
create unique index if not exists equipment_model_name_active_uniq
	on kitchen.equipment_model (lower(coalesce(manufacturer, '')), lower(name), coalesce(kitchen_id, 0)) where deleted_at is null;
create index if not exists equipment_model_kitchen_idx
	on kitchen.equipment_model (kitchen_id) where deleted_at is null;

comment on table kitchen.equipment_model is
	'Modelo comercial de equipamento. kitchen_id null = catálogo global; preenchido = modelo criado por uma cozinha. Os papéis que o modelo assume ficam em equipment_model_role.';
comment on column kitchen.equipment_model.slot_capacity_liters is
	'Capacidade de UMA zona, não do equipamento inteiro. Um iVario Pro 2-S são duas cubas de 25 L: 25, não 50 — a exigência "panela de 40 L" NÃO é atendida por ele, e somar as cubas diria que sim. O total anunciado vive em capacity_label, que é texto de exibição.';
comment on column kitchen.equipment_model.simultaneous_slots is
	'Zonas independentes do equipamento (cubas do iVario, bocas do fogão, câmaras do forno). Quantas exigências distintas a unidade atende AO MESMO TEMPO. Um multifuncional de 1 cuba assume vários papéis, mas um por vez.';

-- Papéis que o modelo pode assumir. É a linha que torna o multifuncional representável.
create table if not exists kitchen.equipment_model_role (
	id         uuid primary key default gen_random_uuid(),
	model_id   uuid not null references kitchen.equipment_model(id),
	role_id    uuid not null references kitchen.equipment_role(id),
	is_primary boolean not null default false,           -- papel "de catálogo" do modelo, usado no rótulo
	notes      text,
	created_at timestamptz not null default now(),
	deleted_at timestamptz
);
create unique index if not exists equipment_model_role_uniq
	on kitchen.equipment_model_role (model_id, role_id) where deleted_at is null;
-- No máximo um papel principal por modelo.
create unique index if not exists equipment_model_role_primary_uniq
	on kitchen.equipment_model_role (model_id) where is_primary and deleted_at is null;
create index if not exists equipment_model_role_role_idx
	on kitchen.equipment_model_role (role_id) where deleted_at is null;

-- ── Parque instalado ─────────────────────────────────────────────────────────

create table if not exists kitchen.equipment_unit (
	id                 uuid primary key default gen_random_uuid(),
	kitchen_id         bigint not null references core.kitchen(id),
	model_id           uuid not null references kitchen.equipment_model(id),
	label              text not null,                    -- como a cozinha chama: "Forno 1", "iVario da praça quente"
	asset_tag          text,                             -- patrimônio
	serial_number      text,
	status             text not null default 'active',
	simultaneous_slots integer,                          -- override do modelo (cuba interditada, boca queimada); null = herda
	acquired_on        date,
	notes              text,
	created_at         timestamptz not null default now(),
	updated_at         timestamptz not null default now(),
	deleted_at         timestamptz,
	constraint equipment_unit_status_check check (status in ('active', 'maintenance', 'decommissioned')),
	constraint equipment_unit_slots_check check (simultaneous_slots is null or simultaneous_slots > 0)
);
create unique index if not exists equipment_unit_label_active_uniq
	on kitchen.equipment_unit (kitchen_id, lower(label)) where deleted_at is null;
create unique index if not exists equipment_unit_asset_tag_active_uniq
	on kitchen.equipment_unit (kitchen_id, lower(asset_tag)) where asset_tag is not null and deleted_at is null;
create index if not exists equipment_unit_kitchen_idx
	on kitchen.equipment_unit (kitchen_id) where deleted_at is null;
create index if not exists equipment_unit_model_idx
	on kitchen.equipment_unit (model_id) where deleted_at is null;

comment on table kitchen.equipment_unit is
	'Unidade física instalada numa cozinha. Uma linha por equipamento real — é o que se conta ao verificar se a cozinha atende a lista mínima de uma preparação. status <> active não conta no atendimento.';

-- Ajuste de papel na UNIDADE: acessório que habilita (tampa de pressão comprada à parte) ou
-- defeito que desabilita. Sem isto, o parque só sabe o que o catálogo do fabricante diz.
create table if not exists kitchen.equipment_unit_role (
	id         uuid primary key default gen_random_uuid(),
	unit_id    uuid not null references kitchen.equipment_unit(id),
	role_id    uuid not null references kitchen.equipment_role(id),
	available  boolean not null,                         -- true = habilita além do modelo; false = desabilita o do modelo
	notes      text,
	created_at timestamptz not null default now(),
	deleted_at timestamptz
);
create unique index if not exists equipment_unit_role_uniq
	on kitchen.equipment_unit_role (unit_id, role_id) where deleted_at is null;

comment on table kitchen.equipment_unit_role is
	'Exceção de papel na unidade física: available=true adiciona um papel que o modelo não declara (acessório), false remove um que ele declara (defeito/acessório ausente). Papéis efetivos = papéis do modelo ∪ adições − remoções.';

-- ── Exigência da preparação ──────────────────────────────────────────────────

create table if not exists kitchen.recipe_equipment_requirement (
	id                  uuid primary key default gen_random_uuid(),
	recipe_id           uuid not null references kitchen.recipes(id),
	recipe_step_id      uuid references kitchen.recipe_step(id),      -- opcional: amarra a exigência a uma etapa do DAG
	role_id             uuid references kitchen.equipment_role(id),   -- XOR com model_id
	model_id            uuid references kitchen.equipment_model(id),
	quantity            integer not null default 1,
	-- Escala: a exigência vale POR BATELADA (default) ou é fixa para a leva inteira.
	-- Sem isto a lista mente em volume: 900 porções de uma receita de rendimento 100 são 9
	-- bateladas, e "1 forno" continua sendo 1 forno — nove vezes, não nove fornos.
	scaling             text not null default 'per_batch',
	batch_portions      numeric,                                      -- null = usa recipes.portion_yield da versão
	min_capacity_liters numeric,                                      -- "caldeira de pelo menos 100 L"
	min_capacity_gn     smallint,                                     -- "forno combinado de pelo menos 10 GN"
	notes               text,
	created_at          timestamptz not null default now(),
	deleted_at          timestamptz,
	constraint recipe_equipment_requirement_target_xor check (
		(role_id is not null and model_id is null) or (role_id is null and model_id is not null)
	),
	constraint recipe_equipment_requirement_quantity_check check (quantity > 0),
	constraint recipe_equipment_requirement_scaling_check check (scaling in ('per_batch', 'fixed')),
	constraint recipe_equipment_requirement_batch_check check (batch_portions is null or batch_portions > 0),
	constraint recipe_equipment_requirement_capacity_check check (min_capacity_liters is null or min_capacity_liters > 0),
	constraint recipe_equipment_requirement_capacity_gn_check check (min_capacity_gn is null or min_capacity_gn > 0)
);
create index if not exists recipe_equipment_requirement_recipe_idx
	on kitchen.recipe_equipment_requirement (recipe_id) where deleted_at is null;
create index if not exists recipe_equipment_requirement_step_idx
	on kitchen.recipe_equipment_requirement (recipe_step_id) where deleted_at is null;
-- Uma linha por alvo dentro do mesmo escopo (receita + etapa): repetir o mesmo forno em duas
-- linhas esconde a quantidade real, que é o campo `quantity`.
create unique index if not exists recipe_equipment_requirement_target_uniq
	on kitchen.recipe_equipment_requirement (
		recipe_id,
		coalesce(recipe_step_id, '00000000-0000-0000-0000-000000000000'::uuid),
		coalesce(role_id, model_id)
	) where deleted_at is null;

comment on table kitchen.recipe_equipment_requirement is
	'Lista MÍNIMA de equipamentos de uma preparação. Cada linha exige um papel (qualquer modelo que o assuma) XOR um modelo específico. quantity = quantas unidades SIMULTÂNEAS por batelada. recipe_step_id opcional amarra à etapa do fluxo — exigências de etapas em níveis diferentes do DAG NÃO são concorrentes.';
comment on column kitchen.recipe_equipment_requirement.scaling is
	'per_batch = quantity vale para uma batelada de batch_portions (ou do portion_yield da receita); o volume vira número de CICLOS, não de equipamentos. fixed = a leva inteira usa a mesma unidade (ultracongelador, seladora, balança).';

-- ── Ponte com o catálogo de utensílios ───────────────────────────────────────
-- `kitchen.utensil` nasceu com texto livre e o próprio exemplo da migration do fluxo era
-- "forno combinado" — ou seja, já há linha de utensílio que na verdade é equipamento. Fundir as
-- duas tabelas destruiria o utensílio de mão (colher, tábua, escumadeira), que é informação real
-- para quem está na praça. A ponte é uma coluna: utensílio que é equipamento aponta para o papel,
-- o resto fica null. Os vínculos `recipe_step_utensil` existentes continuam válidos.

alter table kitchen.utensil
	add column if not exists role_id uuid references kitchen.equipment_role(id);

create index if not exists utensil_role_idx
	on kitchen.utensil (role_id) where role_id is not null and deleted_at is null;

comment on column kitchen.utensil.role_id is
	'Papel de equipamento correspondente, quando este "utensílio" é na verdade um equipamento. null = utensílio de mão. Serve para SUGERIR a exigência a partir do fluxo — nunca para criá-la sozinho: o fluxo diz "usa forno", não diz "precisa de um forno exclusivo".';

-- ── Segurança ────────────────────────────────────────────────────────────────
-- RLS sem policy = nega tudo para anon/authenticated no PostgREST. Todo acesso passa por
-- server fn com a service key, que ignora RLS.

alter table kitchen.equipment_role enable row level security;
alter table kitchen.equipment_model enable row level security;
alter table kitchen.equipment_model_role enable row level security;
alter table kitchen.equipment_unit enable row level security;
alter table kitchen.equipment_unit_role enable row level security;
alter table kitchen.recipe_equipment_requirement enable row level security;

commit;
