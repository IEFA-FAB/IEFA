-- Cria e preenche o "1º Uniforme" (Art. 17 do RUMAER), traje de gala — grupo representacao.
-- Uma única peça de catálogo, com variantes por (círculo × gênero): oficiais, cadetes, suboficiais, sargentos.
-- Notas de modelagem:
--   • Jaqueta de gala: o catálogo tem uma única jaqueta de gala azul-ferrete por gênero. O artigo distingue
--     o modelo "para oficiais, suboficiais e cadetes" do modelo "para sargentos" — distinção registrada na
--     observação (mesma convenção de "túnica com/sem passadeiras"), reusando a mesma peça.
--   • Sobretudo azul-aeronáutica (facultativo): não existia no catálogo (só preto) — criado abaixo.
--   • Espadim e guia para espadim: obrigatórios apenas para cadetes ("espadim para cadetes").
--   • Espada não compõe o 1º Uniforme (gala usa espadim).
-- Idempotente: do-block cria uniform/categorias/variantes só se ainda não existir;
-- CTE insere a composição com guarda NOT EXISTS. Casa variante por (círculo, gênero) e peça por slug.

-- Peças novas (sobretudo de gala azul-aeronáutica) — sem código FAB conhecido.
insert into rumaer.piece (codigo, nome, slug, tipo) values
	(null, 'sobretudo feminino azul-aeronáutica',  'sobretudo-feminino-azul-aeronautica',  'torso'),
	(null, 'sobretudo masculino azul-aeronáutica', 'sobretudo-masculino-azul-aeronautica', 'torso')
on conflict (slug) do update set
	nome = excluded.nome,
	tipo = coalesce(excluded.tipo, rumaer.piece.tipo),
	deleted_at = null,
	updated_at = now();

do $$
declare
	u_id uuid;
begin
	select id into u_id
	from rumaer.uniform
	where numero = 1 and letra is null and deleted_at is null
	limit 1;

	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, eq_civil, ordem, descricao_md)
		values (
			1, null, '1º Uniforme', 'representacao', 'gala', 'gala', 'Art. 17', 'gala', 10,
			'1º Uniforme, correspondente ao traje de gala.'
		)
		returning id into u_id;

		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id, 'oficiais'),
			(u_id, 'cadetes'),
			(u_id, 'suboficiais'),
			(u_id, 'sargentos')
		on conflict (uniform_id, categoria) do nothing;

		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id, 'oficiais',    'feminino',  null, 0),
			(u_id, 'cadetes',     'feminino',  null, 1),
			(u_id, 'suboficiais', 'feminino',  null, 2),
			(u_id, 'sargentos',   'feminino',  null, 3),
			(u_id, 'oficiais',    'masculino', null, 4),
			(u_id, 'cadetes',     'masculino', null, 5),
			(u_id, 'suboficiais', 'masculino', null, 6),
			(u_id, 'sargentos',   'masculino', null, 7)
		on conflict (uniform_id, circulo, genero, sub_variacao) do nothing;
	end if;
end $$;

