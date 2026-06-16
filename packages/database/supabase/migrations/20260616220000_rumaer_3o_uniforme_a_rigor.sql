-- Cria e preenche o "3º Uniforme A" (Art. 20 do RUMAER), traje de rigor — grupo representacao.
-- Variantes por (círculo × gênero × sub_variação):
--   feminino  → oficiais, cadetes, suboficiais, sargentos, alunos
--   gestante  → oficiais, suboficiais, sargentos        (genero='feminino', sub_variacao='gestante')
--   masculino → oficiais, cadetes, suboficiais, sargentos, alunos, praças (cabos e soldados da banda de música)
-- Notas de modelagem:
--   • Gestante: primeiro uso de sub_variacao no schema (genero feminino + sub_variacao='gestante').
--   • Jaqueta rigor azul / túnica masculina azul: peça única por gênero; distinção "com passantes" vs sargentos
--     (e EEAR/cabos/soldados no masculino) registrada na observação.
--   • Espadim e guia para espadim: obrigatórios apenas para cadetes.
--   • Eventual com espada (espada, fiador, guia para espada): apenas para oficiais.
-- Idempotente; casa variante por (círculo, gênero, sub_variação) e peça por slug.

do $$
declare
	u_id uuid;
begin
	select id into u_id from rumaer.uniform
	where numero = 3 and letra = 'A' and deleted_at is null limit 1;

	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (3, 'A', '3º Uniforme A', 'representacao', 'rigor', 'rigor', 'Art. 20', 40,
			'3º Uniforme "A", correspondente ao traje de rigor.')
		returning id into u_id;

		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id, 'oficiais'), (u_id, 'cadetes'), (u_id, 'suboficiais'),
			(u_id, 'sargentos'), (u_id, 'alunos_formacao'), (u_id, 'pracas')
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
			(u_id, 'alunos',      'masculino', null,       12),
			(u_id, 'pracas',      'masculino', null,       13)
		on conflict (uniform_id, circulo, genero, sub_variacao) do nothing;
	end if;
end $$;

