-- Seed do catálogo global de equipamentos: papéis, modelos e o mapa modelo → papéis.
--
-- Os modelos Rational são os que a FAB usa hoje (iCombi, iVario). Além de capacidade, NADA de
-- ficha técnica é semeado: potência, dimensão e consumo variam por versão elétrica/gás e por
-- lote, e um número errado no catálogo é pior que um campo vazio — vira premissa de
-- dimensionamento que ninguém revisa. Capacidade (GN e litros) é a única especificação
-- estável, e é a que o cálculo de atendimento usa.
--
-- Os modelos genéricos existem para a cozinha que só sabe "tenho um forno combinado de 10 GN"
-- sem marca definida — cadastrar a unidade não pode depender de descobrir o modelo exato.
--
-- Idempotente: `code`/`slug` são chave natural, tudo com `on conflict do nothing`.

begin;

-- ── Papéis ───────────────────────────────────────────────────────────────────

insert into kitchen.equipment_role (code, name, description, category, sort_order)
values
	('combi_oven',            'Forno combinado',                 'Cocção mista com controle de umidade (ar quente + vapor). Ex.: Rational iCombi.', 'coccao',      10),
	('convection_oven',       'Forno de convecção',              'Forno de ar forçado, sem injeção de vapor.',                                      'coccao',      20),
	('deck_oven',             'Forno de lastro',                 'Forno de piso refratário, usado em panificação.',                                'coccao',      30),
	('multifunction_cooking', 'Sistema de cocção multifuncional','Cuba basculante multiuso: fritar, refogar, cozinhar sob pressão, chapa. Ex.: Rational iVario.', 'coccao', 40),
	('pressure_cooker',       'Panela de pressão',               'Cocção sob pressão.',                                                            'coccao',      50),
	('stockpot',              'Panela / caldeirão',              'Cocção em panela aberta.',                                                       'coccao',      60),
	('kettle',                'Caldeira',                        'Caldeirão de camisa de vapor, para grandes volumes de líquido.',                 'coccao',      70),
	('tilting_skillet',       'Frigideira basculante',           'Cuba rasa basculante para refogar e grelhar em volume.',                         'coccao',      80),
	('griddle',               'Chapa',                           'Superfície lisa aquecida para grelhar.',                                         'coccao',      90),
	('deep_fryer',            'Fritadeira',                      'Fritura por imersão.',                                                           'coccao',     100),
	('stove_burner',          'Boca de fogão',                   'Queimador de fogão industrial. Uma exigência por boca simultânea.',              'coccao',     110),
	('steamer',               'Vaporizador',                     'Cocção a vapor direto.',                                                         'coccao',     120),
	('bain_marie',            'Banho-maria',                     'Aquecimento indireto por água, para manter ou derreter.',                        'coccao',     130),
	('microwave',             'Forno de micro-ondas',            'Aquecimento por micro-ondas.',                                                   'coccao',     140),
	('salamander',            'Salamandra',                      'Gratinador de calor superior.',                                                  'coccao',     150),
	('planetary_mixer',       'Batedeira planetária',            'Batedeira de bancada ou de piso com movimento planetário.',                      'preparo',    210),
	('dough_mixer',           'Masseira',                        'Amassadeira de massas.',                                                         'preparo',    220),
	('food_processor',        'Processador de alimentos',        'Processador com discos e lâminas.',                                              'preparo',    230),
	('vegetable_cutter',      'Cortador de legumes',             'Corte padronizado de hortifrúti.',                                               'preparo',    240),
	('blender',               'Liquidificador industrial',       'Liquidificador de copo, uso industrial.',                                        'preparo',    250),
	('immersion_blender',     'Mixer de imersão',                'Triturador de haste, usado dentro da panela.',                                   'preparo',    260),
	('meat_grinder',          'Moedor de carne',                 'Moagem de carnes.',                                                              'preparo',    270),
	('slicer',                'Fatiador',                        'Fatiador de frios e carnes.',                                                    'preparo',    280),
	('band_saw',              'Serra fita',                      'Corte de carnes congeladas e ossos.',                                            'preparo',    290),
	('blast_chiller',         'Ultracongelador',                 'Resfriamento e congelamento rápidos, exigidos para preparação congelada.',       'conservacao',310),
	('refrigerator',          'Refrigerador / câmara fria',      'Conservação resfriada.',                                                         'conservacao',320),
	('freezer',               'Congelador',                      'Conservação congelada.',                                                         'conservacao',330),
	('holding_cabinet',       'Estufa de manutenção',            'Manutenção de preparações prontas em temperatura de serviço.',                   'conservacao',340),
	('vacuum_sealer',         'Seladora a vácuo',                'Embalagem a vácuo.',                                                             'conservacao',350),
	('dishwasher',            'Máquina de lavar louça',          'Higienização mecânica de louça e utensílios.',                                   'apoio',      410),
	('gn_rack',               'Carro-rack GN',                   'Carro de transporte e enfornamento de cubas GN.',                                'apoio',      420)
