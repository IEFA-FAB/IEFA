-- ============================================================================
-- Núcleo do catálogo: core.item
-- ============================================================================
-- O sisub nasceu com o "item genérico" dentro do domínio de alimentação
-- (kitchen.ingredient). Isso funcionou enquanto só existia comida — mas os
-- itens auxiliares (EPI, limpeza, embalagem: 168 linhas hoje, marcadas por
-- kitchen.folder.catalog_scope = 'auxiliar') já moram lá disfarçados de
-- insumo, e o parque de equipamentos precisará da mesma identidade para ser
-- comprável pelo mesmo módulo de compras.
--
-- Técnica: SUBTIPO COM PK COMPARTILHADA. core.item recebe uma linha por
-- ingrediente COM O MESMO uuid, e kitchen.ingredient.id passa a ser também
-- FK para core.item.id. Consequência: as 18 chaves estrangeiras que apontam
-- para kitchen.ingredient.id (em 16 tabelas — recipe_ingredients, stock_lot,
-- stock_movement, ingredient_nutrient, purchase_item_ingredient…) NÃO SÃO
-- TOCADAS. Nenhum id muda, nenhuma query quebra, e não passam a existir duas
-- identidades concorrentes para a mesma coisa: existe uma, vista em dois
-- níveis.
--
-- Fase EXPAND. `description` continua sendo escrita em kitchen.ingredient e
-- espelhada em core.item por trigger; a coluna do ingrediente só sai quando
-- todos os leitores migrarem (contract, migration futura).
--
-- Fora do escopo de propósito:
--   - equipamento como item: kitchen.equipment_model ainda não tem item_id.
--     O `kind` já prevê o valor, mas a adoção é de outra mudança — sem caso
--     de uso escrito, item de equipamento seria cadastro-sombra.
--   - kitchen.frozen_preparation: é PRODUZIDA, não comprada. Não é item.
-- ============================================================================

