-- Substituição de insumos passa a viver NO insumo (antes vivia na preparação via
-- kitchen.recipe_ingredient_alternatives, agora órfã). Relação DIRECIONAL: uma linha
-- (ingredient_id -> substitute_ingredient_id) diz que o substituto pode entrar no lugar
-- do insumo dono, com um fator opcional (default 1) de conversão de quantidade.

create table if not exists kitchen.ingredient_substitution (
    id                       uuid primary key default gen_random_uuid(),
    created_at               timestamptz not null default now(),
    ingredient_id            uuid not null references kitchen.ingredient (id) on delete cascade,
    substitute_ingredient_id uuid not null references kitchen.ingredient (id) on delete cascade,
    factor                   numeric not null default 1,
    constraint ingredient_substitution_unique unique (ingredient_id, substitute_ingredient_id),
    constraint ingredient_substitution_not_self check (ingredient_id <> substitute_ingredient_id)
);

create index if not exists ingredient_substitution_ingredient_id_idx
    on kitchen.ingredient_substitution (ingredient_id);
