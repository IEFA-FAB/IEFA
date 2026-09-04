-- ============================================================================
-- Acondicionamento e conservação EXIGIDOS — no item de compra
-- ============================================================================
-- Decisão de modelagem: acondicionamento é atributo da ESPECIFICAÇÃO DE
-- COMPRA, não do gênero. A mesma carne comprada a vácuo e comprada congelada
-- são o mesmo alimento e duas compras diferentes: muda o que o fornecedor
-- pode entregar, muda o critério de aceite e muda como a unidade guarda.
-- Pendurar isso em kitchen.ingredient obrigaria a duplicar o insumo só para
-- registrar a diferença de embalagem.
--
-- Hoje tudo isso mora em `delivery_conditioning`, texto livre. São 6 linhas
-- preenchidas em 1.960 itens, e as 6 têm EXATAMENTE o mesmo texto:
--   "Entregar em caminhão frigorífico, temperatura -12 ºC ou inferior"
-- Um campo livre usado assim já é uma estrutura pedindo para nascer:
-- classe = congelado, temperatura máxima = -12, transporte = frigorificado.
--
-- `delivery_conditioning` NÃO é removido. Ele continua como observação livre
-- (cláusula que não cabe em coluna), e nenhuma das 6 linhas é apagada.
-- ============================================================================

alter table procurement.purchase_item
  -- Como o gênero tem de ser conservado sob esta especificação.
  add column conservation_class text
    check (conservation_class in ('seco', 'resfriado', 'congelado', 'climatizado', 'nao_aplicavel')),

  -- Faixa aceita na entrega e na guarda. Aberta dos dois lados: "-12 ou
  -- inferior" é max = -12 com min nulo, e é assim que os editais escrevem.
  add column storage_temp_min_c numeric(5,2),
  add column storage_temp_max_c numeric(5,2),

  -- Cláusula contratual, não propriedade do alimento: quanto de validade
  -- ainda tem que restar no momento em que o caminhão encosta.
  add column min_shelf_life_days_on_delivery integer
    check (min_shelf_life_days_on_delivery is null or min_shelf_life_days_on_delivery > 0),

  -- Material/forma da embalagem primária. Ortogonal à unidade de
  -- fornecimento (purchase_measure_unit): "saco" é unidade, "ráfia" é
  -- material, e o edital exige os dois.
  add column package_type text
    check (package_type in (
      'lata', 'vidro', 'pet', 'saco_rafia', 'saco_plastico', 'vacuo',
      'bandeja', 'tetra_pak', 'caixa_papelao', 'a_granel', 'outro')),
  add column package_net_content numeric(12,4)
    check (package_net_content is null or package_net_content > 0),
  add column package_net_content_unit text references core.measure_unit (code),

  -- Condição do TRANSPORTE, que pode ser mais estrita que a da guarda.
  add column transport_requirement text
    check (transport_requirement in ('ambiente', 'refrigerado', 'congelado')),

  -- Faixa coerente. `is distinct from` porque nulo de um lado é a regra, não
  -- a exceção.
  add constraint purchase_item_temp_range_check
    check (storage_temp_min_c is null or storage_temp_max_c is null
           or storage_temp_min_c <= storage_temp_max_c),

  -- Conteúdo e unidade andam juntos: "5" sem unidade não especifica nada.
  add constraint purchase_item_net_content_pair
    check ((package_net_content is null) = (package_net_content_unit is null));

comment on column procurement.purchase_item.conservation_class is
  'Conservação EXIGIDA por esta especificação. É contratual: critério de aceite na entrega e decisão de onde guardar. A classe física do lote recebido é copiada daqui em inventory.stock_lot no recebimento definitivo.';
comment on column procurement.purchase_item.storage_temp_max_c is
  'Teto de temperatura aceito. "-12 ºC ou inferior" = max -12 com min nulo.';
comment on column procurement.purchase_item.min_shelf_life_days_on_delivery is
  'Validade mínima remanescente na entrega. Cláusula do edital — NÃO é a vida de prateleira do alimento, que é propriedade do produto e vem do fabricante no lote.';
comment on column procurement.purchase_item.package_type is
  'Material/forma da embalagem primária. Ortogonal a purchase_measure_unit: SC (saco) é a unidade de fornecimento, saco_rafia é o material.';