on conflict (code) do nothing;

-- ── Modelos Rational ─────────────────────────────────────────────────────────

insert into kitchen.equipment_model (slug, manufacturer, name, slot_capacity_gn, slot_capacity_liters, capacity_label, simultaneous_slots, notes)
values
	('rational-icombi-pro-6-1-1',      'Rational', 'iCombi Pro 6-1/1',   6,  null, '6 × GN 1/1',  1, null),
	('rational-icombi-pro-6-2-1',      'Rational', 'iCombi Pro 6-2/1',   6,  null, '6 × GN 2/1',  1, null),
	('rational-icombi-pro-10-1-1',     'Rational', 'iCombi Pro 10-1/1',  10, null, '10 × GN 1/1', 1, null),
	('rational-icombi-pro-10-2-1',     'Rational', 'iCombi Pro 10-2/1',  10, null, '10 × GN 2/1', 1, null),
	('rational-icombi-pro-20-1-1',     'Rational', 'iCombi Pro 20-1/1',  20, null, '20 × GN 1/1', 1, null),
	('rational-icombi-pro-20-2-1',     'Rational', 'iCombi Pro 20-2/1',  20, null, '20 × GN 2/1', 1, null),
	('rational-icombi-classic-6-1-1',  'Rational', 'iCombi Classic 6-1/1',  6,  null, '6 × GN 1/1',  1, null),
	('rational-icombi-classic-10-1-1', 'Rational', 'iCombi Classic 10-1/1', 10, null, '10 × GN 1/1', 1, null),
	('rational-icombi-classic-20-1-1', 'Rational', 'iCombi Classic 20-1/1', 20, null, '20 × GN 1/1', 1, null),
	('rational-ihexagon-6-1-1',        'Rational', 'iHexagon 6-1/1',   6,  null, '6 × GN 1/1',  1, 'Combina ar quente, vapor e micro-ondas.'),
	('rational-ihexagon-10-1-1',       'Rational', 'iHexagon 10-1/1',  10, null, '10 × GN 1/1', 1, 'Combina ar quente, vapor e micro-ondas.'),
	-- iVario: as duas cubas do 2-XS/2-S são independentes — dois papéis ao mesmo tempo.
	-- Capacidade é POR CUBA (17 e 25), não a soma: somar diria que o 2-S atende uma exigência
	-- de panela de 40 L, e ele não atende — são duas panelas de 25.
	('rational-ivario-pro-2-xs',       'Rational', 'iVario Pro 2-XS',  null, 17,  '2 × 17 L',   2, null),
	('rational-ivario-pro-2-s',        'Rational', 'iVario Pro 2-S',   null, 25,  '2 × 25 L',   2, null),
	('rational-ivario-pro-l',          'Rational', 'iVario Pro L',     null, 100, '100 L',      1, null),
	('rational-ivario-pro-xl',         'Rational', 'iVario Pro XL',    null, 150, '150 L',      1, null)
-- Índice único é PARCIAL (só slug não nulo): a inferência exige repetir o predicado.
on conflict (slug) where slug is not null do nothing;

