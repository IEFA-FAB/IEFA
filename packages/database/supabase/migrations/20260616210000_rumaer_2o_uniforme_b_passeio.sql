-- Cria e preenche o "2º Uniforme B" (Art. 19 do RUMAER), traje de passeio completo — grupo representacao.
-- Variantes por (círculo × gênero): oficiais, cadetes, suboficiais, sargentos, alunos.
-- Notas de modelagem:
--   • Túnica feminina/masculina branca: peça única por gênero; o artigo distingue o modelo "com passantes
--     (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)" do modelo
--     "para sargentos e alunos da EEAR" — registrado na observação. O círculo 'alunos' aqui = centros de
--     formação/adaptação de oficiais → com passantes.
--   • Saia OU calça: ambas registradas como obrigatórias com obs "(saia ou calça)"; a meia segue a peça inferior
--     (meia-calça cor da pele com saia; meia preta com calça), ambas obrigatórias com a respectiva observação.
--   • Espadim e guia para espadim: obrigatórios apenas para cadetes.
--   • Eventual com espada (espada, fiador, guia para espada): apenas para oficiais.
--   • Colete gola "V" facultativo nos dois gêneros (diferente do 2º A).
-- Idempotente: do-block cria uniform/categorias/variantes só se ainda não existir;
-- CTE insere a composição com guarda NOT EXISTS. Casa variante por (círculo, gênero) e peça por slug.

do $$
declare
	u_id uuid;
begin
	select id into u_id
	from rumaer.uniform
	where numero = 2 and letra = 'B' and deleted_at is null
	limit 1;

	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (
			2, 'B', '2º Uniforme B', 'representacao', 'passeio', 'passeio completo', 'Art. 19', 30,
			'2º Uniforme "B", correspondente ao traje de passeio completo.'
		)
		returning id into u_id;

		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id, 'oficiais'),
			(u_id, 'cadetes'),
			(u_id, 'suboficiais'),
			(u_id, 'sargentos'),
			(u_id, 'alunos_formacao')
		on conflict (uniform_id, categoria) do nothing;

		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id, 'oficiais',    'feminino',  null, 0),
			(u_id, 'cadetes',     'feminino',  null, 1),
			(u_id, 'suboficiais', 'feminino',  null, 2),
			(u_id, 'sargentos',   'feminino',  null, 3),
			(u_id, 'alunos',      'feminino',  null, 4),
			(u_id, 'oficiais',    'masculino', null, 5),
			(u_id, 'cadetes',     'masculino', null, 6),
			(u_id, 'suboficiais', 'masculino', null, 7),
			(u_id, 'sargentos',   'masculino', null, 8),
			(u_id, 'alunos',      'masculino', null, 9)
		on conflict (uniform_id, circulo, genero, sub_variacao) do nothing;
	end if;
end $$;

