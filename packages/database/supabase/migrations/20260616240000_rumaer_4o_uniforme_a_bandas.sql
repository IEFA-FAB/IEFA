-- Cria e preenche o "4º Uniforme A" (Art. 22 do RUMAER), traje de rigor para bandas de música — grupo representacao.
-- Variantes por (círculo × gênero):
--   feminino  → oficiais, suboficiais, sargentos
--   masculino → oficiais, suboficiais, sargentos, praças (cabos e soldados)
-- Túnica transpassada azul-aeronáutica. Sem espada/espadim/quepe. Eventual apenas luva de couro preta.
-- Idempotente; casa variante por (círculo, gênero) e peça por slug.

do $$
declare
	u_id uuid;
begin
	select id into u_id from rumaer.uniform
	where numero = 4 and letra = 'A' and deleted_at is null limit 1;

	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (4, 'A', '4º Uniforme A', 'representacao', 'rigor', 'rigor', 'Art. 22', 60,
			'4º Uniforme "A", correspondente ao traje de rigor para bandas de música.')
		returning id into u_id;

		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id, 'oficiais'), (u_id, 'suboficiais'), (u_id, 'sargentos'), (u_id, 'pracas')
		on conflict (uniform_id, categoria) do nothing;

		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id, 'oficiais',    'feminino',  null, 0),
			(u_id, 'suboficiais', 'feminino',  null, 1),
			(u_id, 'sargentos',   'feminino',  null, 2),
			(u_id, 'oficiais',    'masculino', null, 3),
			(u_id, 'suboficiais', 'masculino', null, 4),
			(u_id, 'sargentos',   'masculino', null, 5),
			(u_id, 'pracas',      'masculino', null, 6)
		on conflict (uniform_id, circulo, genero, sub_variacao) do nothing;
	end if;
end $$;

