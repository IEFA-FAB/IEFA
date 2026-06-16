-- Cria e preenche o "2º Uniforme A" (Art. 18 do RUMAER), traje de rigor — grupo representacao.
-- Variantes por (círculo × gênero): oficiais, cadetes, suboficiais, sargentos, alunos.
--   ("alunas/alunos dos centros de formação ou de adaptação de oficiais" → círculo 'alunos').
-- Notas de modelagem:
--   • Jaqueta rigor feminina branca / túnica masculina branca: peça única por gênero; o artigo distingue o
--     modelo "com passantes (oficiais, suboficiais, cadetes e alunos)" do "para sargentos" — registrado na observação.
--   • Espadim e guia para espadim: obrigatórios apenas para cadetes.
--   • Colete azul-aeronáutica com gola em "V": facultativo, somente masculino.
--   • Quepe azul-aeronáutica (eventual) reusa a peça quepe-feminino/masculino com observação de cor.
-- Idempotente: do-block cria uniform/categorias/variantes só se ainda não existir;
-- CTE insere a composição com guarda NOT EXISTS. Casa variante por (círculo, gênero) e peça por slug.

do $$
declare
	u_id uuid;
begin
	select id into u_id
	from rumaer.uniform
	where numero = 2 and letra = 'A' and deleted_at is null
	limit 1;

	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (
			2, 'A', '2º Uniforme A', 'representacao', 'rigor', 'rigor', 'Art. 18', 20,
			'2º Uniforme "A", correspondente ao traje de rigor.'
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
		('feminino', 'oficiais', 'jaqueta-rigor-feminina-branca',                    'obrigatorio', 0,  'branca, com passantes (oficiais, suboficiais, cadetes e alunas dos centros de formação ou de adaptação de oficiais)'),
		('feminino', 'oficiais', 'camisa-feminina-branca-de-mangas-compridas',       'obrigatorio', 1,  null),
		('feminino', 'oficiais', 'gravata-feminina-preta',                           'obrigatorio', 2,  null),
		('feminino', 'oficiais', 'saia-longa-azul-aeronautica',                      'obrigatorio', 3,  null),
		('feminino', 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto',           'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'oficiais', 'faixa-preta-de-cetim',                             'obrigatorio', 5,  null),
		('feminino', 'oficiais', 'sapato-de-salto-alto',                             'obrigatorio', 6,  'preto'),
		('feminino', 'oficiais', 'meia-calca-social-lisa',                           'obrigatorio', 7,  'cor da pele'),
		('feminino', 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('feminino', 'oficiais', 'sobretudo-feminino-azul-aeronautica',              'facultativo', 11, 'azul-aeronáutica'),
		('feminino', 'oficiais', 'cachecol-branco',                                  'facultativo', 12, null),
		('feminino', 'oficiais', 'quepe-feminino',                                   'eventual',    13, 'azul-aeronáutica'),
		('feminino', 'oficiais', 'luva-preta-de-couro',                              'eventual',    14, null),
		-- ---- cadetes ----
		('feminino', 'cadetes', 'jaqueta-rigor-feminina-branca',                     'obrigatorio', 0,  'branca, com passantes (oficiais, suboficiais, cadetes e alunas dos centros de formação ou de adaptação de oficiais)'),
		('feminino', 'cadetes', 'camisa-feminina-branca-de-mangas-compridas',        'obrigatorio', 1,  null),
		('feminino', 'cadetes', 'gravata-feminina-preta',                            'obrigatorio', 2,  null),
		('feminino', 'cadetes', 'saia-longa-azul-aeronautica',                       'obrigatorio', 3,  null),
		('feminino', 'cadetes', 'cinto-azul-aeronautica-branco-ou-preto',            'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'cadetes', 'faixa-preta-de-cetim',                              'obrigatorio', 5,  null),
		('feminino', 'cadetes', 'sapato-de-salto-alto',                              'obrigatorio', 6,  'preto'),
		('feminino', 'cadetes', 'meia-calca-social-lisa',                            'obrigatorio', 7,  'cor da pele'),
		('feminino', 'cadetes', 'guia-azul-aeronautica-para-espadim',                'obrigatorio', 8,  null),
		('feminino', 'cadetes', 'espadim',                                           'obrigatorio', 9,  'para cadetes'),
		('feminino', 'cadetes', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('feminino', 'cadetes', 'sobretudo-feminino-azul-aeronautica',               'facultativo', 11, 'azul-aeronáutica'),
		('feminino', 'cadetes', 'cachecol-branco',                                   'facultativo', 12, null),
		('feminino', 'cadetes', 'quepe-feminino',                                    'eventual',    13, 'azul-aeronáutica'),
		('feminino', 'cadetes', 'luva-preta-de-couro',                               'eventual',    14, null),
		-- ---- suboficiais ----
		('feminino', 'suboficiais', 'jaqueta-rigor-feminina-branca',                 'obrigatorio', 0,  'branca, com passantes (oficiais, suboficiais, cadetes e alunas dos centros de formação ou de adaptação de oficiais)'),
		('feminino', 'suboficiais', 'camisa-feminina-branca-de-mangas-compridas',    'obrigatorio', 1,  null),
		('feminino', 'suboficiais', 'gravata-feminina-preta',                        'obrigatorio', 2,  null),
		('feminino', 'suboficiais', 'saia-longa-azul-aeronautica',                   'obrigatorio', 3,  null),
		('feminino', 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto',        'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'suboficiais', 'faixa-preta-de-cetim',                          'obrigatorio', 5,  null),
		('feminino', 'suboficiais', 'sapato-de-salto-alto',                          'obrigatorio', 6,  'preto'),
		('feminino', 'suboficiais', 'meia-calca-social-lisa',                        'obrigatorio', 7,  'cor da pele'),
		('feminino', 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('feminino', 'suboficiais', 'sobretudo-feminino-azul-aeronautica',           'facultativo', 11, 'azul-aeronáutica'),
		('feminino', 'suboficiais', 'cachecol-branco',                               'facultativo', 12, null),
		('feminino', 'suboficiais', 'quepe-feminino',                                'eventual',    13, 'azul-aeronáutica'),
		('feminino', 'suboficiais', 'luva-preta-de-couro',                           'eventual',    14, null),
		-- ---- sargentos ----
		('feminino', 'sargentos', 'jaqueta-rigor-feminina-branca',                   'obrigatorio', 0,  'branca (sargentos)'),
		('feminino', 'sargentos', 'camisa-feminina-branca-de-mangas-compridas',      'obrigatorio', 1,  null),
		('feminino', 'sargentos', 'gravata-feminina-preta',                          'obrigatorio', 2,  null),
		('feminino', 'sargentos', 'saia-longa-azul-aeronautica',                     'obrigatorio', 3,  null),
		('feminino', 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto',          'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'sargentos', 'faixa-preta-de-cetim',                            'obrigatorio', 5,  null),
		('feminino', 'sargentos', 'sapato-de-salto-alto',                            'obrigatorio', 6,  'preto'),
		('feminino', 'sargentos', 'meia-calca-social-lisa',                          'obrigatorio', 7,  'cor da pele'),
		('feminino', 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('feminino', 'sargentos', 'sobretudo-feminino-azul-aeronautica',             'facultativo', 11, 'azul-aeronáutica'),
		('feminino', 'sargentos', 'cachecol-branco',                                 'facultativo', 12, null),
		('feminino', 'sargentos', 'quepe-feminino',                                  'eventual',    13, 'azul-aeronáutica'),
		('feminino', 'sargentos', 'luva-preta-de-couro',                             'eventual',    14, null),
		-- ---- alunos (centros de formação ou de adaptação de oficiais) ----
		('feminino', 'alunos', 'jaqueta-rigor-feminina-branca',                      'obrigatorio', 0,  'branca, com passantes (oficiais, suboficiais, cadetes e alunas dos centros de formação ou de adaptação de oficiais)'),
		('feminino', 'alunos', 'camisa-feminina-branca-de-mangas-compridas',         'obrigatorio', 1,  null),
		('feminino', 'alunos', 'gravata-feminina-preta',                             'obrigatorio', 2,  null),
		('feminino', 'alunos', 'saia-longa-azul-aeronautica',                        'obrigatorio', 3,  null),
		('feminino', 'alunos', 'cinto-azul-aeronautica-branco-ou-preto',             'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'alunos', 'faixa-preta-de-cetim',                               'obrigatorio', 5,  null),
		('feminino', 'alunos', 'sapato-de-salto-alto',                               'obrigatorio', 6,  'preto'),
		('feminino', 'alunos', 'meia-calca-social-lisa',                             'obrigatorio', 7,  'cor da pele'),
		('feminino', 'alunos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('feminino', 'alunos', 'sobretudo-feminino-azul-aeronautica',                'facultativo', 11, 'azul-aeronáutica'),
		('feminino', 'alunos', 'cachecol-branco',                                    'facultativo', 12, null),
		('feminino', 'alunos', 'quepe-feminino',                                     'eventual',    13, 'azul-aeronáutica'),
		('feminino', 'alunos', 'luva-preta-de-couro',                                'eventual',    14, null),

		-- ===================== MASCULINO =====================
		-- ---- oficiais ----
		('masculino', 'oficiais', 'tunica-masculina-branca',                         'obrigatorio', 0,  'branca, com passantes (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)'),
		('masculino', 'oficiais', 'camisa-masculina-branca-de-mangas-compridas',     'obrigatorio', 1,  null),
		('masculino', 'oficiais', 'gravata-horizontal-azul-aeronautica-ou-preta',    'obrigatorio', 2,  'preta, horizontal'),
		('masculino', 'oficiais', 'calca-masculina-azul-aeronautica',                'obrigatorio', 3,  null),
		('masculino', 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto',          'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'oficiais', 'sapato-masculino-preto-tipo-2',                   'obrigatorio', 5,  'preto'),
		('masculino', 'oficiais', 'meia-preta-branca-de-nylon',                      'obrigatorio', 6,  'preta'),
		('masculino', 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', 'oficiais', 'colete-azul-aeronautica-com-gola-em-v',           'facultativo', 11, 'gola em "V"'),
		('masculino', 'oficiais', 'sobretudo-masculino-azul-aeronautica',            'facultativo', 12, 'azul-aeronáutica'),
		('masculino', 'oficiais', 'cachecol-branco',                                 'facultativo', 13, null),
		('masculino', 'oficiais', 'quepe-masculino',                                 'eventual',    14, 'azul-aeronáutica'),
		('masculino', 'oficiais', 'luva-preta-de-couro',                             'eventual',    15, null),
		-- ---- cadetes ----
		('masculino', 'cadetes', 'tunica-masculina-branca',                          'obrigatorio', 0,  'branca, com passantes (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)'),
		('masculino', 'cadetes', 'camisa-masculina-branca-de-mangas-compridas',      'obrigatorio', 1,  null),
		('masculino', 'cadetes', 'gravata-horizontal-azul-aeronautica-ou-preta',     'obrigatorio', 2,  'preta, horizontal'),
		('masculino', 'cadetes', 'calca-masculina-azul-aeronautica',                 'obrigatorio', 3,  null),
		('masculino', 'cadetes', 'cinto-azul-aeronautica-branco-ou-preto',           'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'cadetes', 'sapato-masculino-preto-tipo-2',                    'obrigatorio', 5,  'preto'),
		('masculino', 'cadetes', 'meia-preta-branca-de-nylon',                       'obrigatorio', 6,  'preta'),
		('masculino', 'cadetes', 'guia-azul-aeronautica-para-espadim',               'obrigatorio', 8,  null),
		('masculino', 'cadetes', 'espadim',                                          'obrigatorio', 9,  'para cadetes'),
		('masculino', 'cadetes', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', 'cadetes', 'colete-azul-aeronautica-com-gola-em-v',            'facultativo', 11, 'gola em "V"'),
		('masculino', 'cadetes', 'sobretudo-masculino-azul-aeronautica',             'facultativo', 12, 'azul-aeronáutica'),
		('masculino', 'cadetes', 'cachecol-branco',                                  'facultativo', 13, null),
		('masculino', 'cadetes', 'quepe-masculino',                                  'eventual',    14, 'azul-aeronáutica'),
		('masculino', 'cadetes', 'luva-preta-de-couro',                              'eventual',    15, null),
		-- ---- suboficiais ----
		('masculino', 'suboficiais', 'tunica-masculina-branca',                      'obrigatorio', 0,  'branca, com passantes (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)'),
		('masculino', 'suboficiais', 'camisa-masculina-branca-de-mangas-compridas',  'obrigatorio', 1,  null),
		('masculino', 'suboficiais', 'gravata-horizontal-azul-aeronautica-ou-preta', 'obrigatorio', 2,  'preta, horizontal'),
		('masculino', 'suboficiais', 'calca-masculina-azul-aeronautica',             'obrigatorio', 3,  null),
		('masculino', 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto',       'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'suboficiais', 'sapato-masculino-preto-tipo-2',                'obrigatorio', 5,  'preto'),
		('masculino', 'suboficiais', 'meia-preta-branca-de-nylon',                   'obrigatorio', 6,  'preta'),
		('masculino', 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', 'suboficiais', 'colete-azul-aeronautica-com-gola-em-v',        'facultativo', 11, 'gola em "V"'),
		('masculino', 'suboficiais', 'sobretudo-masculino-azul-aeronautica',         'facultativo', 12, 'azul-aeronáutica'),
		('masculino', 'suboficiais', 'cachecol-branco',                              'facultativo', 13, null),
		('masculino', 'suboficiais', 'quepe-masculino',                              'eventual',    14, 'azul-aeronáutica'),
		('masculino', 'suboficiais', 'luva-preta-de-couro',                          'eventual',    15, null),
		-- ---- sargentos ----
		('masculino', 'sargentos', 'tunica-masculina-branca',                        'obrigatorio', 0,  'branca (sargentos)'),
		('masculino', 'sargentos', 'camisa-masculina-branca-de-mangas-compridas',    'obrigatorio', 1,  null),
		('masculino', 'sargentos', 'gravata-horizontal-azul-aeronautica-ou-preta',   'obrigatorio', 2,  'preta, horizontal'),
		('masculino', 'sargentos', 'calca-masculina-azul-aeronautica',               'obrigatorio', 3,  null),
		('masculino', 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto',         'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'sargentos', 'sapato-masculino-preto-tipo-2',                  'obrigatorio', 5,  'preto'),
		('masculino', 'sargentos', 'meia-preta-branca-de-nylon',                     'obrigatorio', 6,  'preta'),
		('masculino', 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', 'sargentos', 'colete-azul-aeronautica-com-gola-em-v',          'facultativo', 11, 'gola em "V"'),
		('masculino', 'sargentos', 'sobretudo-masculino-azul-aeronautica',           'facultativo', 12, 'azul-aeronáutica'),
		('masculino', 'sargentos', 'cachecol-branco',                                'facultativo', 13, null),
		('masculino', 'sargentos', 'quepe-masculino',                                'eventual',    14, 'azul-aeronáutica'),
		('masculino', 'sargentos', 'luva-preta-de-couro',                            'eventual',    15, null),
		-- ---- alunos (centros de formação ou de adaptação de oficiais) ----
		('masculino', 'alunos', 'tunica-masculina-branca',                           'obrigatorio', 0,  'branca, com passantes (oficiais, suboficiais, cadetes e alunos dos centros de formação ou de adaptação de oficiais)'),
		('masculino', 'alunos', 'camisa-masculina-branca-de-mangas-compridas',       'obrigatorio', 1,  null),
		('masculino', 'alunos', 'gravata-horizontal-azul-aeronautica-ou-preta',      'obrigatorio', 2,  'preta, horizontal'),
		('masculino', 'alunos', 'calca-masculina-azul-aeronautica',                  'obrigatorio', 3,  null),
		('masculino', 'alunos', 'cinto-azul-aeronautica-branco-ou-preto',            'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'alunos', 'sapato-masculino-preto-tipo-2',                     'obrigatorio', 5,  'preto'),
		('masculino', 'alunos', 'meia-preta-branca-de-nylon',                        'obrigatorio', 6,  'preta'),
		('masculino', 'alunos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', 'alunos', 'colete-azul-aeronautica-com-gola-em-v',             'facultativo', 11, 'gola em "V"'),
		('masculino', 'alunos', 'sobretudo-masculino-azul-aeronautica',              'facultativo', 12, 'azul-aeronáutica'),
		('masculino', 'alunos', 'cachecol-branco',                                   'facultativo', 13, null),
		('masculino', 'alunos', 'quepe-masculino',                                   'eventual',    14, 'azul-aeronáutica'),
		('masculino', 'alunos', 'luva-preta-de-couro',                               'eventual',    15, null)
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from comp c
join rumaer.uniform u
	on u.numero = 2 and u.letra = 'A' and u.deleted_at is null
join rumaer.uniform_variant uv
	on uv.uniform_id = u.id
	and uv.circulo = c.circulo::rumaer.circulo_hierarquico
	and uv.genero = c.genero::rumaer.genero
join rumaer.piece p on p.slug = c.slug and p.deleted_at is null
where not exists (
	select 1 from rumaer.uniform_variant_piece x where x.variant_id = uv.id and x.piece_id = p.id
);
