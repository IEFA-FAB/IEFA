-- Preenche o "5º Uniforme A" (Art. 24 do RUMAER), traje de passeio completo — grupo representacao.
-- O registro já existe (stub do seed, numero=5 letra='A', 0 peças): o do-block encontra-o e apenas
-- adiciona as categorias/variantes faltantes (on conflict do nothing) antes de preencher a composição.
-- Variantes:
--   feminino  → oficiais, cadetes, suboficiais, sargentos, alunos
--   gestante  → oficiais, suboficiais, sargentos        (genero='feminino', sub_variacao='gestante')
--   masculino → oficiais, cadetes, suboficiais, sargentos, alunos
-- NÃO modelado: uso de hipismo (item f — culote/botas de montaria/capacete não constam do catálogo).
-- Idempotente; casa variante por (círculo, gênero, sub_variação) e peça por slug.

do $$
declare
	u_id uuid;
begin
	select id into u_id from rumaer.uniform
	where numero = 5 and letra = 'A' and deleted_at is null limit 1;

	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (5, 'A', '5º Uniforme A', 'representacao', 'passeio', 'passeio completo', 'Art. 24', 90,
			'5º Uniforme "A", correspondente ao traje de passeio completo.')
		returning id into u_id;
	end if;

	insert into rumaer.uniform_category (uniform_id, categoria) values
		(u_id, 'oficiais'), (u_id, 'cadetes'), (u_id, 'suboficiais'),
		(u_id, 'sargentos'), (u_id, 'alunos_formacao')
	on conflict (uniform_id, categoria) do nothing;

	insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
		(u_id, 'oficiais',    'feminino',  null,       0),
		(u_id, 'cadetes',     'feminino',  null,       1),
		(u_id, 'suboficiais', 'feminino',  null,       2),
		(u_id, 'sargentos',   'feminino',  null,       3),
		(u_id, 'alunos',      'feminino',  null,       4),
		(u_id, 'oficiais',    'feminino',  'gestante', 5),
		(u_id, 'suboficiais', 'feminino',  'gestante', 6),
		(u_id, 'sargentos',   'feminino',  'gestante', 7),
		(u_id, 'oficiais',    'masculino', null,       8),
		(u_id, 'cadetes',     'masculino', null,       9),
		(u_id, 'suboficiais', 'masculino', null,       10),
		(u_id, 'sargentos',   'masculino', null,       11),
		(u_id, 'alunos',      'masculino', null,       12)
	on conflict (uniform_id, circulo, genero, sub_variacao) do nothing;

	-- normaliza a ordem da variante stub (oficiais masculino vinha com ordem 0)
	update rumaer.uniform_variant set ordem = 8
	where uniform_id = u_id and circulo = 'oficiais' and genero = 'masculino' and sub_variacao is null;
end $$;