create table core.item (
  id uuid primary key default gen_random_uuid(),

  -- Subtipo. Determina QUAL tabela de perfil carrega as características do
  -- domínio (insumo → kitchen.ingredient). Não é o mesmo que catalog_scope:
  -- um item auxiliar (detergente) é `insumo` no grão de perfil e `auxiliar`
  -- no recorte de catálogo.
  kind text not null default 'insumo'
    check (kind in ('insumo', 'equipamento', 'material')),

  description text not null check (btrim(description) <> ''),

  -- Recorte de catálogo, espelhado de kitchen.folder.catalog_scope na criação.
  -- 'permanente' é reservado para equipamento e não é usado por insumo.
  catalog_scope text not null default 'alimentacao'
    check (catalog_scope in ('alimentacao', 'auxiliar', 'permanente')),

  -- Unidade-base canônica. Só é preenchida quando o valor do perfil já casa
  -- com core.measure_unit — kitchen.ingredient.measure_unit ainda tem texto
  -- livre fora do catálogo (é o que core.v_measure_unit_review lista), e uma
  -- FK dura aqui faria o backfill falhar em cima justamente das linhas sujas.
  measure_unit text references core.measure_unit (code),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table core.item is
  'Núcleo do catálogo: identidade de qualquer coisa comprável ou estocável. O que é específico de um domínio vive na tabela de perfil (insumo → kitchen.ingredient), que compartilha a MESMA PK. Alimentação é linha de produção e não sobe para cá: rendimento, fator de correção, nutrientes e ficha técnica continuam em kitchen.';
comment on column core.item.kind is
  'Subtipo do item — decide qual tabela de perfil o complementa. Nunca inferir o perfil pelo catalog_scope: detergente é kind=insumo com catalog_scope=auxiliar.';
comment on column core.item.measure_unit is
  'Unidade-base canônica (core.measure_unit). NULL quando o perfil ainda carrega unidade fora do catálogo — ver core.v_measure_unit_review.';

create index item_kind_idx on core.item (kind) where deleted_at is null;
create index item_scope_idx on core.item (catalog_scope) where deleted_at is null;

alter table core.item enable row level security;

-- Catálogo: leitura para autenticado; escrita exclusivamente por service role
-- (server fns), como o resto do núcleo.
create policy item_read on core.item
  for select to authenticated using (true);
grant select on core.item to authenticated;

-- ----------------------------------------------------------------------------
-- Backfill — uma linha por ingrediente, COM O MESMO id
-- ----------------------------------------------------------------------------
-- `description` é nullable em kitchen.ingredient e core.item exige texto: as
-- linhas sem descrição recebem um rótulo explícito em vez de serem puladas.
-- Pular criaria ingrediente sem item, e a FK abaixo falharia.
insert into core.item (id, kind, description, catalog_scope, measure_unit, created_at, deleted_at)
select
  i.id,
  'insumo',
  coalesce(nullif(btrim(i.description), ''), '(sem descrição — id ' || left(i.id::text, 8) || ')'),
  coalesce(f.catalog_scope, 'alimentacao'),
  mu.code,
  i.created_at,
  i.deleted_at
from kitchen.ingredient i
left join kitchen.folder f on f.id = i.folder_id
left join core.measure_unit mu on mu.code = upper(btrim(i.measure_unit))
on conflict (id) do nothing;

-- A PK do perfil é a PK do núcleo. É esta linha que evita reescrever as 18 FKs.
alter table kitchen.ingredient
  add constraint ingredient_is_item foreign key (id) references core.item (id);

comment on constraint ingredient_is_item on kitchen.ingredient is
  'Subtipo com PK compartilhada: o id do insumo É o id do item. Não adicionar coluna item_id — duas identidades para a mesma linha é exatamente o estado meio-migrado que esta constraint existe para impedir.';

-- ----------------------------------------------------------------------------
-- Sincronia perfil → núcleo (fase expand)
-- ----------------------------------------------------------------------------
-- Enquanto kitchen.ingredient continuar sendo quem a UI escreve, o núcleo é
-- mantido por trigger. BEFORE INSERT (não AFTER): a linha do item precisa
-- existir ANTES do insert do ingrediente, senão a FK acima rejeita.
create function kitchen.ingredient_sync_item() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_scope text;
begin
  select f.catalog_scope into v_scope from kitchen.folder f where f.id = new.folder_id;

  if tg_op = 'INSERT' then
    insert into core.item (id, kind, description, catalog_scope, measure_unit, created_at, deleted_at)
    values (
      new.id,
      'insumo',
      coalesce(nullif(btrim(new.description), ''), '(sem descrição — id ' || left(new.id::text, 8) || ')'),
      coalesce(v_scope, 'alimentacao'),
      (select mu.code from core.measure_unit mu where mu.code = upper(btrim(new.measure_unit))),
      new.created_at,
      new.deleted_at
    )
    on conflict (id) do nothing;
    return new;
  end if;

  update core.item set
    description = coalesce(nullif(btrim(new.description), ''), description),
    catalog_scope = coalesce(v_scope, catalog_scope),
    measure_unit = (select mu.code from core.measure_unit mu where mu.code = upper(btrim(new.measure_unit))),
    deleted_at = new.deleted_at,
    updated_at = now()
  where id = new.id;
  return new;
end;
$$;

create trigger ingredient_sync_item_ins
  before insert on kitchen.ingredient
  for each row execute function kitchen.ingredient_sync_item();

create trigger ingredient_sync_item_upd
  after update of description, measure_unit, folder_id, deleted_at on kitchen.ingredient
  for each row execute function kitchen.ingredient_sync_item();

-- ----------------------------------------------------------------------------
-- Alvo genérico da compra
-- ----------------------------------------------------------------------------
-- procurement.purchase_item_ingredient passa a apontar para core.item em vez
-- de kitchen.ingredient. Como o id é o MESMO, nenhuma linha se move e nenhum
-- leitor muda — mas a compra deixa de ser restrita a alimento, que é o ponto
-- do núcleo.
--
-- A coluna continua chamando `ingredient_id`. Renomear para `item_id` toca 41
-- usos do identificador Drizzle, três server fns que leem via PostgREST e o
-- contrato snake_case que os testes congelam. É dívida de NOME, não de
-- modelo, e sai no contract junto com a view de compatibilidade — não vale
-- misturar com a mudança de semântica.
alter table procurement.purchase_item_ingredient
  drop constraint purchase_item_ingredient_ingredient_id_fkey;

alter table procurement.purchase_item_ingredient
  add constraint purchase_item_ingredient_item_id_fkey
  foreign key (ingredient_id) references core.item (id) on delete cascade;

comment on column procurement.purchase_item_ingredient.ingredient_id is
  'FK para core.item (NÃO kitchen.ingredient) — o id é o mesmo. Nome mantido por compatibilidade; renomeia para item_id no contract.';

-- Um item pode ter VÁRIAS especificações de compra: a mesma carne comprada a
-- vácuo e comprada congelada são dois purchase_item do mesmo item. É
-- is_default que decide qual a lista de compras usa — e até aqui essa coluna
-- nunca decidiu nada, porque nenhum insumo tinha mais de uma especificação.
--
-- O default herdado é por purchase_item; o que a lista de compras precisa é
-- por ITEM. Onde havia empate, o vínculo mais antigo vence e os demais viram
-- não-default (a escolha certa é revisão manual, não adivinhação).
with ranked as (
  select id, row_number() over (
           partition by ingredient_id order by is_default desc, created_at, id
         ) as rn
    from procurement.purchase_item_ingredient
)
update procurement.purchase_item_ingredient t
   set is_default = (r.rn = 1)
  from ranked r
 where t.id = r.id and t.is_default is distinct from (r.rn = 1);

create unique index purchase_item_ingredient_default_uniq
  on procurement.purchase_item_ingredient (ingredient_id) where is_default;

comment on index procurement.purchase_item_ingredient_default_uniq is
  'Uma especificação padrão por item. Sem isto, "carne a vácuo" e "carne congelada" podem ambas ser default e a lista de compras escolhe pela ordem do planner.';