comment on column procurement.purchase_item.delivery_conditioning is
  'Observação livre sobre a entrega. Continua valendo para o que não cabe nas colunas estruturadas — não é substituído por elas.';

create index purchase_item_conservation_idx
  on procurement.purchase_item (conservation_class)
  where conservation_class is not null and deleted_at is null;

-- ----------------------------------------------------------------------------
-- Backfill conservador
-- ----------------------------------------------------------------------------
-- O CATMAT já escreve o estado de conservação na descrição em 299 dos 1.960
-- itens ("... ESTADO DE CONSERVAÇÃO: CONGELADO(A)"). Só os casos INEQUÍVOCOS
-- são classificados aqui; o resto vai para a fila de revisão.
--
-- Nada de adivinhar por "IN NATURA": in natura diz que o alimento não sofreu
-- processamento, e não diz nada sobre temperatura — alface in natura é
-- resfriada, cebola in natura é seca. Chutar aqui produziria 295 linhas com
-- classe errada e cara de conferida, que é pior do que 295 linhas vazias.

update procurement.purchase_item
   set conservation_class = 'congelado'
 where deleted_at is null
   and conservation_class is null
   and description ~* 'estado\s+de\s+conserva[çc][ãa]o\s*:\s*congelad';

update procurement.purchase_item
   set conservation_class = 'resfriado'
 where deleted_at is null
   and conservation_class is null
   and description ~* 'estado\s+de\s+conserva[çc][ãa]o\s*:\s*(resfriad|refrigerad)';

update procurement.purchase_item
   set conservation_class = 'seco'
 where deleted_at is null
   and conservation_class is null
   and description ~* 'estado\s+de\s+conserva[çc][ãa]o\s*:\s*(seco|seca|desidratad)';

-- Transporte e teto de temperatura a partir do texto livre já existente.
-- O padrão "-12 ºC ou inferior" é o único presente no dado; qualquer outra
-- redação fica para a revisão em vez de virar regex especulativa.
update procurement.purchase_item
   set transport_requirement = 'congelado',
       conservation_class = coalesce(conservation_class, 'congelado'),
       storage_temp_max_c = coalesce(
         storage_temp_max_c,
         nullif(
           replace(
             replace((regexp_match(delivery_conditioning, '(-\s*\d+(?:[.,]\d+)?)\s*(?:º|°)?\s*C'))[1], ' ', ''),
             ',', '.'),
           '')::numeric
       )
 where deleted_at is null
   and delivery_conditioning ~* 'frigor[íi]fic'
   and delivery_conditioning ~ '-\s*\d';

-- ----------------------------------------------------------------------------
-- Fila de revisão
-- ----------------------------------------------------------------------------
-- Mesmo padrão de core.v_measure_unit_review e gs1_integration.v_barcode_review:
-- o que o backfill não resolveu vira trabalho visível, com a pista que o
-- classificador humano precisa.
create view procurement.v_purchase_item_conditioning_review
  with (security_invoker = true) as
select
  pi.id as purchase_item_id,
  pi.description,
  pi.catmat_item_codigo,
  pi.delivery_conditioning,
  pi.conservation_class,
  case
    when pi.conservation_class is null then 'sem_classe'
    when pi.conservation_class in ('resfriado', 'congelado')
         and pi.storage_temp_max_c is null then 'sem_faixa_de_temperatura'
    else 'completo'
  end as pendencia,
  -- Pista extraída da descrição CATMAT para quem for classificar à mão.
  (regexp_match(pi.description, 'ESTADO\s+DE\s+CONSERVA[ÇC][ÃA]O\s*:\s*([^,]+)', 'i'))[1] as pista_catmat,
  (select count(*) from procurement.purchase_item_ingredient pii where pii.purchase_item_id = pi.id) as itens_vinculados
from procurement.purchase_item pi
where pi.deleted_at is null
  and (pi.conservation_class is null
       or (pi.conservation_class in ('resfriado', 'congelado') and pi.storage_temp_max_c is null));

comment on view procurement.v_purchase_item_conditioning_review is
  'Itens de compra sem conservação declarada, ou declarados perecíveis sem faixa de temperatura. `itens_vinculados` ordena o esforço: classificar a especificação que serve 50 insumos vale 50 vezes mais que a que serve 1.';
