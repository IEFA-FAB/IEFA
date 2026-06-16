-- Cria e preenche o "4º Uniforme B" (Art. 23 do RUMAER), traje de rigor para a Orquestra Sinfônica da
-- Aeronáutica — grupo representacao. (O artigo cita "B e C"; o texto fornecido detalha apenas o "B".)
-- Variantes:
--   feminino  → suboficiais, sargentos
--   masculino → suboficiais, sargentos, praças (cabos e soldados)
--   maestro   → oficiais, suboficiais   (genero='masculino', sub_variacao='maestro')
-- Peças novas: jaqueta feminina/masculina azul-aeronáutica para orquestra (catálogo só tinha as brancas).
-- Idempotente; casa variante por (círculo, gênero, sub_variação) e peça por slug.

insert into rumaer.piece (codigo, nome, slug, tipo) values
	(null, 'jaqueta feminina azul-aeronáutica para orquestra',  'jaqueta-feminina-azul-aeronautica-para-orquestra',  'torso'),
	(null, 'jaqueta masculina azul-aeronáutica para orquestra', 'jaqueta-masculina-azul-aeronautica-para-orquestra', 'torso')
on conflict (slug) do update set
	nome = excluded.nome,
	tipo = coalesce(excluded.tipo, rumaer.piece.tipo),
	deleted_at = null,
	updated_at = now();

do $$
declare
	u_id uuid;
begin
	select id into u_id from rumaer.uniform
	where numero = 4 and letra = 'B' and deleted_at is null limit 1;

	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (4, 'B', '4º Uniforme B', 'representacao', 'rigor', 'rigor', 'Art. 23', 70,
			'4º Uniforme "B", correspondente ao traje de rigor para a Orquestra Sinfônica da Aeronáutica.')
		returning id into u_id;

		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id, 'oficiais'), (u_id, 'suboficiais'), (u_id, 'sargentos'), (u_id, 'pracas')
		on conflict (uniform_id, categoria) do nothing;

		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id, 'suboficiais', 'feminino',  null,      0),
			(u_id, 'sargentos',   'feminino',  null,      1),
			(u_id, 'suboficiais', 'masculino', null,      2),
			(u_id, 'sargentos',   'masculino', null,      3),
			(u_id, 'pracas',      'masculino', null,      4),
			(u_id, 'oficiais',    'masculino', 'maestro', 5),
			(u_id, 'suboficiais', 'masculino', 'maestro', 6)
		on conflict (uniform_id, circulo, genero, sub_variacao) do nothing;
	end if;
end $$;