with comp(genero, subvar, circulo, slug, nivel, ordem, obs) as (
	values
		-- ===================== FEMININO =====================
		('feminino', null, 'oficiais', 'quepe-feminino',                               'obrigatorio', 0,  'azul-aeronáutica'),
		('feminino', null, 'oficiais', 'tunica-feminina-azul-aeronautica',             'obrigatorio', 1,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunas dos centros de formação ou de adaptação de oficiais)'),
		('feminino', null, 'oficiais', 'camisa-feminina-azul-clara-de-mangas-compridas','obrigatorio', 2,  null),
		('feminino', null, 'oficiais', 'gravata-feminina-preta',                       'obrigatorio', 3,  null),
		('feminino', null, 'oficiais', 'calca-feminina-azul-aeronautica',              'obrigatorio', 4,  'calça ou saia, azul-aeronáutica'),
		('feminino', null, 'oficiais', 'saia-azul-aeronautica',                        'obrigatorio', 5,  'calça ou saia, azul-aeronáutica'),
		('feminino', null, 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto',       'obrigatorio', 6,  'azul-aeronáutica, com fivela prateada'),
		('feminino', null, 'oficiais', 'sapato-feminino-de-salto-medio-tipo-2',        'obrigatorio', 7,  'preto, salto médio'),
		('feminino', null, 'oficiais', 'meia-calca-social-lisa',                       'obrigatorio', 8,  'cor da pele (quando usando saia)'),
		('feminino', null, 'oficiais', 'meia-preta-branca-de-nylon',                   'obrigatorio', 9,  'preta (quando usando calça)'),
		('feminino', null, 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('feminino', null, 'oficiais', 'colete-azul-aeronautica-com-gola-em-v',        'facultativo', 13, 'gola em "V"'),
		('feminino', null, 'oficiais', 'capa-de-chuva-azul-aeronautica',               'facultativo', 14, 'azul-aeronáutica'),
		('feminino', null, 'oficiais', 'sobretudo-feminino-azul-aeronautica',          'facultativo', 15, 'azul-aeronáutica'),
		('feminino', null, 'oficiais', 'cachecol-branco',                              'facultativo', 16, null),
		('feminino', null, 'oficiais', 'fiador-para-espada',                           'eventual',    17, 'para oficiais'),
		('feminino', null, 'oficiais', 'guia-azul-aeronautica-de-seda-para-espada',    'eventual',    18, 'para oficiais'),
		('feminino', null, 'oficiais', 'espada',                                       'eventual',    19, 'para oficiais'),
		('feminino', null, 'oficiais', 'luva-preta-de-couro',                          'eventual',    20, null),
		('feminino', null, 'oficiais', 'cinturao-preto',                               'eventual',    21, 'preto'),
		('feminino', null, 'oficiais', 'porta-pistola-preto',                          'eventual',    22, 'preto'),
		('feminino', null, 'cadetes', 'quepe-feminino',                                'obrigatorio', 0,  'azul-aeronáutica'),
		('feminino', null, 'cadetes', 'tunica-feminina-azul-aeronautica',              'obrigatorio', 1,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunas dos centros de formação ou de adaptação de oficiais)'),
		('feminino', null, 'cadetes', 'camisa-feminina-azul-clara-de-mangas-compridas','obrigatorio', 2,  null),
		('feminino', null, 'cadetes', 'gravata-feminina-preta',                        'obrigatorio', 3,  null),
		('feminino', null, 'cadetes', 'calca-feminina-azul-aeronautica',               'obrigatorio', 4,  'calça ou saia, azul-aeronáutica'),
		('feminino', null, 'cadetes', 'saia-azul-aeronautica',                         'obrigatorio', 5,  'calça ou saia, azul-aeronáutica'),
		('feminino', null, 'cadetes', 'cinto-azul-aeronautica-branco-ou-preto',        'obrigatorio', 6,  'azul-aeronáutica, com fivela prateada'),
		('feminino', null, 'cadetes', 'sapato-feminino-de-salto-medio-tipo-2',         'obrigatorio', 7,  'preto, salto médio'),
		('feminino', null, 'cadetes', 'meia-calca-social-lisa',                        'obrigatorio', 8,  'cor da pele (quando usando saia)'),
		('feminino', null, 'cadetes', 'meia-preta-branca-de-nylon',                    'obrigatorio', 9,  'preta (quando usando calça)'),
		('feminino', null, 'cadetes', 'guia-azul-aeronautica-para-espadim',            'obrigatorio', 10, 'para cadetes'),
		('feminino', null, 'cadetes', 'espadim',                                       'obrigatorio', 11, 'para cadetes'),
		('feminino', null, 'cadetes', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('feminino', null, 'cadetes', 'colete-azul-aeronautica-com-gola-em-v',         'facultativo', 13, 'gola em "V"'),
		('feminino', null, 'cadetes', 'capa-de-chuva-azul-aeronautica',                'facultativo', 14, 'azul-aeronáutica'),
		('feminino', null, 'cadetes', 'sobretudo-feminino-azul-aeronautica',           'facultativo', 15, 'azul-aeronáutica'),
		('feminino', null, 'cadetes', 'cachecol-branco',                               'facultativo', 16, null),
		('feminino', null, 'cadetes', 'luva-preta-de-couro',                           'eventual',    20, null),
		('feminino', null, 'cadetes', 'cinturao-preto',                                'eventual',    21, 'preto'),
		('feminino', null, 'cadetes', 'porta-pistola-preto',                           'eventual',    22, 'preto'),
		('feminino', null, 'suboficiais', 'quepe-feminino',                            'obrigatorio', 0,  'azul-aeronáutica'),
		('feminino', null, 'suboficiais', 'tunica-feminina-azul-aeronautica',          'obrigatorio', 1,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunas dos centros de formação ou de adaptação de oficiais)'),
		('feminino', null, 'suboficiais', 'camisa-feminina-azul-clara-de-mangas-compridas','obrigatorio', 2,  null),
		('feminino', null, 'suboficiais', 'gravata-feminina-preta',                    'obrigatorio', 3,  null),
		('feminino', null, 'suboficiais', 'calca-feminina-azul-aeronautica',           'obrigatorio', 4,  'calça ou saia, azul-aeronáutica'),
		('feminino', null, 'suboficiais', 'saia-azul-aeronautica',                     'obrigatorio', 5,  'calça ou saia, azul-aeronáutica'),
		('feminino', null, 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto',    'obrigatorio', 6,  'azul-aeronáutica, com fivela prateada'),
		('feminino', null, 'suboficiais', 'sapato-feminino-de-salto-medio-tipo-2',     'obrigatorio', 7,  'preto, salto médio'),
		('feminino', null, 'suboficiais', 'meia-calca-social-lisa',                    'obrigatorio', 8,  'cor da pele (quando usando saia)'),
		('feminino', null, 'suboficiais', 'meia-preta-branca-de-nylon',                'obrigatorio', 9,  'preta (quando usando calça)'),
		('feminino', null, 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('feminino', null, 'suboficiais', 'colete-azul-aeronautica-com-gola-em-v',     'facultativo', 13, 'gola em "V"'),
		('feminino', null, 'suboficiais', 'capa-de-chuva-azul-aeronautica',            'facultativo', 14, 'azul-aeronáutica'),
		('feminino', null, 'suboficiais', 'sobretudo-feminino-azul-aeronautica',       'facultativo', 15, 'azul-aeronáutica'),
		('feminino', null, 'suboficiais', 'cachecol-branco',                           'facultativo', 16, null),
		('feminino', null, 'suboficiais', 'luva-preta-de-couro',                       'eventual',    20, null),
		('feminino', null, 'suboficiais', 'cinturao-preto',                            'eventual',    21, 'preto'),
		('feminino', null, 'suboficiais', 'porta-pistola-preto',                       'eventual',    22, 'preto'),
		('feminino', null, 'sargentos', 'quepe-feminino',                              'obrigatorio', 0,  'azul-aeronáutica'),
		('feminino', null, 'sargentos', 'tunica-feminina-azul-aeronautica',            'obrigatorio', 1,  'azul-aeronáutica (sargentos e alunas da EEAR)'),
		('feminino', null, 'sargentos', 'camisa-feminina-azul-clara-de-mangas-compridas','obrigatorio', 2,  null),
		('feminino', null, 'sargentos', 'gravata-feminina-preta',                      'obrigatorio', 3,  null),
		('feminino', null, 'sargentos', 'calca-feminina-azul-aeronautica',             'obrigatorio', 4,  'calça ou saia, azul-aeronáutica'),
		('feminino', null, 'sargentos', 'saia-azul-aeronautica',                       'obrigatorio', 5,  'calça ou saia, azul-aeronáutica'),
		('feminino', null, 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto',      'obrigatorio', 6,  'azul-aeronáutica, com fivela prateada'),
		('feminino', null, 'sargentos', 'sapato-feminino-de-salto-medio-tipo-2',       'obrigatorio', 7,  'preto, salto médio'),
		('feminino', null, 'sargentos', 'meia-calca-social-lisa',                      'obrigatorio', 8,  'cor da pele (quando usando saia)'),
		('feminino', null, 'sargentos', 'meia-preta-branca-de-nylon',                  'obrigatorio', 9,  'preta (quando usando calça)'),
		('feminino', null, 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('feminino', null, 'sargentos', 'colete-azul-aeronautica-com-gola-em-v',       'facultativo', 13, 'gola em "V"'),
		('feminino', null, 'sargentos', 'capa-de-chuva-azul-aeronautica',              'facultativo', 14, 'azul-aeronáutica'),
		('feminino', null, 'sargentos', 'sobretudo-feminino-azul-aeronautica',         'facultativo', 15, 'azul-aeronáutica'),
		('feminino', null, 'sargentos', 'cachecol-branco',                             'facultativo', 16, null),
		('feminino', null, 'sargentos', 'luva-preta-de-couro',                         'eventual',    20, null),
		('feminino', null, 'sargentos', 'cinturao-preto',                              'eventual',    21, 'preto'),
		('feminino', null, 'sargentos', 'porta-pistola-preto',                         'eventual',    22, 'preto'),
		('feminino', null, 'alunos', 'quepe-feminino',                                 'obrigatorio', 0,  'azul-aeronáutica'),
		('feminino', null, 'alunos', 'tunica-feminina-azul-aeronautica',               'obrigatorio', 1,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunas dos centros de formação ou de adaptação de oficiais)'),
		('feminino', null, 'alunos', 'camisa-feminina-azul-clara-de-mangas-compridas', 'obrigatorio', 2,  null),
		('feminino', null, 'alunos', 'gravata-feminina-preta',                         'obrigatorio', 3,  null),
		('feminino', null, 'alunos', 'calca-feminina-azul-aeronautica',                'obrigatorio', 4,  'calça ou saia, azul-aeronáutica'),
		('feminino', null, 'alunos', 'saia-azul-aeronautica',                          'obrigatorio', 5,  'calça ou saia, azul-aeronáutica'),
		('feminino', null, 'alunos', 'cinto-azul-aeronautica-branco-ou-preto',         'obrigatorio', 6,  'azul-aeronáutica, com fivela prateada'),
		('feminino', null, 'alunos', 'sapato-feminino-de-salto-medio-tipo-2',          'obrigatorio', 7,  'preto, salto médio'),
		('feminino', null, 'alunos', 'meia-calca-social-lisa',                         'obrigatorio', 8,  'cor da pele (quando usando saia)'),
		('feminino', null, 'alunos', 'meia-preta-branca-de-nylon',                     'obrigatorio', 9,  'preta (quando usando calça)'),
		('feminino', null, 'alunos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('feminino', null, 'alunos', 'colete-azul-aeronautica-com-gola-em-v',          'facultativo', 13, 'gola em "V"'),
		('feminino', null, 'alunos', 'capa-de-chuva-azul-aeronautica',                 'facultativo', 14, 'azul-aeronáutica'),
		('feminino', null, 'alunos', 'sobretudo-feminino-azul-aeronautica',            'facultativo', 15, 'azul-aeronáutica'),
		('feminino', null, 'alunos', 'cachecol-branco',                                'facultativo', 16, null),
		('feminino', null, 'alunos', 'luva-preta-de-couro',                            'eventual',    20, null),
		('feminino', null, 'alunos', 'cinturao-preto',                                 'eventual',    21, 'preto'),
		('feminino', null, 'alunos', 'porta-pistola-preto',                            'eventual',    22, 'preto'),

		-- ===================== GESTANTE =====================
		('feminino', 'gestante', 'oficiais', 'quepe-feminino',                         'obrigatorio', 0,  'azul-aeronáutica'),
		('feminino', 'gestante', 'oficiais', 'vestido-azul-aeronautica-para-gestante', 'obrigatorio', 1,  'azul-aeronáutica'),
		('feminino', 'gestante', 'oficiais', 'camisa-feminina-azul-clara-de-mangas-compridas','obrigatorio', 2,  'ou bata azul-clara'),
		('feminino', 'gestante', 'oficiais', 'gravata-feminina-preta',                 'obrigatorio', 3,  null),
		('feminino', 'gestante', 'oficiais', 'sapato-feminino-de-salto-medio-tipo-2',  'obrigatorio', 4,  'preto (salto médio, baixo ou sem salto)'),
		('feminino', 'gestante', 'oficiais', 'meia-calca-social-lisa',                 'obrigatorio', 5,  'cor da pele (autorizado uso de meia especial)'),
		('feminino', 'gestante', 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('feminino', 'gestante', 'oficiais', 'colete-azul-aeronautica-com-gola-em-v',  'facultativo', 13, 'gola em "V"'),
		('feminino', 'gestante', 'oficiais', 'capa-de-chuva-azul-aeronautica',         'facultativo', 14, 'azul-aeronáutica'),
		('feminino', 'gestante', 'oficiais', 'sobretudo-feminino-azul-aeronautica',    'facultativo', 15, 'azul-aeronáutica'),
		('feminino', 'gestante', 'oficiais', 'cachecol-branco',                        'facultativo', 16, null),
		('feminino', 'gestante', 'oficiais', 'luva-preta-de-couro',                    'eventual',    20, null),
		('feminino', 'gestante', 'suboficiais', 'quepe-feminino',                      'obrigatorio', 0,  'azul-aeronáutica'),
		('feminino', 'gestante', 'suboficiais', 'vestido-azul-aeronautica-para-gestante','obrigatorio', 1,  'azul-aeronáutica'),
		('feminino', 'gestante', 'suboficiais', 'camisa-feminina-azul-clara-de-mangas-compridas','obrigatorio', 2,  'ou bata azul-clara'),
		('feminino', 'gestante', 'suboficiais', 'gravata-feminina-preta',              'obrigatorio', 3,  null),
		('feminino', 'gestante', 'suboficiais', 'sapato-feminino-de-salto-medio-tipo-2','obrigatorio', 4,  'preto (salto médio, baixo ou sem salto)'),
		('feminino', 'gestante', 'suboficiais', 'meia-calca-social-lisa',              'obrigatorio', 5,  'cor da pele (autorizado uso de meia especial)'),
		('feminino', 'gestante', 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('feminino', 'gestante', 'suboficiais', 'colete-azul-aeronautica-com-gola-em-v','facultativo', 13, 'gola em "V"'),
		('feminino', 'gestante', 'suboficiais', 'capa-de-chuva-azul-aeronautica',      'facultativo', 14, 'azul-aeronáutica'),
		('feminino', 'gestante', 'suboficiais', 'sobretudo-feminino-azul-aeronautica', 'facultativo', 15, 'azul-aeronáutica'),
		('feminino', 'gestante', 'suboficiais', 'cachecol-branco',                     'facultativo', 16, null),
		('feminino', 'gestante', 'suboficiais', 'luva-preta-de-couro',                 'eventual',    20, null),
		('feminino', 'gestante', 'sargentos', 'quepe-feminino',                        'obrigatorio', 0,  'azul-aeronáutica'),
		('feminino', 'gestante', 'sargentos', 'vestido-azul-aeronautica-para-gestante','obrigatorio', 1,  'azul-aeronáutica'),
		('feminino', 'gestante', 'sargentos', 'camisa-feminina-azul-clara-de-mangas-compridas','obrigatorio', 2,  'ou bata azul-clara'),
		('feminino', 'gestante', 'sargentos', 'gravata-feminina-preta',                'obrigatorio', 3,  null),
		('feminino', 'gestante', 'sargentos', 'sapato-feminino-de-salto-medio-tipo-2', 'obrigatorio', 4,  'preto (salto médio, baixo ou sem salto)'),
		('feminino', 'gestante', 'sargentos', 'meia-calca-social-lisa',                'obrigatorio', 5,  'cor da pele (autorizado uso de meia especial)'),
		('feminino', 'gestante', 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('feminino', 'gestante', 'sargentos', 'colete-azul-aeronautica-com-gola-em-v', 'facultativo', 13, 'gola em "V"'),
		('feminino', 'gestante', 'sargentos', 'capa-de-chuva-azul-aeronautica',        'facultativo', 14, 'azul-aeronáutica'),
		('feminino', 'gestante', 'sargentos', 'sobretudo-feminino-azul-aeronautica',   'facultativo', 15, 'azul-aeronáutica'),
		('feminino', 'gestante', 'sargentos', 'cachecol-branco',                       'facultativo', 16, null),
		('feminino', 'gestante', 'sargentos', 'luva-preta-de-couro',                   'eventual',    20, null),

		-- ===================== MASCULINO =====================
		('masculino', null, 'oficiais', 'quepe-masculino',                             'obrigatorio', 0,  'azul-aeronáutica'),
		('masculino', null, 'oficiais', 'tunica-masculina-azul-aeronautica',           'obrigatorio', 1,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)'),
		('masculino', null, 'oficiais', 'camisa-masculina-azul-clara-de-mangas-compridas','obrigatorio', 2,  null),
		('masculino', null, 'oficiais', 'gravata-vertical-preta',                      'obrigatorio', 3,  'vertical'),
		('masculino', null, 'oficiais', 'calca-masculina-azul-aeronautica',            'obrigatorio', 4,  null),
		('masculino', null, 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto',      'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('masculino', null, 'oficiais', 'sapato-masculino-preto-tipo-2',               'obrigatorio', 6,  'preto'),
		('masculino', null, 'oficiais', 'meia-preta-branca-de-nylon',                  'obrigatorio', 7,  'preta'),
		('masculino', null, 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('masculino', null, 'oficiais', 'colete-azul-aeronautica-com-gola-em-v',       'facultativo', 13, 'gola em "V"'),
		('masculino', null, 'oficiais', 'capa-de-chuva-azul-aeronautica',              'facultativo', 14, 'azul-aeronáutica'),
		('masculino', null, 'oficiais', 'sobretudo-masculino-azul-aeronautica',        'facultativo', 15, 'azul-aeronáutica'),
		('masculino', null, 'oficiais', 'cachecol-branco',                             'facultativo', 16, null),
		('masculino', null, 'oficiais', 'fiador-para-espada',                          'eventual',    17, 'para oficiais'),
		('masculino', null, 'oficiais', 'guia-azul-aeronautica-de-seda-para-espada',   'eventual',    18, 'para oficiais'),
		('masculino', null, 'oficiais', 'espada',                                      'eventual',    19, 'para oficiais'),
		('masculino', null, 'oficiais', 'luva-preta-de-couro',                         'eventual',    20, null),
		('masculino', null, 'oficiais', 'cinturao-preto',                             'eventual',    21, 'preto'),
		('masculino', null, 'oficiais', 'porta-pistola-preto',                        'eventual',    22, 'preto'),
		('masculino', null, 'cadetes', 'quepe-masculino',                              'obrigatorio', 0,  'azul-aeronáutica'),
		('masculino', null, 'cadetes', 'tunica-masculina-azul-aeronautica',            'obrigatorio', 1,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)'),
		('masculino', null, 'cadetes', 'camisa-masculina-azul-clara-de-mangas-compridas','obrigatorio', 2,  null),
		('masculino', null, 'cadetes', 'gravata-vertical-preta',                       'obrigatorio', 3,  'vertical'),
		('masculino', null, 'cadetes', 'calca-masculina-azul-aeronautica',             'obrigatorio', 4,  null),
		('masculino', null, 'cadetes', 'cinto-azul-aeronautica-branco-ou-preto',       'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('masculino', null, 'cadetes', 'sapato-masculino-preto-tipo-2',                'obrigatorio', 6,  'preto'),
		('masculino', null, 'cadetes', 'meia-preta-branca-de-nylon',                   'obrigatorio', 7,  'preta'),
		('masculino', null, 'cadetes', 'guia-azul-aeronautica-para-espadim',           'obrigatorio', 8,  'para cadetes'),
		('masculino', null, 'cadetes', 'espadim',                                      'obrigatorio', 9,  'para cadetes'),
		('masculino', null, 'cadetes', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('masculino', null, 'cadetes', 'colete-azul-aeronautica-com-gola-em-v',        'facultativo', 13, 'gola em "V"'),
		('masculino', null, 'cadetes', 'capa-de-chuva-azul-aeronautica',               'facultativo', 14, 'azul-aeronáutica'),
		('masculino', null, 'cadetes', 'sobretudo-masculino-azul-aeronautica',         'facultativo', 15, 'azul-aeronáutica'),
		('masculino', null, 'cadetes', 'cachecol-branco',                              'facultativo', 16, null),
		('masculino', null, 'cadetes', 'luva-preta-de-couro',                          'eventual',    20, null),
		('masculino', null, 'cadetes', 'cinturao-preto',                               'eventual',    21, 'preto'),
		('masculino', null, 'cadetes', 'porta-pistola-preto',                          'eventual',    22, 'preto'),
		('masculino', null, 'suboficiais', 'quepe-masculino',                          'obrigatorio', 0,  'azul-aeronáutica'),
		('masculino', null, 'suboficiais', 'tunica-masculina-azul-aeronautica',        'obrigatorio', 1,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)'),
		('masculino', null, 'suboficiais', 'camisa-masculina-azul-clara-de-mangas-compridas','obrigatorio', 2,  null),
		('masculino', null, 'suboficiais', 'gravata-vertical-preta',                   'obrigatorio', 3,  'vertical'),
		('masculino', null, 'suboficiais', 'calca-masculina-azul-aeronautica',         'obrigatorio', 4,  null),
		('masculino', null, 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto',   'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('masculino', null, 'suboficiais', 'sapato-masculino-preto-tipo-2',            'obrigatorio', 6,  'preto'),
		('masculino', null, 'suboficiais', 'meia-preta-branca-de-nylon',               'obrigatorio', 7,  'preta'),
		('masculino', null, 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('masculino', null, 'suboficiais', 'colete-azul-aeronautica-com-gola-em-v',    'facultativo', 13, 'gola em "V"'),
		('masculino', null, 'suboficiais', 'capa-de-chuva-azul-aeronautica',           'facultativo', 14, 'azul-aeronáutica'),
		('masculino', null, 'suboficiais', 'sobretudo-masculino-azul-aeronautica',     'facultativo', 15, 'azul-aeronáutica'),
		('masculino', null, 'suboficiais', 'cachecol-branco',                          'facultativo', 16, null),
		('masculino', null, 'suboficiais', 'luva-preta-de-couro',                      'eventual',    20, null),
		('masculino', null, 'suboficiais', 'cinturao-preto',                           'eventual',    21, 'preto'),
		('masculino', null, 'suboficiais', 'porta-pistola-preto',                      'eventual',    22, 'preto'),
		('masculino', null, 'sargentos', 'quepe-masculino',                            'obrigatorio', 0,  'azul-aeronáutica'),
		('masculino', null, 'sargentos', 'tunica-masculina-azul-aeronautica',          'obrigatorio', 1,  'azul-aeronáutica (sargentos e alunos da EEAR)'),
		('masculino', null, 'sargentos', 'camisa-masculina-azul-clara-de-mangas-compridas','obrigatorio', 2,  null),
		('masculino', null, 'sargentos', 'gravata-vertical-preta',                     'obrigatorio', 3,  'vertical'),
		('masculino', null, 'sargentos', 'calca-masculina-azul-aeronautica',           'obrigatorio', 4,  null),
		('masculino', null, 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto',     'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('masculino', null, 'sargentos', 'sapato-masculino-preto-tipo-2',              'obrigatorio', 6,  'preto'),
		('masculino', null, 'sargentos', 'meia-preta-branca-de-nylon',                 'obrigatorio', 7,  'preta'),
		('masculino', null, 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('masculino', null, 'sargentos', 'colete-azul-aeronautica-com-gola-em-v',      'facultativo', 13, 'gola em "V"'),
		('masculino', null, 'sargentos', 'capa-de-chuva-azul-aeronautica',             'facultativo', 14, 'azul-aeronáutica'),
		('masculino', null, 'sargentos', 'sobretudo-masculino-azul-aeronautica',       'facultativo', 15, 'azul-aeronáutica'),
		('masculino', null, 'sargentos', 'cachecol-branco',                            'facultativo', 16, null),
		('masculino', null, 'sargentos', 'luva-preta-de-couro',                        'eventual',    20, null),
		('masculino', null, 'sargentos', 'cinturao-preto',                             'eventual',    21, 'preto'),
		('masculino', null, 'sargentos', 'porta-pistola-preto',                        'eventual',    22, 'preto'),
		('masculino', null, 'alunos', 'quepe-masculino',                               'obrigatorio', 0,  'azul-aeronáutica'),
		('masculino', null, 'alunos', 'tunica-masculina-azul-aeronautica',             'obrigatorio', 1,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)'),
		('masculino', null, 'alunos', 'camisa-masculina-azul-clara-de-mangas-compridas','obrigatorio', 2,  null),
		('masculino', null, 'alunos', 'gravata-vertical-preta',                        'obrigatorio', 3,  'vertical'),
		('masculino', null, 'alunos', 'calca-masculina-azul-aeronautica',              'obrigatorio', 4,  null),
		('masculino', null, 'alunos', 'cinto-azul-aeronautica-branco-ou-preto',        'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('masculino', null, 'alunos', 'sapato-masculino-preto-tipo-2',                 'obrigatorio', 6,  'preto'),
		('masculino', null, 'alunos', 'meia-preta-branca-de-nylon',                    'obrigatorio', 7,  'preta'),
		('masculino', null, 'alunos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 12, '2ª pele branca'),
		('masculino', null, 'alunos', 'colete-azul-aeronautica-com-gola-em-v',         'facultativo', 13, 'gola em "V"'),
		('masculino', null, 'alunos', 'capa-de-chuva-azul-aeronautica',                'facultativo', 14, 'azul-aeronáutica'),
		('masculino', null, 'alunos', 'sobretudo-masculino-azul-aeronautica',          'facultativo', 15, 'azul-aeronáutica'),
		('masculino', null, 'alunos', 'cachecol-branco',                               'facultativo', 16, null),
		('masculino', null, 'alunos', 'luva-preta-de-couro',                           'eventual',    20, null),
		('masculino', null, 'alunos', 'cinturao-preto',                                'eventual',    21, 'preto'),
		('masculino', null, 'alunos', 'porta-pistola-preto',                           'eventual',    22, 'preto')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from comp c
join rumaer.uniform u on u.numero = 5 and u.letra = 'A' and u.deleted_at is null
join rumaer.uniform_variant uv
	on uv.uniform_id = u.id
	and uv.circulo = c.circulo::rumaer.circulo_hierarquico
	and uv.genero = c.genero::rumaer.genero
	and uv.sub_variacao is not distinct from c.subvar
join rumaer.piece p on p.slug = c.slug and p.deleted_at is null
where not exists (
	select 1 from rumaer.uniform_variant_piece x where x.variant_id = uv.id and x.piece_id = p.id
);