-- ── Modelos genéricos ────────────────────────────────────────────────────────

insert into kitchen.equipment_model (slug, manufacturer, name, slot_capacity_gn, slot_capacity_liters, capacity_label, simultaneous_slots, is_generic)
values
	('generic-combi-oven-6gn',      null, 'Forno combinado 6 GN',          6,  null, '6 × GN 1/1',  1, true),
	('generic-combi-oven-10gn',     null, 'Forno combinado 10 GN',         10, null, '10 × GN 1/1', 1, true),
	('generic-combi-oven-20gn',     null, 'Forno combinado 20 GN',         20, null, '20 × GN 1/1', 1, true),
	('generic-convection-oven',     null, 'Forno de convecção',            null, null, null,        1, true),
	('generic-deck-oven',           null, 'Forno de lastro',               null, null, null,        1, true),
	('generic-range-4',             null, 'Fogão industrial 4 bocas',      null, null, '4 bocas',   4, true),
	('generic-range-6',             null, 'Fogão industrial 6 bocas',      null, null, '6 bocas',   6, true),
	('generic-steam-kettle-50',     null, 'Caldeira 50 L',                 null, 50,  '50 L',       1, true),
	('generic-steam-kettle-100',    null, 'Caldeira 100 L',                null, 100, '100 L',      1, true),
	('generic-steam-kettle-200',    null, 'Caldeira 200 L',                null, 200, '200 L',      1, true),
	('generic-tilting-skillet-80',  null, 'Frigideira basculante 80 L',    null, 80,  '80 L',       1, true),
	('generic-deep-fryer-25',       null, 'Fritadeira elétrica 25 L',      null, 25,  '25 L',       1, true),
	('generic-griddle',             null, 'Chapa bifeteira',               null, null, null,        1, true),
	('generic-pressure-cooker-50',  null, 'Panela de pressão industrial 50 L', null, 50, '50 L',    1, true),
	('generic-bain-marie',          null, 'Banho-maria',                   null, null, null,        1, true),
	('generic-microwave',           null, 'Forno de micro-ondas',          null, null, null,        1, true),
	('generic-salamander',          null, 'Salamandra',                    null, null, null,        1, true),
	('generic-planetary-mixer-20',  null, 'Batedeira planetária 20 L',     null, 20,  '20 L',       1, true),
	('generic-dough-mixer-25',      null, 'Masseira 25 kg',                null, null, '25 kg',     1, true),
	('generic-food-processor',      null, 'Processador de alimentos',      null, null, null,        1, true),
	('generic-vegetable-cutter',    null, 'Cortador de legumes',           null, null, null,        1, true),
	('generic-blender-8',           null, 'Liquidificador industrial 8 L', null, 8,   '8 L',        1, true),
	('generic-immersion-blender',   null, 'Mixer de imersão',              null, null, null,        1, true),
	('generic-meat-grinder',        null, 'Moedor de carne',               null, null, null,        1, true),
	('generic-slicer',              null, 'Fatiador de frios',             null, null, null,        1, true),
	('generic-band-saw',            null, 'Serra fita',                    null, null, null,        1, true),
	('generic-blast-chiller',       null, 'Ultracongelador',               null, null, null,        1, true),
	('generic-refrigerator',        null, 'Refrigerador / câmara fria',    null, null, null,        1, true),
	('generic-freezer',             null, 'Congelador',                    null, null, null,        1, true),
	('generic-holding-cabinet',     null, 'Estufa de manutenção',          null, null, null,        1, true),
	('generic-vacuum-sealer',       null, 'Seladora a vácuo',              null, null, null,        1, true),
	('generic-dishwasher',          null, 'Máquina de lavar louça',        null, null, null,        1, true),
	('generic-gn-rack',             null, 'Carro-rack GN',                 null, null, null,        1, true)
-- Índice único é PARCIAL (só slug não nulo): a inferência exige repetir o predicado.
on conflict (slug) where slug is not null do nothing;

