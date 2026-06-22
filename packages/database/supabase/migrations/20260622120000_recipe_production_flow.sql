-- Fluxo de Produção estruturado para Preparações (sisub)
--
-- Representação paralela ao texto livre `recipes.preparation_method`: um DAG de
-- etapas ("recipe_step") com inputs (insumos crus OU saídas de etapas anteriores),
-- outputs (produtos intermediários — múltiplos por etapa), utensílios e duração.
-- O texto livre PERMANECE (aditivo, opt-in). Acesso só via Drizzle/conexão direta
-- do domínio — nada exposto no PostgREST (sem policies/grants novos).
--
-- Convenções seguidas: UUID PK default gen_random_uuid(); created_at/deleted_at
-- (soft-delete); índices parciais `where deleted_at is null`; FKs schema-qualificadas.
-- Espelha a separação catálogo (ingredient) vs instância (recipe_ingredients).

-- ── Catálogo reutilizável ────────────────────────────────────────────────────

-- Etapa reutilizável entre preparações: identidade + defaults (sobrescrevíveis por uso).
create table if not exists sisub.step_template (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,                          -- "lavar arroz", "refogar"
  description              text,                                    -- descrição canônica padrão
  default_duration_minutes integer,                                 -- default sobrescrevível por uso
  kitchen_id               bigint references sisub.kitchen(id),     -- null = global
  created_at               timestamptz not null default now(),
  deleted_at               timestamptz
);
-- Nome único por escopo (global = kitchen_id null → coalesce 0), só entre ativos.
create unique index if not exists step_template_name_active_uniq
  on sisub.step_template (lower(name), coalesce(kitchen_id, 0)) where deleted_at is null;

-- Utensílio reutilizável.
create table if not exists sisub.utensil (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,                                         -- "panela", "forno combinado"
  kitchen_id bigint references sisub.kitchen(id),                   -- null = global
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists utensil_name_active_uniq
  on sisub.utensil (lower(name), coalesce(kitchen_id, 0)) where deleted_at is null;

-- Utensílios PADRÃO de um template (sugeridos ao inserir a etapa numa receita).
create table if not exists sisub.step_template_utensil (
  id               uuid primary key default gen_random_uuid(),
  step_template_id uuid not null references sisub.step_template(id),
  utensil_id       uuid not null references sisub.utensil(id),
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create unique index if not exists step_template_utensil_uniq
  on sisub.step_template_utensil (step_template_id, utensil_id) where deleted_at is null;

-- ── Instância por-receita (o grafo) ──────────────────────────────────────────

-- Nó do DAG: uma etapa de produção dentro de UMA preparação (versão de recipe).
create table if not exists sisub.recipe_step (
  id               uuid primary key default gen_random_uuid(),
  recipe_id        uuid not null references sisub.recipes(id),
  step_template_id uuid references sisub.step_template(id),         -- null = etapa ad-hoc
  label            text,                                            -- override do nome p/ esta receita
  description      text,                                            -- override da descrição
  duration_minutes integer,                                         -- override do default do template
  canvas_x         double precision not null default 0,
  canvas_y         double precision not null default 0,
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index if not exists recipe_step_recipe_idx
  on sisub.recipe_step (recipe_id) where deleted_at is null;

-- Saídas (produtos intermediários). Uma etapa pode ter MÚLTIPLAS saídas distintas
-- (ex.: "separar clara/gema"). `recipe_id` é denormalizado (validado no domínio)
-- só para sustentar o índice parcial-único de "1 saída final por receita".
create table if not exists sisub.recipe_step_output (
  id             uuid primary key default gen_random_uuid(),
  recipe_step_id uuid not null references sisub.recipe_step(id),
  recipe_id      uuid not null references sisub.recipes(id),        -- denormalizado p/ índice de final
  label          text,                                             -- "arroz lavado", "clara", "gema"
  quantity       numeric,
  measure_unit   text,                                             -- g/ml/un
  is_final       boolean not null default false,                   -- a própria preparação
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists recipe_step_output_step_idx
  on sisub.recipe_step_output (recipe_step_id) where deleted_at is null;
-- No máximo 1 saída final por receita (garantia barata no DB; "exatamente 1" no domínio).
create unique index if not exists recipe_step_output_final_uniq
  on sisub.recipe_step_output (recipe_id) where is_final and deleted_at is null;

-- Inputs de uma etapa: insumo cru (recipe_ingredients) XOR saída de outra etapa.
-- Cada linha = uma EDGE do grafo (a source handle é uma recipe_step_output específica).
create table if not exists sisub.recipe_step_input (
  id                   uuid primary key default gen_random_uuid(),
  recipe_step_id       uuid not null references sisub.recipe_step(id),        -- etapa consumidora
  recipe_ingredient_id uuid references sisub.recipe_ingredients(id),          -- fonte: insumo cru
  source_output_id     uuid references sisub.recipe_step_output(id),          -- fonte: saída de etapa
  quantity             numeric,
  measure_unit         text,
  created_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  constraint recipe_step_input_source_xor check (
    (recipe_ingredient_id is not null and source_output_id is null)
    or (recipe_ingredient_id is null and source_output_id is not null)
  )
);
create index if not exists recipe_step_input_step_idx
  on sisub.recipe_step_input (recipe_step_id) where deleted_at is null;
create index if not exists recipe_step_input_ri_idx
  on sisub.recipe_step_input (recipe_ingredient_id) where deleted_at is null;
create index if not exists recipe_step_input_source_idx
  on sisub.recipe_step_input (source_output_id) where deleted_at is null;

-- Utensílios efetivamente usados nesta etapa (instância).
create table if not exists sisub.recipe_step_utensil (
  id             uuid primary key default gen_random_uuid(),
  recipe_step_id uuid not null references sisub.recipe_step(id),
  utensil_id     uuid not null references sisub.utensil(id),
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create unique index if not exists recipe_step_utensil_uniq
  on sisub.recipe_step_utensil (recipe_step_id, utensil_id) where deleted_at is null;