with comp(genero, circulo, slug, nivel, ordem, obs) as (
	values
		-- ===================== FEMININO =====================
		-- ---- oficiais ----
		('feminino', 'oficiais', 'jaqueta-feminina-azul-ferrete',                    'obrigatorio', 0,  'de gala, azul-ferrete (oficiais, suboficiais e cadetes)'),
		('feminino', 'oficiais', 'camisa-de-gala-feminina-branca',                   'obrigatorio', 1,  'branca'),
		('feminino', 'oficiais', 'gravata-feminina-preta',                           'obrigatorio', 2,  null),
		('feminino', 'oficiais', 'saia-longa-azul-ferrete',                          'obrigatorio', 3,  null),
		('feminino', 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto',           'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'oficiais', 'faixa-preta-de-cetim',                             'obrigatorio', 5,  null),
		('feminino', 'oficiais', 'sapato-de-salto-alto',                             'obrigatorio', 6,  'preto'),
		('feminino', 'oficiais', 'meia-calca-social-lisa',                           'obrigatorio', 7,  'cor da pele'),
		('feminino', 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('feminino', 'oficiais', 'sobretudo-feminino-azul-aeronautica',              'facultativo', 11, 'azul-aeronáutica'),
		('feminino', 'oficiais', 'cachecol-branco',                                  'facultativo', 12, null),
		('feminino', 'oficiais', 'quepe-feminino',                                   'eventual',    13, 'branco'),
		('feminino', 'oficiais', 'luva-preta-de-couro',                              'eventual',    14, null),
		-- ---- cadetes ----
		('feminino', 'cadetes', 'jaqueta-feminina-azul-ferrete',                     'obrigatorio', 0,  'de gala, azul-ferrete (oficiais, suboficiais e cadetes)'),
		('feminino', 'cadetes', 'camisa-de-gala-feminina-branca',                    'obrigatorio', 1,  'branca'),
		('feminino', 'cadetes', 'gravata-feminina-preta',                            'obrigatorio', 2,  null),
		('feminino', 'cadetes', 'saia-longa-azul-ferrete',                           'obrigatorio', 3,  null),
		('feminino', 'cadetes', 'cinto-azul-aeronautica-branco-ou-preto',            'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'cadetes', 'faixa-preta-de-cetim',                              'obrigatorio', 5,  null),
		('feminino', 'cadetes', 'sapato-de-salto-alto',                              'obrigatorio', 6,  'preto'),
		('feminino', 'cadetes', 'meia-calca-social-lisa',                            'obrigatorio', 7,  'cor da pele'),
		('feminino', 'cadetes', 'guia-azul-aeronautica-para-espadim',                'obrigatorio', 8,  null),
		('feminino', 'cadetes', 'espadim',                                           'obrigatorio', 9,  'para cadetes'),
		('feminino', 'cadetes', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('feminino', 'cadetes', 'sobretudo-feminino-azul-aeronautica',               'facultativo', 11, 'azul-aeronáutica'),
		('feminino', 'cadetes', 'cachecol-branco',                                   'facultativo', 12, null),
		('feminino', 'cadetes', 'quepe-feminino',                                    'eventual',    13, 'branco'),
		('feminino', 'cadetes', 'luva-preta-de-couro',                               'eventual',    14, null),
		-- ---- suboficiais ----
		('feminino', 'suboficiais', 'jaqueta-feminina-azul-ferrete',                 'obrigatorio', 0,  'de gala, azul-ferrete (oficiais, suboficiais e cadetes)'),
		('feminino', 'suboficiais', 'camisa-de-gala-feminina-branca',                'obrigatorio', 1,  'branca'),
		('feminino', 'suboficiais', 'gravata-feminina-preta',                        'obrigatorio', 2,  null),
		('feminino', 'suboficiais', 'saia-longa-azul-ferrete',                       'obrigatorio', 3,  null),
		('feminino', 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto',        'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'suboficiais', 'faixa-preta-de-cetim',                          'obrigatorio', 5,  null),
		('feminino', 'suboficiais', 'sapato-de-salto-alto',                          'obrigatorio', 6,  'preto'),
		('feminino', 'suboficiais', 'meia-calca-social-lisa',                        'obrigatorio', 7,  'cor da pele'),
		('feminino', 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('feminino', 'suboficiais', 'sobretudo-feminino-azul-aeronautica',           'facultativo', 11, 'azul-aeronáutica'),
		('feminino', 'suboficiais', 'cachecol-branco',                               'facultativo', 12, null),
		('feminino', 'suboficiais', 'quepe-feminino',                                'eventual',    13, 'branco'),
		('feminino', 'suboficiais', 'luva-preta-de-couro',                           'eventual',    14, null),
		-- ---- sargentos ----
		('feminino', 'sargentos', 'jaqueta-feminina-azul-ferrete',                   'obrigatorio', 0,  'de gala, azul-ferrete (sargentos)'),
		('feminino', 'sargentos', 'camisa-de-gala-feminina-branca',                  'obrigatorio', 1,  'branca'),
		('feminino', 'sargentos', 'gravata-feminina-preta',                          'obrigatorio', 2,  null),
		('feminino', 'sargentos', 'saia-longa-azul-ferrete',                         'obrigatorio', 3,  null),
		('feminino', 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto',          'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'sargentos', 'faixa-preta-de-cetim',                            'obrigatorio', 5,  null),
		('feminino', 'sargentos', 'sapato-de-salto-alto',                            'obrigatorio', 6,  'preto'),
		('feminino', 'sargentos', 'meia-calca-social-lisa',                          'obrigatorio', 7,  'cor da pele'),
		('feminino', 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('feminino', 'sargentos', 'sobretudo-feminino-azul-aeronautica',             'facultativo', 11, 'azul-aeronáutica'),
		('feminino', 'sargentos', 'cachecol-branco',                                 'facultativo', 12, null),
		('feminino', 'sargentos', 'quepe-feminino',                                  'eventual',    13, 'branco'),
		('feminino', 'sargentos', 'luva-preta-de-couro',                             'eventual',    14, null),

		-- ===================== MASCULINO =====================
		-- ---- oficiais ----
		('masculino', 'oficiais', 'jaqueta-masculina-azul-ferrete-de-gala',          'obrigatorio', 0,  'azul-ferrete (oficiais, suboficiais e cadetes)'),
		('masculino', 'oficiais', 'camisa-de-gala-masculina-branca',                 'obrigatorio', 1,  'branca'),
		('masculino', 'oficiais', 'gravata-horizontal-azul-aeronautica-ou-preta',    'obrigatorio', 2,  'preta, horizontal'),
		('masculino', 'oficiais', 'calca-masculina-azul-ferrete',                    'obrigatorio', 3,  null),
		('masculino', 'oficiais', 'faixa-preta-de-cetim',                            'obrigatorio', 4,  null),
		('masculino', 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto',          'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'oficiais', 'meia-preta-branca-de-nylon',                      'obrigatorio', 6,  'preta'),
		('masculino', 'oficiais', 'sapato-masculino-preto-tipo-2',                   'obrigatorio', 7,  'preto'),
		('masculino', 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', 'oficiais', 'sobretudo-masculino-azul-aeronautica',            'facultativo', 11, 'azul-aeronáutica'),
		('masculino', 'oficiais', 'cachecol-branco',                                 'facultativo', 12, null),
		('masculino', 'oficiais', 'quepe-masculino',                                 'eventual',    13, 'branco'),
		('masculino', 'oficiais', 'luva-preta-de-couro',                             'eventual',    14, null),
		-- ---- cadetes ----
		('masculino', 'cadetes', 'jaqueta-masculina-azul-ferrete-de-gala',           'obrigatorio', 0,  'azul-ferrete (oficiais, suboficiais e cadetes)'),
		('masculino', 'cadetes', 'camisa-de-gala-masculina-branca',                  'obrigatorio', 1,  'branca'),
		('masculino', 'cadetes', 'gravata-horizontal-azul-aeronautica-ou-preta',     'obrigatorio', 2,  'preta, horizontal'),
		('masculino', 'cadetes', 'calca-masculina-azul-ferrete',                     'obrigatorio', 3,  null),
		('masculino', 'cadetes', 'faixa-preta-de-cetim',                             'obrigatorio', 4,  null),
		('masculino', 'cadetes', 'cinto-azul-aeronautica-branco-ou-preto',           'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'cadetes', 'meia-preta-branca-de-nylon',                       'obrigatorio', 6,  'preta'),
		('masculino', 'cadetes', 'sapato-masculino-preto-tipo-2',                    'obrigatorio', 7,  'preto'),
		('masculino', 'cadetes', 'guia-azul-aeronautica-para-espadim',               'obrigatorio', 8,  null),
		('masculino', 'cadetes', 'espadim',                                          'obrigatorio', 9,  'para cadetes'),
		('masculino', 'cadetes', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', 'cadetes', 'sobretudo-masculino-azul-aeronautica',             'facultativo', 11, 'azul-aeronáutica'),
		('masculino', 'cadetes', 'cachecol-branco',                                  'facultativo', 12, null),
		('masculino', 'cadetes', 'quepe-masculino',                                  'eventual',    13, 'branco'),
		('masculino', 'cadetes', 'luva-preta-de-couro',                              'eventual',    14, null),
		-- ---- suboficiais ----
		('masculino', 'suboficiais', 'jaqueta-masculina-azul-ferrete-de-gala',       'obrigatorio', 0,  'azul-ferrete (oficiais, suboficiais e cadetes)'),
		('masculino', 'suboficiais', 'camisa-de-gala-masculina-branca',              'obrigatorio', 1,  'branca'),
		('masculino', 'suboficiais', 'gravata-horizontal-azul-aeronautica-ou-preta', 'obrigatorio', 2,  'preta, horizontal'),
		('masculino', 'suboficiais', 'calca-masculina-azul-ferrete',                 'obrigatorio', 3,  null),
		('masculino', 'suboficiais', 'faixa-preta-de-cetim',                         'obrigatorio', 4,  null),
		('masculino', 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto',       'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'suboficiais', 'meia-preta-branca-de-nylon',                   'obrigatorio', 6,  'preta'),
		('masculino', 'suboficiais', 'sapato-masculino-preto-tipo-2',                'obrigatorio', 7,  'preto'),
		('masculino', 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', 'suboficiais', 'sobretudo-masculino-azul-aeronautica',         'facultativo', 11, 'azul-aeronáutica'),
		('masculino', 'suboficiais', 'cachecol-branco',                              'facultativo', 12, null),
		('masculino', 'suboficiais', 'quepe-masculino',                              'eventual',    13, 'branco'),
		('masculino', 'suboficiais', 'luva-preta-de-couro',                          'eventual',    14, null),
		-- ---- sargentos ----
		('masculino', 'sargentos', 'jaqueta-masculina-azul-ferrete-de-gala',         'obrigatorio', 0,  'azul-ferrete (sargentos)'),
		('masculino', 'sargentos', 'camisa-de-gala-masculina-branca',                'obrigatorio', 1,  'branca'),
		('masculino', 'sargentos', 'gravata-horizontal-azul-aeronautica-ou-preta',   'obrigatorio', 2,  'preta, horizontal'),
		('masculino', 'sargentos', 'calca-masculina-azul-ferrete',                   'obrigatorio', 3,  null),
		('masculino', 'sargentos', 'faixa-preta-de-cetim',                           'obrigatorio', 4,  null),
		('masculino', 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto',         'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'sargentos', 'meia-preta-branca-de-nylon',                     'obrigatorio', 6,  'preta'),
		('masculino', 'sargentos', 'sapato-masculino-preto-tipo-2',                  'obrigatorio', 7,  'preto'),
		('masculino', 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', 'sargentos', 'sobretudo-masculino-azul-aeronautica',           'facultativo', 11, 'azul-aeronáutica'),
		('masculino', 'sargentos', 'cachecol-branco',                                'facultativo', 12, null),
		('masculino', 'sargentos', 'quepe-masculino',                                'eventual',    13, 'branco'),
		('masculino', 'sargentos', 'luva-preta-de-couro',                            'eventual',    14, null)
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from comp c
join rumaer.uniform u
	on u.numero = 1 and u.letra is null and u.deleted_at is null
join rumaer.uniform_variant uv
	on uv.uniform_id = u.id
	and uv.circulo = c.circulo::rumaer.circulo_hierarquico
	and uv.genero = c.genero::rumaer.genero
join rumaer.piece p on p.slug = c.slug and p.deleted_at is null
where not exists (
	select 1 from rumaer.uniform_variant_piece x where x.variant_id = uv.id and x.piece_id = p.id
);