-- ── Modelo → papéis ──────────────────────────────────────────────────────────
-- O casamento é por PREFIXO de slug: toda a família iCombi assume o mesmo conjunto de papéis,
-- o que muda entre 6-1/1 e 20-2/1 é capacidade. Cada prefixo abaixo é exclusivo (nenhum é
-- prefixo de outro), então o `like` não cruza famílias.

insert into kitchen.equipment_model_role (model_id, role_id, is_primary)
select m.id, r.id, x.is_primary
from (values
	-- iCombi / forno combinado: cocção mista, convecção e vapor; também mantém pronto.
	('rational-icombi-',       'combi_oven',            true),
	('rational-icombi-',       'convection_oven',       false),
	('rational-icombi-',       'steamer',               false),
	('rational-icombi-',       'holding_cabinet',       false),
	-- iHexagon: iCombi + micro-ondas.
	('rational-ihexagon-',     'combi_oven',            true),
	('rational-ihexagon-',     'convection_oven',       false),
	('rational-ihexagon-',     'steamer',               false),
	('rational-ihexagon-',     'holding_cabinet',       false),
	('rational-ihexagon-',     'microwave',             false),
	-- iVario: o multifuncional. Um papel por cuba, simultâneos até simultaneous_slots.
	('rational-ivario-',       'multifunction_cooking', true),
	('rational-ivario-',       'griddle',               false),
	('rational-ivario-',       'pressure_cooker',       false),
	('rational-ivario-',       'stockpot',              false),
	('rational-ivario-',       'kettle',                false),
	('rational-ivario-',       'deep_fryer',            false),
	('rational-ivario-',       'tilting_skillet',       false),
	('rational-ivario-',       'bain_marie',            false),
	-- Genéricos.
	('generic-combi-oven',     'combi_oven',            true),
	('generic-combi-oven',     'convection_oven',       false),
	('generic-combi-oven',     'steamer',               false),
	('generic-convection-oven','convection_oven',       true),
	('generic-deck-oven',      'deck_oven',             true),
	('generic-range-',         'stove_burner',          true),
	('generic-range-',         'stockpot',              false),
	('generic-range-',         'pressure_cooker',       false),
	('generic-steam-kettle-',  'kettle',                true),
	('generic-steam-kettle-',  'stockpot',              false),
	('generic-tilting-skillet-','tilting_skillet',      true),
	('generic-tilting-skillet-','griddle',              false),
	('generic-deep-fryer-',    'deep_fryer',            true),
	('generic-griddle',        'griddle',               true),
	('generic-pressure-cooker-','pressure_cooker',      true),
	('generic-pressure-cooker-','stockpot',             false),
	('generic-bain-marie',     'bain_marie',            true),
	('generic-microwave',      'microwave',             true),
	('generic-salamander',     'salamander',            true),
	('generic-planetary-mixer-','planetary_mixer',      true),
	('generic-planetary-mixer-','dough_mixer',          false),
	('generic-dough-mixer-',   'dough_mixer',           true),
	('generic-food-processor', 'food_processor',        true),
	('generic-food-processor', 'vegetable_cutter',      false),
	('generic-vegetable-cutter','vegetable_cutter',     true),
	('generic-blender-',       'blender',               true),
	('generic-immersion-blender','immersion_blender',   true),
	('generic-meat-grinder',   'meat_grinder',          true),
	('generic-slicer',         'slicer',                true),
	('generic-band-saw',       'band_saw',              true),
	('generic-blast-chiller',  'blast_chiller',         true),
	('generic-blast-chiller',  'freezer',               false),
	('generic-refrigerator',   'refrigerator',          true),
	('generic-freezer',        'freezer',               true),
	('generic-holding-cabinet','holding_cabinet',       true),
	('generic-vacuum-sealer',  'vacuum_sealer',         true),
	('generic-dishwasher',     'dishwasher',            true),
	('generic-gn-rack',        'gn_rack',               true)
) as x(slug_prefix, role_code, is_primary)
join kitchen.equipment_model m on m.slug like x.slug_prefix || '%'
join kitchen.equipment_role r on r.code = x.role_code
on conflict do nothing;

commit;