with comp(genero, subvar, circulo, slug, nivel, ordem, obs) as (
	values
		-- ===================== FEMININO =====================
		('feminino', null, 'suboficiais', 'jaqueta-feminina-azul-aeronautica-para-orquestra', 'obrigatorio', 0,  'azul-aeronáutica, para orquestra'),
		('feminino', null, 'suboficiais', 'camisa-feminina-branca-de-mangas-compridas',       'obrigatorio', 1,  null),
		('feminino', null, 'suboficiais', 'gravata-feminina-com-laco',                        'obrigatorio', 2,  'preta, com laço'),
		('feminino', null, 'suboficiais', 'saia-azul-aeronautica-para-orquestra',             'obrigatorio', 3,  'saia ou calça, azul-aeronáutica, para orquestra'),
		('feminino', null, 'suboficiais', 'calca-feminina-azul-aeronautica-para-orquestra',   'obrigatorio', 4,  'saia ou calça, azul-aeronáutica, para orquestra'),
		('feminino', null, 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto',           'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('feminino', null, 'suboficiais', 'faixa-preta-de-cetim',                             'obrigatorio', 6,  null),
		('feminino', null, 'suboficiais', 'sapato-de-salto-alto',                             'obrigatorio', 7,  'preto'),
		('feminino', null, 'suboficiais', 'meia-calca-social-lisa',                           'obrigatorio', 8,  'cor da pele'),
		('feminino', null, 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('feminino', null, 'suboficiais', 'sobretudo-feminino-azul-aeronautica',              'facultativo', 11, 'azul-aeronáutica'),
		('feminino', null, 'suboficiais', 'cachecol-branco',                                  'facultativo', 12, null),
		('feminino', null, 'suboficiais', 'luva-preta-de-couro',                              'eventual',    13, null),
		('feminino', null, 'sargentos', 'jaqueta-feminina-azul-aeronautica-para-orquestra',   'obrigatorio', 0,  'azul-aeronáutica, para orquestra'),
		('feminino', null, 'sargentos', 'camisa-feminina-branca-de-mangas-compridas',         'obrigatorio', 1,  null),
		('feminino', null, 'sargentos', 'gravata-feminina-com-laco',                          'obrigatorio', 2,  'preta, com laço'),
		('feminino', null, 'sargentos', 'saia-azul-aeronautica-para-orquestra',               'obrigatorio', 3,  'saia ou calça, azul-aeronáutica, para orquestra'),
		('feminino', null, 'sargentos', 'calca-feminina-azul-aeronautica-para-orquestra',     'obrigatorio', 4,  'saia ou calça, azul-aeronáutica, para orquestra'),
		('feminino', null, 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto',             'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('feminino', null, 'sargentos', 'faixa-preta-de-cetim',                               'obrigatorio', 6,  null),
		('feminino', null, 'sargentos', 'sapato-de-salto-alto',                               'obrigatorio', 7,  'preto'),
		('feminino', null, 'sargentos', 'meia-calca-social-lisa',                             'obrigatorio', 8,  'cor da pele'),
		('feminino', null, 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('feminino', null, 'sargentos', 'sobretudo-feminino-azul-aeronautica',                'facultativo', 11, 'azul-aeronáutica'),
		('feminino', null, 'sargentos', 'cachecol-branco',                                    'facultativo', 12, null),
		('feminino', null, 'sargentos', 'luva-preta-de-couro',                                'eventual',    13, null),

		-- ===================== MASCULINO =====================
		('masculino', null, 'suboficiais', 'jaqueta-masculina-azul-aeronautica-para-orquestra','obrigatorio', 0,  'azul-aeronáutica, para orquestra'),
		('masculino', null, 'suboficiais', 'camisa-masculina-branca-de-mangas-compridas',     'obrigatorio', 1,  'branca'),
		('masculino', null, 'suboficiais', 'gravata-horizontal-azul-aeronautica-ou-preta',    'obrigatorio', 2,  'preta, horizontal'),
		('masculino', null, 'suboficiais', 'calca-masculina-azul-aeronautica-para-orquestra', 'obrigatorio', 3,  'para orquestra'),
		('masculino', null, 'suboficiais', 'faixa-preta-de-cetim',                            'obrigatorio', 4,  null),
		('masculino', null, 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto',          'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('masculino', null, 'suboficiais', 'sapato-masculino-preto-tipo-2',                   'obrigatorio', 6,  'preto'),
		('masculino', null, 'suboficiais', 'meia-preta-branca-de-nylon',                      'obrigatorio', 7,  'preta'),
		('masculino', null, 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', null, 'suboficiais', 'sobretudo-masculino-azul-aeronautica',            'facultativo', 11, 'azul-aeronáutica'),
		('masculino', null, 'suboficiais', 'cachecol-branco',                                 'facultativo', 12, null),
		('masculino', null, 'suboficiais', 'luva-preta-de-couro',                             'eventual',    13, null),
		('masculino', null, 'sargentos', 'jaqueta-masculina-azul-aeronautica-para-orquestra', 'obrigatorio', 0,  'azul-aeronáutica, para orquestra'),
		('masculino', null, 'sargentos', 'camisa-masculina-branca-de-mangas-compridas',       'obrigatorio', 1,  'branca'),
		('masculino', null, 'sargentos', 'gravata-horizontal-azul-aeronautica-ou-preta',      'obrigatorio', 2,  'preta, horizontal'),
		('masculino', null, 'sargentos', 'calca-masculina-azul-aeronautica-para-orquestra',   'obrigatorio', 3,  'para orquestra'),
		('masculino', null, 'sargentos', 'faixa-preta-de-cetim',                              'obrigatorio', 4,  null),
		('masculino', null, 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto',            'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('masculino', null, 'sargentos', 'sapato-masculino-preto-tipo-2',                     'obrigatorio', 6,  'preto'),
		('masculino', null, 'sargentos', 'meia-preta-branca-de-nylon',                        'obrigatorio', 7,  'preta'),
		('masculino', null, 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', null, 'sargentos', 'sobretudo-masculino-azul-aeronautica',              'facultativo', 11, 'azul-aeronáutica'),
		('masculino', null, 'sargentos', 'cachecol-branco',                                   'facultativo', 12, null),
		('masculino', null, 'sargentos', 'luva-preta-de-couro',                               'eventual',    13, null),
		('masculino', null, 'pracas', 'jaqueta-masculina-azul-aeronautica-para-orquestra',    'obrigatorio', 0,  'azul-aeronáutica, para orquestra'),
		('masculino', null, 'pracas', 'camisa-masculina-branca-de-mangas-compridas',          'obrigatorio', 1,  'branca'),
		('masculino', null, 'pracas', 'gravata-horizontal-azul-aeronautica-ou-preta',         'obrigatorio', 2,  'preta, horizontal'),
		('masculino', null, 'pracas', 'calca-masculina-azul-aeronautica-para-orquestra',      'obrigatorio', 3,  'para orquestra'),
		('masculino', null, 'pracas', 'faixa-preta-de-cetim',                                 'obrigatorio', 4,  null),
		('masculino', null, 'pracas', 'cinto-azul-aeronautica-branco-ou-preto',               'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('masculino', null, 'pracas', 'sapato-masculino-preto-tipo-2',                        'obrigatorio', 6,  'preto'),
		('masculino', null, 'pracas', 'meia-preta-branca-de-nylon',                           'obrigatorio', 7,  'preta'),
		('masculino', null, 'pracas', 'camisa-branca-flanelada-de-mangas-compridas-2-pele',   'facultativo', 10, '2ª pele branca'),
		('masculino', null, 'pracas', 'sobretudo-masculino-azul-aeronautica',                 'facultativo', 11, 'azul-aeronáutica'),
		('masculino', null, 'pracas', 'cachecol-branco',                                      'facultativo', 12, null),
		('masculino', null, 'pracas', 'luva-preta-de-couro',                                  'eventual',    13, null),

		-- ===================== MAESTRO =====================
		('masculino', 'maestro', 'oficiais', 'casaca-para-maestro',                           'obrigatorio', 0,  'branca'),
		('masculino', 'maestro', 'oficiais', 'colete-para-maestro',                           'obrigatorio', 1,  null),
		('masculino', 'maestro', 'oficiais', 'camisa-masculina-branca-de-mangas-compridas',   'obrigatorio', 2,  'branca'),
		('masculino', 'maestro', 'oficiais', 'gravata-horizontal-azul-aeronautica-ou-preta',  'obrigatorio', 3,  'preta, horizontal'),
		('masculino', 'maestro', 'oficiais', 'calca-masculina-azul-aeronautica-para-orquestra','obrigatorio', 4,  'para orquestra'),
		('masculino', 'maestro', 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto',        'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'maestro', 'oficiais', 'sapato-masculino-preto-tipo-2',                 'obrigatorio', 6,  'preto'),
		('masculino', 'maestro', 'oficiais', 'meia-preta-branca-de-nylon',                    'obrigatorio', 7,  'preta'),
		('masculino', 'maestro', 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', 'maestro', 'oficiais', 'sobretudo-masculino-azul-aeronautica',          'facultativo', 11, 'azul-aeronáutica'),
		('masculino', 'maestro', 'oficiais', 'cachecol-branco',                               'facultativo', 12, null),
		('masculino', 'maestro', 'oficiais', 'luva-preta-de-couro',                           'eventual',    13, null),
		('masculino', 'maestro', 'suboficiais', 'casaca-para-maestro',                        'obrigatorio', 0,  'branca'),
		('masculino', 'maestro', 'suboficiais', 'colete-para-maestro',                        'obrigatorio', 1,  null),
		('masculino', 'maestro', 'suboficiais', 'camisa-masculina-branca-de-mangas-compridas','obrigatorio', 2,  'branca'),
		('masculino', 'maestro', 'suboficiais', 'gravata-horizontal-azul-aeronautica-ou-preta','obrigatorio', 3,  'preta, horizontal'),
		('masculino', 'maestro', 'suboficiais', 'calca-masculina-azul-aeronautica-para-orquestra','obrigatorio', 4,  'para orquestra'),
		('masculino', 'maestro', 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto',     'obrigatorio', 5,  'azul-aeronáutica, com fivela prateada'),
		('masculino', 'maestro', 'suboficiais', 'sapato-masculino-preto-tipo-2',              'obrigatorio', 6,  'preto'),
		('masculino', 'maestro', 'suboficiais', 'meia-preta-branca-de-nylon',                 'obrigatorio', 7,  'preta'),
		('masculino', 'maestro', 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('masculino', 'maestro', 'suboficiais', 'sobretudo-masculino-azul-aeronautica',       'facultativo', 11, 'azul-aeronáutica'),
		('masculino', 'maestro', 'suboficiais', 'cachecol-branco',                            'facultativo', 12, null),
		('masculino', 'maestro', 'suboficiais', 'luva-preta-de-couro',                        'eventual',    13, null)
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from comp c
join rumaer.uniform u on u.numero = 4 and u.letra = 'B' and u.deleted_at is null
join rumaer.uniform_variant uv
	on uv.uniform_id = u.id
	and uv.circulo = c.circulo::rumaer.circulo_hierarquico
	and uv.genero = c.genero::rumaer.genero
	and uv.sub_variacao is not distinct from c.subvar
join rumaer.piece p on p.slug = c.slug and p.deleted_at is null
where not exists (
	select 1 from rumaer.uniform_variant_piece x where x.variant_id = uv.id and x.piece_id = p.id
);