with comp(genero, circulo, slug, nivel, ordem, obs) as (
	values
		-- ===================== FEMININO =====================
		-- ---- oficiais ----
		('feminino', 'oficiais', 'tunica-feminina-branca',                           'obrigatorio', 0,  'branca, com passantes (oficiais, suboficiais, cadetes e alunas dos centros de formação ou de adaptação de oficiais)'),
		('feminino', 'oficiais', 'camisa-feminina-branca-de-mangas-compridas',       'obrigatorio', 1,  null),
		('feminino', 'oficiais', 'gravata-feminina-preta',                           'obrigatorio', 2,  null),
		('feminino', 'oficiais', 'saia-azul-aeronautica',                            'obrigatorio', 3,  'saia ou calça, azul-aeronáutica'),
		('feminino', 'oficiais', 'calca-feminina-azul-aeronautica',                  'obrigatorio', 4,  'saia ou calça, azul-aeronáutica'),
		('feminino', 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto',           'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'oficiais', 'sapato-feminino-de-salto-medio-tipo-2',            'obrigatorio', 6,  'preto, salto médio'),
		('feminino', 'oficiais', 'meia-calca-social-lisa',                           'obrigatorio', 7,  'cor da pele (quando usando saia)'),
		('feminino', 'oficiais', 'meia-preta-branca-de-nylon',                       'obrigatorio', 8,  'preta (quando usando calça)'),
		('feminino', 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 11, '2ª pele branca'),
		('feminino', 'oficiais', 'colete-azul-aeronautica-com-gola-em-v',            'facultativo', 12, 'gola em "V"'),
		('feminino', 'oficiais', 'sobretudo-feminino-azul-aeronautica',              'facultativo', 13, 'azul-aeronáutica'),
		('feminino', 'oficiais', 'cachecol-branco',                                  'facultativo', 14, null),
		('feminino', 'oficiais', 'quepe-feminino',                                   'eventual',    15, 'azul-aeronáutica'),
		('feminino', 'oficiais', 'fiador-para-espada',                               'eventual',    16, 'para oficiais'),
		('feminino', 'oficiais', 'guia-azul-aeronautica-de-seda-para-espada',        'eventual',    17, 'para oficiais'),
		('feminino', 'oficiais', 'espada',                                           'eventual',    18, 'para oficiais'),
		('feminino', 'oficiais', 'luva-preta-de-couro',                              'eventual',    19, null),
		-- ---- cadetes ----
		('feminino', 'cadetes', 'tunica-feminina-branca',                            'obrigatorio', 0,  'branca, com passantes (oficiais, suboficiais, cadetes e alunas dos centros de formação ou de adaptação de oficiais)'),
		('feminino', 'cadetes', 'camisa-feminina-branca-de-mangas-compridas',        'obrigatorio', 1,  null),
		('feminino', 'cadetes', 'gravata-feminina-preta',                            'obrigatorio', 2,  null),
		('feminino', 'cadetes', 'saia-azul-aeronautica',                             'obrigatorio', 3,  'saia ou calça, azul-aeronáutica'),
		('feminino', 'cadetes', 'calca-feminina-azul-aeronautica',                   'obrigatorio', 4,  'saia ou calça, azul-aeronáutica'),
		('feminino', 'cadetes', 'cinto-azul-aeronautica-branco-ou-preto',            'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'cadetes', 'sapato-feminino-de-salto-medio-tipo-2',             'obrigatorio', 6,  'preto, salto médio'),
		('feminino', 'cadetes', 'meia-calca-social-lisa',                            'obrigatorio', 7,  'cor da pele (quando usando saia)'),
		('feminino', 'cadetes', 'meia-preta-branca-de-nylon',                        'obrigatorio', 8,  'preta (quando usando calça)'),
		('feminino', 'cadetes', 'guia-azul-aeronautica-para-espadim',                'obrigatorio', 9,  'para cadetes'),
		('feminino', 'cadetes', 'espadim',                                           'obrigatorio', 10, 'para cadetes'),
		('feminino', 'cadetes', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 11, '2ª pele branca'),
		('feminino', 'cadetes', 'colete-azul-aeronautica-com-gola-em-v',             'facultativo', 12, 'gola em "V"'),
		('feminino', 'cadetes', 'sobretudo-feminino-azul-aeronautica',               'facultativo', 13, 'azul-aeronáutica'),
		('feminino', 'cadetes', 'cachecol-branco',                                   'facultativo', 14, null),
		('feminino', 'cadetes', 'quepe-feminino',                                    'eventual',    15, 'azul-aeronáutica'),
		('feminino', 'cadetes', 'luva-preta-de-couro',                               'eventual',    19, null),
		-- ---- suboficiais ----
		('feminino', 'suboficiais', 'tunica-feminina-branca',                        'obrigatorio', 0,  'branca, com passantes (oficiais, suboficiais, cadetes e alunas dos centros de formação ou de adaptação de oficiais)'),
		('feminino', 'suboficiais', 'camisa-feminina-branca-de-mangas-compridas',    'obrigatorio', 1,  null),
		('feminino', 'suboficiais', 'gravata-feminina-preta',                        'obrigatorio', 2,  null),
		('feminino', 'suboficiais', 'saia-azul-aeronautica',                         'obrigatorio', 3,  'saia ou calça, azul-aeronáutica'),
		('feminino', 'suboficiais', 'calca-feminina-azul-aeronautica',               'obrigatorio', 4,  'saia ou calça, azul-aeronáutica'),
		('feminino', 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto',        'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'suboficiais', 'sapato-feminino-de-salto-medio-tipo-2',         'obrigatorio', 6,  'preto, salto médio'),
		('feminino', 'suboficiais', 'meia-calca-social-lisa',                        'obrigatorio', 7,  'cor da pele (quando usando saia)'),
		('feminino', 'suboficiais', 'meia-preta-branca-de-nylon',                    'obrigatorio', 8,  'preta (quando usando calça)'),
		('feminino', 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 11, '2ª pele branca'),
		('feminino', 'suboficiais', 'colete-azul-aeronautica-com-gola-em-v',         'facultativo', 12, 'gola em "V"'),
		('feminino', 'suboficiais', 'sobretudo-feminino-azul-aeronautica',           'facultativo', 13, 'azul-aeronáutica'),
		('feminino', 'suboficiais', 'cachecol-branco',                               'facultativo', 14, null),
		('feminino', 'suboficiais', 'quepe-feminino',                                'eventual',    15, 'azul-aeronáutica'),
		('feminino', 'suboficiais', 'luva-preta-de-couro',                           'eventual',    19, null),
		-- ---- sargentos ----
		('feminino', 'sargentos', 'tunica-feminina-branca',                          'obrigatorio', 0,  'branca (sargentos e alunas da EEAR)'),
		('feminino', 'sargentos', 'camisa-feminina-branca-de-mangas-compridas',      'obrigatorio', 1,  null),
		('feminino', 'sargentos', 'gravata-feminina-preta',                          'obrigatorio', 2,  null),
		('feminino', 'sargentos', 'saia-azul-aeronautica',                           'obrigatorio', 3,  'saia ou calça, azul-aeronáutica'),
		('feminino', 'sargentos', 'calca-feminina-azul-aeronautica',                 'obrigatorio', 4,  'saia ou calça, azul-aeronáutica'),
		('feminino', 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto',          'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'sargentos', 'sapato-feminino-de-salto-medio-tipo-2',           'obrigatorio', 6,  'preto, salto médio'),
		('feminino', 'sargentos', 'meia-calca-social-lisa',                          'obrigatorio', 7,  'cor da pele (quando usando saia)'),
		('feminino', 'sargentos', 'meia-preta-branca-de-nylon',                      'obrigatorio', 8,  'preta (quando usando calça)'),
		('feminino', 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 11, '2ª pele branca'),
		('feminino', 'sargentos', 'colete-azul-aeronautica-com-gola-em-v',           'facultativo', 12, 'gola em "V"'),
		('feminino', 'sargentos', 'sobretudo-feminino-azul-aeronautica',             'facultativo', 13, 'azul-aeronáutica'),
		('feminino', 'sargentos', 'cachecol-branco',                                 'facultativo', 14, null),
		('feminino', 'sargentos', 'quepe-feminino',                                  'eventual',    15, 'azul-aeronáutica'),
		('feminino', 'sargentos', 'luva-preta-de-couro',                             'eventual',    19, null),
		-- ---- alunos (centros de formação ou de adaptação de oficiais) ----
		('feminino', 'alunos', 'tunica-feminina-branca',                             'obrigatorio', 0,  'branca, com passantes (oficiais, suboficiais, cadetes e alunas dos centros de formação ou de adaptação de oficiais)'),
		('feminino', 'alunos', 'camisa-feminina-branca-de-mangas-compridas',         'obrigatorio', 1,  null),
		('feminino', 'alunos', 'gravata-feminina-preta',                             'obrigatorio', 2,  null),
		('feminino', 'alunos', 'saia-azul-aeronautica',                              'obrigatorio', 3,  'saia ou calça, azul-aeronáutica'),
		('feminino', 'alunos', 'calca-feminina-azul-aeronautica',                    'obrigatorio', 4,  'saia ou calça, azul-aeronáutica'),
		('feminino', 'alunos', 'cinto-azul-aeronautica-branco-ou-preto',             'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'alunos', 'sapato-feminino-de-salto-medio-tipo-2',              'obrigatorio', 6,  'preto, salto médio'),
		('feminino', 'alunos', 'meia-calca-social-lisa',                             'obrigatorio', 7,  'cor da pele (quando usando saia)'),
		('feminino', 'alunos', 'meia-preta-branca-de-nylon',                         'obrigatorio', 8,  'preta (quando usando calça)'),
		('feminino', 'alunos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 11, '2ª pele branca'),
		('feminino', 'alunos', 'colete-azul-aeronautica-com-gola-em-v',              'facultativo', 12, 'gola em "V"'),
		('feminino', 'alunos', 'sobretudo-feminino-azul-aeronautica',                'facultativo', 13, 'azul-aeronáutica'),
		('feminino', 'alunos', 'cachecol-branco',                                    'facultativo', 14, null),
		('feminino', 'alunos', 'quepe-feminino',                                     'eventual',    15, 'azul-aeronáutica'),
		('feminino', 'alunos', 'luva-preta-de-couro',                                'eventual',    19, null),

		-- ===================== MASCULINO =====================
		-- ---- oficiais ----
		('masculino', 'oficiais', 'tunica-masculina-branca',                         'obrigatorio', 0,  'branca, com passantes (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)'),
		('masculino', 'oficiais', 'camisa-masculina-branca-de-mangas-compridas',     'obrigatorio', 1,  null),
		('masculino', 'oficiais', 'gravata-vertical-preta',                          'obrigatorio', 2,  'vertical'),
		('masculino', 'oficiais', 'calca-masculina-azul-aeronautica',                'obrigatorio', 3,  null),
		('masculino', 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto',          'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'oficiais', 'sapato-masculino-preto-tipo-2',                   'obrigatorio', 5,  'preto'),
		('masculino', 'oficiais', 'meia-preta-branca-de-nylon',                      'obrigatorio', 6,  'preta'),
		('masculino', 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', 'oficiais', 'colete-azul-aeronautica-com-gola-em-v',           'facultativo', 11, 'gola em "V"'),
		('masculino', 'oficiais', 'sobretudo-masculino-azul-aeronautica',            'facultativo', 12, 'azul-aeronáutica'),
		('masculino', 'oficiais', 'cachecol-branco',                                 'facultativo', 13, null),
		('masculino', 'oficiais', 'quepe-masculino',                                 'eventual',    14, 'azul-aeronáutica'),
		('masculino', 'oficiais', 'fiador-para-espada',                              'eventual',    15, 'para oficiais'),
		('masculino', 'oficiais', 'guia-azul-aeronautica-de-seda-para-espada',       'eventual',    16, 'para oficiais'),
		('masculino', 'oficiais', 'espada',                                          'eventual',    17, 'para oficiais'),
		('masculino', 'oficiais', 'luva-preta-de-couro',                             'eventual',    18, null),
		-- ---- cadetes ----
		('masculino', 'cadetes', 'tunica-masculina-branca',                          'obrigatorio', 0,  'branca, com passantes (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)'),
		('masculino', 'cadetes', 'camisa-masculina-branca-de-mangas-compridas',      'obrigatorio', 1,  null),
		('masculino', 'cadetes', 'gravata-vertical-preta',                           'obrigatorio', 2,  'vertical'),
		('masculino', 'cadetes', 'calca-masculina-azul-aeronautica',                 'obrigatorio', 3,  null),
		('masculino', 'cadetes', 'cinto-azul-aeronautica-branco-ou-preto',           'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'cadetes', 'sapato-masculino-preto-tipo-2',                    'obrigatorio', 5,  'preto'),
		('masculino', 'cadetes', 'meia-preta-branca-de-nylon',                       'obrigatorio', 6,  'preta'),
		('masculino', 'cadetes', 'guia-azul-aeronautica-para-espadim',               'obrigatorio', 8,  'para cadetes'),
		('masculino', 'cadetes', 'espadim',                                          'obrigatorio', 9,  'para cadetes'),
		('masculino', 'cadetes', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', 'cadetes', 'colete-azul-aeronautica-com-gola-em-v',            'facultativo', 11, 'gola em "V"'),
		('masculino', 'cadetes', 'sobretudo-masculino-azul-aeronautica',             'facultativo', 12, 'azul-aeronáutica'),
		('masculino', 'cadetes', 'cachecol-branco',                                  'facultativo', 13, null),
		('masculino', 'cadetes', 'quepe-masculino',                                  'eventual',    14, 'azul-aeronáutica'),
		('masculino', 'cadetes', 'luva-preta-de-couro',                              'eventual',    18, null),
		-- ---- suboficiais ----
		('masculino', 'suboficiais', 'tunica-masculina-branca',                      'obrigatorio', 0,  'branca, com passantes (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)'),
		('masculino', 'suboficiais', 'camisa-masculina-branca-de-mangas-compridas',  'obrigatorio', 1,  null),
		('masculino', 'suboficiais', 'gravata-vertical-preta',                       'obrigatorio', 2,  'vertical'),
		('masculino', 'suboficiais', 'calca-masculina-azul-aeronautica',             'obrigatorio', 3,  null),
		('masculino', 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto',       'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'suboficiais', 'sapato-masculino-preto-tipo-2',                'obrigatorio', 5,  'preto'),
		('masculino', 'suboficiais', 'meia-preta-branca-de-nylon',                   'obrigatorio', 6,  'preta'),
		('masculino', 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', 'suboficiais', 'colete-azul-aeronautica-com-gola-em-v',        'facultativo', 11, 'gola em "V"'),
		('masculino', 'suboficiais', 'sobretudo-masculino-azul-aeronautica',         'facultativo', 12, 'azul-aeronáutica'),
		('masculino', 'suboficiais', 'cachecol-branco',                              'facultativo', 13, null),
		('masculino', 'suboficiais', 'quepe-masculino',                              'eventual',    14, 'azul-aeronáutica'),
		('masculino', 'suboficiais', 'luva-preta-de-couro',                          'eventual',    18, null),
		-- ---- sargentos ----
		('masculino', 'sargentos', 'tunica-masculina-branca',                        'obrigatorio', 0,  'branca (sargentos e alunos da EEAR)'),
		('masculino', 'sargentos', 'camisa-masculina-branca-de-mangas-compridas',    'obrigatorio', 1,  null),
		('masculino', 'sargentos', 'gravata-vertical-preta',                         'obrigatorio', 2,  'vertical'),
		('masculino', 'sargentos', 'calca-masculina-azul-aeronautica',               'obrigatorio', 3,  null),
		('masculino', 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto',         'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'sargentos', 'sapato-masculino-preto-tipo-2',                  'obrigatorio', 5,  'preto'),
		('masculino', 'sargentos', 'meia-preta-branca-de-nylon',                     'obrigatorio', 6,  'preta'),
		('masculino', 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', 'sargentos', 'colete-azul-aeronautica-com-gola-em-v',          'facultativo', 11, 'gola em "V"'),
		('masculino', 'sargentos', 'sobretudo-masculino-azul-aeronautica',           'facultativo', 12, 'azul-aeronáutica'),
		('masculino', 'sargentos', 'cachecol-branco',                                'facultativo', 13, null),
		('masculino', 'sargentos', 'quepe-masculino',                                'eventual',    14, 'azul-aeronáutica'),
		('masculino', 'sargentos', 'luva-preta-de-couro',                            'eventual',    18, null),
		-- ---- alunos (centros de formação ou de adaptação de oficiais) ----
		('masculino', 'alunos', 'tunica-masculina-branca',                           'obrigatorio', 0,  'branca, com passantes (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)'),
		('masculino', 'alunos', 'camisa-masculina-branca-de-mangas-compridas',       'obrigatorio', 1,  null),
		('masculino', 'alunos', 'gravata-vertical-preta',                            'obrigatorio', 2,  'vertical'),
		('masculino', 'alunos', 'calca-masculina-azul-aeronautica',                  'obrigatorio', 3,  null),
		('masculino', 'alunos', 'cinto-azul-aeronautica-branco-ou-preto',            'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'alunos', 'sapato-masculino-preto-tipo-2',                     'obrigatorio', 5,  'preto'),
		('masculino', 'alunos', 'meia-preta-branca-de-nylon',                        'obrigatorio', 6,  'preta'),
		('masculino', 'alunos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', 'alunos', 'colete-azul-aeronautica-com-gola-em-v',             'facultativo', 11, 'gola em "V"'),
		('masculino', 'alunos', 'sobretudo-masculino-azul-aeronautica',              'facultativo', 12, 'azul-aeronáutica'),
		('masculino', 'alunos', 'cachecol-branco',                                   'facultativo', 13, null),
		('masculino', 'alunos', 'quepe-masculino',                                   'eventual',    14, 'azul-aeronáutica'),
		('masculino', 'alunos', 'luva-preta-de-couro',                               'eventual',    18, null)
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from comp c
join rumaer.uniform u
	on u.numero = 2 and u.letra = 'B' and u.deleted_at is null
join rumaer.uniform_variant uv
	on uv.uniform_id = u.id
	and uv.circulo = c.circulo::rumaer.circulo_hierarquico
	and uv.genero = c.genero::rumaer.genero
join rumaer.piece p on p.slug = c.slug and p.deleted_at is null
where not exists (
	select 1 from rumaer.uniform_variant_piece x where x.variant_id = uv.id and x.piece_id = p.id
);