with comp(genero, circulo, slug, nivel, ordem, obs) as (
	values
		-- ===================== FEMININO =====================
		('feminino', 'oficiais', 'tunica-transpassada-feminina-azul-aeronautica',     'obrigatorio', 0,  'azul-aeronáutica'),
		('feminino', 'oficiais', 'camisa-feminina-branca-de-mangas-compridas',        'obrigatorio', 1,  null),
		('feminino', 'oficiais', 'gravata-feminina-preta',                            'obrigatorio', 2,  null),
		('feminino', 'oficiais', 'saia-longa-azul-aeronautica',                       'obrigatorio', 3,  null),
		('feminino', 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto',            'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'oficiais', 'sapato-de-salto-alto',                              'obrigatorio', 5,  'preto'),
		('feminino', 'oficiais', 'meia-calca-social-lisa',                            'obrigatorio', 6,  'cor da pele'),
		('feminino', 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('feminino', 'oficiais', 'sobretudo-feminino-azul-aeronautica',               'facultativo', 11, 'azul-aeronáutica'),
		('feminino', 'oficiais', 'cachecol-branco',                                   'facultativo', 12, null),
		('feminino', 'oficiais', 'luva-preta-de-couro',                               'eventual',    13, null),
		('feminino', 'suboficiais', 'tunica-transpassada-feminina-azul-aeronautica',  'obrigatorio', 0,  'azul-aeronáutica'),
		('feminino', 'suboficiais', 'camisa-feminina-branca-de-mangas-compridas',     'obrigatorio', 1,  null),
		('feminino', 'suboficiais', 'gravata-feminina-preta',                         'obrigatorio', 2,  null),
		('feminino', 'suboficiais', 'saia-longa-azul-aeronautica',                    'obrigatorio', 3,  null),
		('feminino', 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto',         'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'suboficiais', 'sapato-de-salto-alto',                           'obrigatorio', 5,  'preto'),
		('feminino', 'suboficiais', 'meia-calca-social-lisa',                         'obrigatorio', 6,  'cor da pele'),
		('feminino', 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('feminino', 'suboficiais', 'sobretudo-feminino-azul-aeronautica',            'facultativo', 11, 'azul-aeronáutica'),
		('feminino', 'suboficiais', 'cachecol-branco',                                'facultativo', 12, null),
		('feminino', 'suboficiais', 'luva-preta-de-couro',                            'eventual',    13, null),
		('feminino', 'sargentos', 'tunica-transpassada-feminina-azul-aeronautica',    'obrigatorio', 0,  'azul-aeronáutica'),
		('feminino', 'sargentos', 'camisa-feminina-branca-de-mangas-compridas',       'obrigatorio', 1,  null),
		('feminino', 'sargentos', 'gravata-feminina-preta',                           'obrigatorio', 2,  null),
		('feminino', 'sargentos', 'saia-longa-azul-aeronautica',                      'obrigatorio', 3,  null),
		('feminino', 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto',           'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('feminino', 'sargentos', 'sapato-de-salto-alto',                             'obrigatorio', 5,  'preto'),
		('feminino', 'sargentos', 'meia-calca-social-lisa',                           'obrigatorio', 6,  'cor da pele'),
		('feminino', 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('feminino', 'sargentos', 'sobretudo-feminino-azul-aeronautica',              'facultativo', 11, 'azul-aeronáutica'),
		('feminino', 'sargentos', 'cachecol-branco',                                  'facultativo', 12, null),
		('feminino', 'sargentos', 'luva-preta-de-couro',                              'eventual',    13, null),

		-- ===================== MASCULINO =====================
		('masculino', 'oficiais', 'tunica-transpassada-masculina-azul-aeronautica',   'obrigatorio', 0,  'azul-aeronáutica'),
		('masculino', 'oficiais', 'camisa-masculina-branca-de-mangas-compridas',      'obrigatorio', 1,  null),
		('masculino', 'oficiais', 'gravata-horizontal-azul-aeronautica-ou-preta',     'obrigatorio', 2,  'preta, horizontal'),
		('masculino', 'oficiais', 'calca-masculina-azul-aeronautica',                 'obrigatorio', 3,  null),
		('masculino', 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto',           'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'oficiais', 'sapato-masculino-preto-tipo-2',                    'obrigatorio', 5,  'preto'),
		('masculino', 'oficiais', 'meia-preta-branca-de-nylon',                       'obrigatorio', 6,  'preta'),
		('masculino', 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', 'oficiais', 'sobretudo-masculino-azul-aeronautica',             'facultativo', 11, 'azul-aeronáutica'),
		('masculino', 'oficiais', 'cachecol-branco',                                  'facultativo', 12, null),
		('masculino', 'oficiais', 'luva-preta-de-couro',                              'eventual',    13, null),
		('masculino', 'suboficiais', 'tunica-transpassada-masculina-azul-aeronautica','obrigatorio', 0,  'azul-aeronáutica'),
		('masculino', 'suboficiais', 'camisa-masculina-branca-de-mangas-compridas',   'obrigatorio', 1,  null),
		('masculino', 'suboficiais', 'gravata-horizontal-azul-aeronautica-ou-preta',  'obrigatorio', 2,  'preta, horizontal'),
		('masculino', 'suboficiais', 'calca-masculina-azul-aeronautica',              'obrigatorio', 3,  null),
		('masculino', 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto',        'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'suboficiais', 'sapato-masculino-preto-tipo-2',                 'obrigatorio', 5,  'preto'),
		('masculino', 'suboficiais', 'meia-preta-branca-de-nylon',                    'obrigatorio', 6,  'preta'),
		('masculino', 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', 'suboficiais', 'sobretudo-masculino-azul-aeronautica',          'facultativo', 11, 'azul-aeronáutica'),
		('masculino', 'suboficiais', 'cachecol-branco',                               'facultativo', 12, null),
		('masculino', 'suboficiais', 'luva-preta-de-couro',                           'eventual',    13, null),
		('masculino', 'sargentos', 'tunica-transpassada-masculina-azul-aeronautica',  'obrigatorio', 0,  'azul-aeronáutica'),
		('masculino', 'sargentos', 'camisa-masculina-branca-de-mangas-compridas',     'obrigatorio', 1,  null),
		('masculino', 'sargentos', 'gravata-horizontal-azul-aeronautica-ou-preta',    'obrigatorio', 2,  'preta, horizontal'),
		('masculino', 'sargentos', 'calca-masculina-azul-aeronautica',                'obrigatorio', 3,  null),
		('masculino', 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto',          'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'sargentos', 'sapato-masculino-preto-tipo-2',                   'obrigatorio', 5,  'preto'),
		('masculino', 'sargentos', 'meia-preta-branca-de-nylon',                      'obrigatorio', 6,  'preta'),
		('masculino', 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', 'sargentos', 'sobretudo-masculino-azul-aeronautica',            'facultativo', 11, 'azul-aeronáutica'),
		('masculino', 'sargentos', 'cachecol-branco',                                 'facultativo', 12, null),
		('masculino', 'sargentos', 'luva-preta-de-couro',                             'eventual',    13, null),
		('masculino', 'pracas', 'tunica-transpassada-masculina-azul-aeronautica',     'obrigatorio', 0,  'azul-aeronáutica'),
		('masculino', 'pracas', 'camisa-masculina-branca-de-mangas-compridas',        'obrigatorio', 1,  null),
		('masculino', 'pracas', 'gravata-horizontal-azul-aeronautica-ou-preta',       'obrigatorio', 2,  'preta, horizontal'),
		('masculino', 'pracas', 'calca-masculina-azul-aeronautica',                   'obrigatorio', 3,  null),
		('masculino', 'pracas', 'cinto-azul-aeronautica-branco-ou-preto',             'obrigatorio', 4,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'pracas', 'sapato-masculino-preto-tipo-2',                      'obrigatorio', 5,  'preto'),
		('masculino', 'pracas', 'meia-preta-branca-de-nylon',                         'obrigatorio', 6,  'preta'),
		('masculino', 'pracas', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('masculino', 'pracas', 'sobretudo-masculino-azul-aeronautica',               'facultativo', 11, 'azul-aeronáutica'),
		('masculino', 'pracas', 'cachecol-branco',                                    'facultativo', 12, null),
		('masculino', 'pracas', 'luva-preta-de-couro',                                'eventual',    13, null)
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from comp c
join rumaer.uniform u on u.numero = 4 and u.letra = 'A' and u.deleted_at is null
join rumaer.uniform_variant uv
	on uv.uniform_id = u.id
	and uv.circulo = c.circulo::rumaer.circulo_hierarquico
	and uv.genero = c.genero::rumaer.genero
join rumaer.piece p on p.slug = c.slug and p.deleted_at is null
where not exists (
	select 1 from rumaer.uniform_variant_piece x where x.variant_id = uv.id and x.piece_id = p.id
);