with comp(genero, subvar, circulo, slug, nivel, ordem, obs) as (
	values
		-- ===================== FEMININO ===================== (com passantes: oficiais, suboficiais, cadetes, alunos)
		('feminino', null, 'oficiais', 'jaqueta-rigor-feminina-azul-aeronautica',         'obrigatorio', 0,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunas dos centros de formação ou de adaptação de oficiais)'),
		('feminino', null, 'oficiais', 'camisa-feminina-branca-de-mangas-compridas',      'obrigatorio', 1,  null),
		('feminino', null, 'oficiais', 'gravata-feminina-preta',                          'obrigatorio', 2,  null),
		('feminino', null, 'oficiais', 'saia-longa-azul-aeronautica',                     'obrigatorio', 3,  null),
		('feminino', null, 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto',          'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('feminino', null, 'oficiais', 'faixa-preta-de-cetim',                            'obrigatorio', 5,  null),
		('feminino', null, 'oficiais', 'sapato-de-salto-alto',                            'obrigatorio', 6,  'preto'),
		('feminino', null, 'oficiais', 'meia-calca-social-lisa',                          'obrigatorio', 7,  'cor da pele'),
		('feminino', null, 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('feminino', null, 'oficiais', 'sobretudo-feminino-azul-aeronautica',             'facultativo', 11, 'azul-aeronáutica'),
		('feminino', null, 'oficiais', 'cachecol-branco',                                 'facultativo', 12, null),
		('feminino', null, 'oficiais', 'quepe-feminino',                                  'eventual',    13, 'azul-aeronáutica'),
		('feminino', null, 'oficiais', 'luva-preta-de-couro',                             'eventual',    14, null),
		('feminino', null, 'oficiais', 'fiador-para-espada',                              'eventual',    15, 'para oficiais'),
		('feminino', null, 'oficiais', 'guia-azul-aeronautica-de-seda-para-espada',       'eventual',    16, 'para oficiais'),
		('feminino', null, 'oficiais', 'espada',                                          'eventual',    17, 'para oficiais'),
		('feminino', null, 'cadetes', 'jaqueta-rigor-feminina-azul-aeronautica',          'obrigatorio', 0,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunas dos centros de formação ou de adaptação de oficiais)'),
		('feminino', null, 'cadetes', 'camisa-feminina-branca-de-mangas-compridas',       'obrigatorio', 1,  null),
		('feminino', null, 'cadetes', 'gravata-feminina-preta',                           'obrigatorio', 2,  null),
		('feminino', null, 'cadetes', 'saia-longa-azul-aeronautica',                      'obrigatorio', 3,  null),
		('feminino', null, 'cadetes', 'cinto-azul-aeronautica-branco-ou-preto',           'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('feminino', null, 'cadetes', 'faixa-preta-de-cetim',                             'obrigatorio', 5,  null),
		('feminino', null, 'cadetes', 'sapato-de-salto-alto',                             'obrigatorio', 6,  'preto'),
		('feminino', null, 'cadetes', 'meia-calca-social-lisa',                           'obrigatorio', 7,  'cor da pele'),
		('feminino', null, 'cadetes', 'guia-azul-aeronautica-para-espadim',               'obrigatorio', 8,  null),
		('feminino', null, 'cadetes', 'espadim',                                          'obrigatorio', 9,  'para cadetes'),
		('feminino', null, 'cadetes', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('feminino', null, 'cadetes', 'sobretudo-feminino-azul-aeronautica',              'facultativo', 11, 'azul-aeronáutica'),
		('feminino', null, 'cadetes', 'cachecol-branco',                                  'facultativo', 12, null),
		('feminino', null, 'cadetes', 'quepe-feminino',                                   'eventual',    13, 'azul-aeronáutica'),
		('feminino', null, 'cadetes', 'luva-preta-de-couro',                              'eventual',    14, null),
		('feminino', null, 'suboficiais', 'jaqueta-rigor-feminina-azul-aeronautica',      'obrigatorio', 0,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunas dos centros de formação ou de adaptação de oficiais)'),
		('feminino', null, 'suboficiais', 'camisa-feminina-branca-de-mangas-compridas',   'obrigatorio', 1,  null),
		('feminino', null, 'suboficiais', 'gravata-feminina-preta',                       'obrigatorio', 2,  null),
		('feminino', null, 'suboficiais', 'saia-longa-azul-aeronautica',                  'obrigatorio', 3,  null),
		('feminino', null, 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto',       'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('feminino', null, 'suboficiais', 'faixa-preta-de-cetim',                         'obrigatorio', 5,  null),
		('feminino', null, 'suboficiais', 'sapato-de-salto-alto',                         'obrigatorio', 6,  'preto'),
		('feminino', null, 'suboficiais', 'meia-calca-social-lisa',                       'obrigatorio', 7,  'cor da pele'),
		('feminino', null, 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('feminino', null, 'suboficiais', 'sobretudo-feminino-azul-aeronautica',          'facultativo', 11, 'azul-aeronáutica'),
		('feminino', null, 'suboficiais', 'cachecol-branco',                              'facultativo', 12, null),
		('feminino', null, 'suboficiais', 'quepe-feminino',                               'eventual',    13, 'azul-aeronáutica'),
		('feminino', null, 'suboficiais', 'luva-preta-de-couro',                          'eventual',    14, null),
		('feminino', null, 'sargentos', 'jaqueta-rigor-feminina-azul-aeronautica',        'obrigatorio', 0,  'azul-aeronáutica (sargentos e alunas da EEAR)'),
		('feminino', null, 'sargentos', 'camisa-feminina-branca-de-mangas-compridas',     'obrigatorio', 1,  null),
		('feminino', null, 'sargentos', 'gravata-feminina-preta',                         'obrigatorio', 2,  null),
		('feminino', null, 'sargentos', 'saia-longa-azul-aeronautica',                    'obrigatorio', 3,  null),
		('feminino', null, 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto',         'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('feminino', null, 'sargentos', 'faixa-preta-de-cetim',                           'obrigatorio', 5,  null),
		('feminino', null, 'sargentos', 'sapato-de-salto-alto',                           'obrigatorio', 6,  'preto'),
		('feminino', null, 'sargentos', 'meia-calca-social-lisa',                         'obrigatorio', 7,  'cor da pele'),
		('feminino', null, 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('feminino', null, 'sargentos', 'sobretudo-feminino-azul-aeronautica',            'facultativo', 11, 'azul-aeronáutica'),
		('feminino', null, 'sargentos', 'cachecol-branco',                                'facultativo', 12, null),
		('feminino', null, 'sargentos', 'quepe-feminino',                                 'eventual',    13, 'azul-aeronáutica'),
		('feminino', null, 'sargentos', 'luva-preta-de-couro',                            'eventual',    14, null),
		('feminino', null, 'alunos', 'jaqueta-rigor-feminina-azul-aeronautica',           'obrigatorio', 0,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunas dos centros de formação ou de adaptação de oficiais)'),
		('feminino', null, 'alunos', 'camisa-feminina-branca-de-mangas-compridas',        'obrigatorio', 1,  null),
		('feminino', null, 'alunos', 'gravata-feminina-preta',                            'obrigatorio', 2,  null),
		('feminino', null, 'alunos', 'saia-longa-azul-aeronautica',                       'obrigatorio', 3,  null),
		('feminino', null, 'alunos', 'cinto-azul-aeronautica-branco-ou-preto',            'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('feminino', null, 'alunos', 'faixa-preta-de-cetim',                              'obrigatorio', 5,  null),
		('feminino', null, 'alunos', 'sapato-de-salto-alto',                              'obrigatorio', 6,  'preto'),
		('feminino', null, 'alunos', 'meia-calca-social-lisa',                            'obrigatorio', 7,  'cor da pele'),
		('feminino', null, 'alunos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('feminino', null, 'alunos', 'sobretudo-feminino-azul-aeronautica',               'facultativo', 11, 'azul-aeronáutica'),
		('feminino', null, 'alunos', 'cachecol-branco',                                   'facultativo', 12, null),
		('feminino', null, 'alunos', 'quepe-feminino',                                    'eventual',    13, 'azul-aeronáutica'),
		('feminino', null, 'alunos', 'luva-preta-de-couro',                               'eventual',    14, null),

		-- ===================== GESTANTE =====================
		('feminino', 'gestante', 'oficiais', 'vestido-azul-aeronautica-para-gestante',    'obrigatorio', 0,  'azul-aeronáutica'),
		('feminino', 'gestante', 'oficiais', 'camisa-feminina-branca-de-mangas-compridas','obrigatorio', 1,  null),
		('feminino', 'gestante', 'oficiais', 'gravata-feminina-preta',                    'obrigatorio', 2,  null),
		('feminino', 'gestante', 'oficiais', 'sapato-feminino-de-salto-medio-tipo-2',     'obrigatorio', 3,  'preto (salto médio, baixo ou sem salto)'),
		('feminino', 'gestante', 'oficiais', 'meia-calca-social-lisa',                    'obrigatorio', 4,  'cor da pele (autorizado uso de meia especial)'),
		('feminino', 'gestante', 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('feminino', 'gestante', 'oficiais', 'colete-azul-aeronautica-com-gola-em-v',     'facultativo', 11, 'gola em "V"'),
		('feminino', 'gestante', 'oficiais', 'sobretudo-feminino-azul-aeronautica',       'facultativo', 12, 'azul-aeronáutica'),
		('feminino', 'gestante', 'oficiais', 'cachecol-branco',                           'facultativo', 13, null),
		('feminino', 'gestante', 'oficiais', 'quepe-feminino',                            'eventual',    14, 'azul-aeronáutica'),
		('feminino', 'gestante', 'oficiais', 'luva-preta-de-couro',                       'eventual',    15, null),
		('feminino', 'gestante', 'suboficiais', 'vestido-azul-aeronautica-para-gestante', 'obrigatorio', 0,  'azul-aeronáutica'),
		('feminino', 'gestante', 'suboficiais', 'camisa-feminina-branca-de-mangas-compridas','obrigatorio', 1,  null),
		('feminino', 'gestante', 'suboficiais', 'gravata-feminina-preta',                 'obrigatorio', 2,  null),
		('feminino', 'gestante', 'suboficiais', 'sapato-feminino-de-salto-medio-tipo-2',  'obrigatorio', 3,  'preto (salto médio, baixo ou sem salto)'),
		('feminino', 'gestante', 'suboficiais', 'meia-calca-social-lisa',                 'obrigatorio', 4,  'cor da pele (autorizado uso de meia especial)'),
		('feminino', 'gestante', 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('feminino', 'gestante', 'suboficiais', 'colete-azul-aeronautica-com-gola-em-v',  'facultativo', 11, 'gola em "V"'),
		('feminino', 'gestante', 'suboficiais', 'sobretudo-feminino-azul-aeronautica',    'facultativo', 12, 'azul-aeronáutica'),
		('feminino', 'gestante', 'suboficiais', 'cachecol-branco',                        'facultativo', 13, null),
		('feminino', 'gestante', 'suboficiais', 'quepe-feminino',                         'eventual',    14, 'azul-aeronáutica'),
		('feminino', 'gestante', 'suboficiais', 'luva-preta-de-couro',                    'eventual',    15, null),
		('feminino', 'gestante', 'sargentos', 'vestido-azul-aeronautica-para-gestante',   'obrigatorio', 0,  'azul-aeronáutica'),
		('feminino', 'gestante', 'sargentos', 'camisa-feminina-branca-de-mangas-compridas','obrigatorio', 1,  null),
		('feminino', 'gestante', 'sargentos', 'gravata-feminina-preta',                   'obrigatorio', 2,  null),
		('feminino', 'gestante', 'sargentos', 'sapato-feminino-de-salto-medio-tipo-2',    'obrigatorio', 3,  'preto (salto médio, baixo ou sem salto)'),
		('feminino', 'gestante', 'sargentos', 'meia-calca-social-lisa',                   'obrigatorio', 4,  'cor da pele (autorizado uso de meia especial)'),
		('feminino', 'gestante', 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('feminino', 'gestante', 'sargentos', 'colete-azul-aeronautica-com-gola-em-v',    'facultativo', 11, 'gola em "V"'),
		('feminino', 'gestante', 'sargentos', 'sobretudo-feminino-azul-aeronautica',      'facultativo', 12, 'azul-aeronáutica'),
		('feminino', 'gestante', 'sargentos', 'cachecol-branco',                          'facultativo', 13, null),
		('feminino', 'gestante', 'sargentos', 'quepe-feminino',                           'eventual',    14, 'azul-aeronáutica'),
		('feminino', 'gestante', 'sargentos', 'luva-preta-de-couro',                      'eventual',    15, null),

		-- ===================== MASCULINO ===================== (com passantes: oficiais, suboficiais, cadetes, alunos)
		('masculino', null, 'oficiais', 'tunica-masculina-azul-aeronautica',             'obrigatorio', 0,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)'),
		('masculino', null, 'oficiais', 'camisa-masculina-branca-de-mangas-compridas',   'obrigatorio', 1,  null),
		('masculino', null, 'oficiais', 'gravata-horizontal-azul-aeronautica-ou-preta',  'obrigatorio', 2,  'preta, horizontal'),
		('masculino', null, 'oficiais', 'calca-masculina-azul-aeronautica',              'obrigatorio', 3,  null),
		('masculino', null, 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto',        'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('masculino', null, 'oficiais', 'sapato-masculino-preto-tipo-2',                 'obrigatorio', 5,  'preto'),
		('masculino', null, 'oficiais', 'meia-preta-branca-de-nylon',                    'obrigatorio', 6,  'preta'),
		('masculino', null, 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', null, 'oficiais', 'colete-azul-aeronautica-com-gola-em-v',         'facultativo', 11, 'gola em "V"'),
		('masculino', null, 'oficiais', 'sobretudo-masculino-azul-aeronautica',          'facultativo', 12, 'azul-aeronáutica'),
		('masculino', null, 'oficiais', 'cachecol-branco',                               'facultativo', 13, null),
		('masculino', null, 'oficiais', 'quepe-masculino',                               'eventual',    14, 'azul-aeronáutica'),
		('masculino', null, 'oficiais', 'fiador-para-espada',                            'eventual',    15, 'para oficiais'),
		('masculino', null, 'oficiais', 'guia-azul-aeronautica-de-seda-para-espada',     'eventual',    16, 'para oficiais'),
		('masculino', null, 'oficiais', 'espada',                                        'eventual',    17, 'para oficiais'),
		('masculino', null, 'oficiais', 'luva-preta-de-couro',                           'eventual',    18, null),
		('masculino', null, 'cadetes', 'tunica-masculina-azul-aeronautica',              'obrigatorio', 0,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)'),
		('masculino', null, 'cadetes', 'camisa-masculina-branca-de-mangas-compridas',    'obrigatorio', 1,  null),
		('masculino', null, 'cadetes', 'gravata-horizontal-azul-aeronautica-ou-preta',   'obrigatorio', 2,  'preta, horizontal'),
		('masculino', null, 'cadetes', 'calca-masculina-azul-aeronautica',               'obrigatorio', 3,  null),
		('masculino', null, 'cadetes', 'cinto-azul-aeronautica-branco-ou-preto',         'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('masculino', null, 'cadetes', 'sapato-masculino-preto-tipo-2',                  'obrigatorio', 5,  'preto'),
		('masculino', null, 'cadetes', 'meia-preta-branca-de-nylon',                     'obrigatorio', 6,  'preta'),
		('masculino', null, 'cadetes', 'guia-azul-aeronautica-para-espadim',             'obrigatorio', 8,  null),
		('masculino', null, 'cadetes', 'espadim',                                        'obrigatorio', 9,  'para cadetes'),
		('masculino', null, 'cadetes', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', null, 'cadetes', 'colete-azul-aeronautica-com-gola-em-v',          'facultativo', 11, 'gola em "V"'),
		('masculino', null, 'cadetes', 'sobretudo-masculino-azul-aeronautica',           'facultativo', 12, 'azul-aeronáutica'),
		('masculino', null, 'cadetes', 'cachecol-branco',                                'facultativo', 13, null),
		('masculino', null, 'cadetes', 'quepe-masculino',                                'eventual',    14, 'azul-aeronáutica'),
		('masculino', null, 'cadetes', 'luva-preta-de-couro',                            'eventual',    18, null),
		('masculino', null, 'suboficiais', 'tunica-masculina-azul-aeronautica',          'obrigatorio', 0,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)'),
		('masculino', null, 'suboficiais', 'camisa-masculina-branca-de-mangas-compridas','obrigatorio', 1,  null),
		('masculino', null, 'suboficiais', 'gravata-horizontal-azul-aeronautica-ou-preta','obrigatorio', 2,  'preta, horizontal'),
		('masculino', null, 'suboficiais', 'calca-masculina-azul-aeronautica',           'obrigatorio', 3,  null),
		('masculino', null, 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto',     'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('masculino', null, 'suboficiais', 'sapato-masculino-preto-tipo-2',              'obrigatorio', 5,  'preto'),
		('masculino', null, 'suboficiais', 'meia-preta-branca-de-nylon',                 'obrigatorio', 6,  'preta'),
		('masculino', null, 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', null, 'suboficiais', 'colete-azul-aeronautica-com-gola-em-v',      'facultativo', 11, 'gola em "V"'),
		('masculino', null, 'suboficiais', 'sobretudo-masculino-azul-aeronautica',       'facultativo', 12, 'azul-aeronáutica'),
		('masculino', null, 'suboficiais', 'cachecol-branco',                            'facultativo', 13, null),
		('masculino', null, 'suboficiais', 'quepe-masculino',                            'eventual',    14, 'azul-aeronáutica'),
		('masculino', null, 'suboficiais', 'luva-preta-de-couro',                        'eventual',    18, null),
		('masculino', null, 'sargentos', 'tunica-masculina-azul-aeronautica',            'obrigatorio', 0,  'azul-aeronáutica (sargentos, alunos da EEAR, cabos e soldados)'),
		('masculino', null, 'sargentos', 'camisa-masculina-branca-de-mangas-compridas',  'obrigatorio', 1,  null),
		('masculino', null, 'sargentos', 'gravata-horizontal-azul-aeronautica-ou-preta', 'obrigatorio', 2,  'preta, horizontal'),
		('masculino', null, 'sargentos', 'calca-masculina-azul-aeronautica',             'obrigatorio', 3,  null),
		('masculino', null, 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto',       'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('masculino', null, 'sargentos', 'sapato-masculino-preto-tipo-2',                'obrigatorio', 5,  'preto'),
		('masculino', null, 'sargentos', 'meia-preta-branca-de-nylon',                   'obrigatorio', 6,  'preta'),
		('masculino', null, 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', null, 'sargentos', 'colete-azul-aeronautica-com-gola-em-v',        'facultativo', 11, 'gola em "V"'),
		('masculino', null, 'sargentos', 'sobretudo-masculino-azul-aeronautica',         'facultativo', 12, 'azul-aeronáutica'),
		('masculino', null, 'sargentos', 'cachecol-branco',                              'facultativo', 13, null),
		('masculino', null, 'sargentos', 'quepe-masculino',                              'eventual',    14, 'azul-aeronáutica'),
		('masculino', null, 'sargentos', 'luva-preta-de-couro',                          'eventual',    18, null),
		('masculino', null, 'alunos', 'tunica-masculina-azul-aeronautica',               'obrigatorio', 0,  'azul-aeronáutica, com passantes (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)'),
		('masculino', null, 'alunos', 'camisa-masculina-branca-de-mangas-compridas',     'obrigatorio', 1,  null),
		('masculino', null, 'alunos', 'gravata-horizontal-azul-aeronautica-ou-preta',    'obrigatorio', 2,  'preta, horizontal'),
		('masculino', null, 'alunos', 'calca-masculina-azul-aeronautica',                'obrigatorio', 3,  null),
		('masculino', null, 'alunos', 'cinto-azul-aeronautica-branco-ou-preto',          'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('masculino', null, 'alunos', 'sapato-masculino-preto-tipo-2',                   'obrigatorio', 5,  'preto'),
		('masculino', null, 'alunos', 'meia-preta-branca-de-nylon',                      'obrigatorio', 6,  'preta'),
		('masculino', null, 'alunos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', null, 'alunos', 'colete-azul-aeronautica-com-gola-em-v',           'facultativo', 11, 'gola em "V"'),
		('masculino', null, 'alunos', 'sobretudo-masculino-azul-aeronautica',            'facultativo', 12, 'azul-aeronáutica'),
		('masculino', null, 'alunos', 'cachecol-branco',                                 'facultativo', 13, null),
		('masculino', null, 'alunos', 'quepe-masculino',                                 'eventual',    14, 'azul-aeronáutica'),
		('masculino', null, 'alunos', 'luva-preta-de-couro',                             'eventual',    18, null),
		('masculino', null, 'pracas', 'tunica-masculina-azul-aeronautica',               'obrigatorio', 0,  'azul-aeronáutica (sargentos, alunos da EEAR, cabos e soldados)'),
		('masculino', null, 'pracas', 'camisa-masculina-branca-de-mangas-compridas',     'obrigatorio', 1,  null),
		('masculino', null, 'pracas', 'gravata-horizontal-azul-aeronautica-ou-preta',    'obrigatorio', 2,  'preta, horizontal'),
		('masculino', null, 'pracas', 'calca-masculina-azul-aeronautica',                'obrigatorio', 3,  null),
		('masculino', null, 'pracas', 'cinto-azul-aeronautica-branco-ou-preto',          'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('masculino', null, 'pracas', 'sapato-masculino-preto-tipo-2',                   'obrigatorio', 5,  'preto'),
		('masculino', null, 'pracas', 'meia-preta-branca-de-nylon',                      'obrigatorio', 6,  'preta'),
		('masculino', null, 'pracas', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', null, 'pracas', 'colete-azul-aeronautica-com-gola-em-v',           'facultativo', 11, 'gola em "V"'),
		('masculino', null, 'pracas', 'sobretudo-masculino-azul-aeronautica',            'facultativo', 12, 'azul-aeronáutica'),
		('masculino', null, 'pracas', 'cachecol-branco',                                 'facultativo', 13, null),
		('masculino', null, 'pracas', 'quepe-masculino',                                 'eventual',    14, 'azul-aeronáutica'),
		('masculino', null, 'pracas', 'luva-preta-de-couro',                             'eventual',    18, null)
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from comp c
join rumaer.uniform u on u.numero = 3 and u.letra = 'A' and u.deleted_at is null
join rumaer.uniform_variant uv
	on uv.uniform_id = u.id
	and uv.circulo = c.circulo::rumaer.circulo_hierarquico
	and uv.genero = c.genero::rumaer.genero
	and uv.sub_variacao is not distinct from c.subvar
join rumaer.piece p on p.slug = c.slug and p.deleted_at is null
where not exists (
	select 1 from rumaer.uniform_variant_piece x where x.variant_id = uv.id and x.piece_id = p.id
);
