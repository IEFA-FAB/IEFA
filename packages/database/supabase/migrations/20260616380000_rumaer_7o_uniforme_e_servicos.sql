-- Cria e preenche o "7º Uniforme E" (Art. 36 do RUMAER), serviços administrativos — grupo servicos.
-- Variantes: feminino e masculino (oficiais, suboficiais, cadetes, sargentos, alunos, praças). Sem gestante.
-- Gorro com friso prateado (oficiais/cadetes/alunos exc EPCAR/CPORAER-SJ), azul-royal (suboficiais),
-- liso (sargentos/praças). Calça azul-aeronáutica + camiseta branca + cinto + sapato + meia preta.
-- Praças = cabos e taifeiros (feminino) / cabos, soldados e taifeiros (masculino) → círculo 'pracas'.
-- Idempotente; casa variante por (círculo, gênero) e peça por slug.

do $$
declare
	u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero = 7 and letra = 'E' and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (7, 'E', '7º Uniforme E', 'servicos', 'servicos', 'serviços administrativos', 'Art. 36', 160,
			'7º Uniforme "E", utilizado para serviços administrativos.')
		returning id into u_id;

		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id, 'oficiais'), (u_id, 'cadetes'), (u_id, 'suboficiais'),
			(u_id, 'sargentos'), (u_id, 'alunos_formacao'), (u_id, 'pracas')
		on conflict (uniform_id, categoria) do nothing;

		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id, 'oficiais',    'feminino',  null, 0),
			(u_id, 'cadetes',     'feminino',  null, 1),
			(u_id, 'suboficiais', 'feminino',  null, 2),
			(u_id, 'sargentos',   'feminino',  null, 3),
			(u_id, 'alunos',      'feminino',  null, 4),
			(u_id, 'pracas',      'feminino',  null, 5),
			(u_id, 'oficiais',    'masculino', null, 6),
			(u_id, 'cadetes',     'masculino', null, 7),
			(u_id, 'suboficiais', 'masculino', null, 8),
			(u_id, 'sargentos',   'masculino', null, 9),
			(u_id, 'alunos',      'masculino', null, 10),
			(u_id, 'pracas',      'masculino', null, 11)
		on conflict (uniform_id, circulo, genero, sub_variacao) do nothing;
	end if;
end $$;

with comp(genero, circulo, slug, nivel, ordem, obs) as (
	values
		-- FEMININO
		('feminino', 'oficiais', 'gorro-feminino-azul-aeronautica', 'obrigatorio', 0, 'azul-aeronáutica, com friso prateado'),
		('feminino', 'oficiais', 'camiseta-branca',                 'obrigatorio', 1, 'branca'),
		('feminino', 'oficiais', 'calca-feminina-azul-aeronautica', 'obrigatorio', 2, 'azul-aeronáutica'),
		('feminino', 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto', 'obrigatorio', 3, 'azul-aeronáutica, com fivela prateada'),
		('feminino', 'oficiais', 'sapato-feminino-de-salto-medio-tipo-2', 'obrigatorio', 4, 'preto (salto médio ou baixo)'),
		('feminino', 'oficiais', 'meia-preta-branca-de-nylon',      'obrigatorio', 5, 'preta'),
		('feminino', 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('feminino', 'oficiais', 'capa-de-chuva-azul-aeronautica',  'facultativo', 11, 'azul-aeronáutica'),
		('feminino', 'oficiais', 'jaleco-azul-aeronautica-de-mangas-curtas', 'eventual', 20, 'azul-aeronáutica, mangas curtas'),
		('feminino', 'oficiais', 'jaleco-branco',                   'eventual', 21, 'branco'),
		('feminino', 'oficiais', 'cinturao-preto',                  'eventual', 22, 'preto'),
		('feminino', 'oficiais', 'porta-pistola-preto',             'eventual', 23, 'preto'),
		('feminino', 'cadetes', 'gorro-feminino-azul-aeronautica', 'obrigatorio', 0, 'azul-aeronáutica, com friso prateado'),
		('feminino', 'cadetes', 'camiseta-branca',                 'obrigatorio', 1, 'branca'),
		('feminino', 'cadetes', 'calca-feminina-azul-aeronautica', 'obrigatorio', 2, 'azul-aeronáutica'),
		('feminino', 'cadetes', 'cinto-azul-aeronautica-branco-ou-preto', 'obrigatorio', 3, 'azul-aeronáutica, com fivela prateada'),
		('feminino', 'cadetes', 'sapato-feminino-de-salto-medio-tipo-2', 'obrigatorio', 4, 'preto (salto médio ou baixo)'),
		('feminino', 'cadetes', 'meia-preta-branca-de-nylon',      'obrigatorio', 5, 'preta'),
		('feminino', 'cadetes', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('feminino', 'cadetes', 'capa-de-chuva-azul-aeronautica',  'facultativo', 11, 'azul-aeronáutica'),
		('feminino', 'cadetes', 'jaleco-azul-aeronautica-de-mangas-curtas', 'eventual', 20, 'azul-aeronáutica, mangas curtas'),
		('feminino', 'cadetes', 'jaleco-branco',                   'eventual', 21, 'branco'),
		('feminino', 'cadetes', 'cinturao-preto',                  'eventual', 22, 'preto'),
		('feminino', 'cadetes', 'porta-pistola-preto',             'eventual', 23, 'preto'),
		('feminino', 'suboficiais', 'gorro-feminino-azul-aeronautica', 'obrigatorio', 0, 'azul-aeronáutica, com friso azul-royal'),
		('feminino', 'suboficiais', 'camiseta-branca',                 'obrigatorio', 1, 'branca'),
		('feminino', 'suboficiais', 'calca-feminina-azul-aeronautica', 'obrigatorio', 2, 'azul-aeronáutica'),
		('feminino', 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto', 'obrigatorio', 3, 'azul-aeronáutica, com fivela prateada'),
		('feminino', 'suboficiais', 'sapato-feminino-de-salto-medio-tipo-2', 'obrigatorio', 4, 'preto (salto médio ou baixo)'),
		('feminino', 'suboficiais', 'meia-preta-branca-de-nylon',      'obrigatorio', 5, 'preta'),
		('feminino', 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('feminino', 'suboficiais', 'capa-de-chuva-azul-aeronautica',  'facultativo', 11, 'azul-aeronáutica'),
		('feminino', 'suboficiais', 'jaleco-azul-aeronautica-de-mangas-curtas', 'eventual', 20, 'azul-aeronáutica, mangas curtas'),
		('feminino', 'suboficiais', 'jaleco-branco',                   'eventual', 21, 'branco'),
		('feminino', 'suboficiais', 'cinturao-preto',                  'eventual', 22, 'preto'),
		('feminino', 'suboficiais', 'porta-pistola-preto',             'eventual', 23, 'preto'),
		('feminino', 'sargentos', 'gorro-feminino-azul-aeronautica', 'obrigatorio', 0, 'azul-aeronáutica'),
		('feminino', 'sargentos', 'camiseta-branca',                 'obrigatorio', 1, 'branca'),
		('feminino', 'sargentos', 'calca-feminina-azul-aeronautica', 'obrigatorio', 2, 'azul-aeronáutica'),
		('feminino', 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto', 'obrigatorio', 3, 'azul-aeronáutica, com fivela prateada'),
		('feminino', 'sargentos', 'sapato-feminino-de-salto-medio-tipo-2', 'obrigatorio', 4, 'preto (salto médio ou baixo)'),
		('feminino', 'sargentos', 'meia-preta-branca-de-nylon',      'obrigatorio', 5, 'preta'),
		('feminino', 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('feminino', 'sargentos', 'capa-de-chuva-azul-aeronautica',  'facultativo', 11, 'azul-aeronáutica'),
		('feminino', 'sargentos', 'jaleco-azul-aeronautica-de-mangas-curtas', 'eventual', 20, 'azul-aeronáutica, mangas curtas'),
		('feminino', 'sargentos', 'jaleco-branco',                   'eventual', 21, 'branco'),
		('feminino', 'sargentos', 'cinturao-preto',                  'eventual', 22, 'preto'),
		('feminino', 'sargentos', 'porta-pistola-preto',             'eventual', 23, 'preto'),
		('feminino', 'alunos', 'gorro-feminino-azul-aeronautica', 'obrigatorio', 0, 'azul-aeronáutica, com friso prateado (exceto alunas da EPCAR e do CPORAER-SJ)'),
		('feminino', 'alunos', 'camiseta-branca',                 'obrigatorio', 1, 'branca'),
		('feminino', 'alunos', 'calca-feminina-azul-aeronautica', 'obrigatorio', 2, 'azul-aeronáutica'),
		('feminino', 'alunos', 'cinto-azul-aeronautica-branco-ou-preto', 'obrigatorio', 3, 'azul-aeronáutica, com fivela prateada'),
		('feminino', 'alunos', 'sapato-feminino-de-salto-medio-tipo-2', 'obrigatorio', 4, 'preto (salto médio ou baixo)'),
		('feminino', 'alunos', 'meia-preta-branca-de-nylon',      'obrigatorio', 5, 'preta'),
		('feminino', 'alunos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('feminino', 'alunos', 'capa-de-chuva-azul-aeronautica',  'facultativo', 11, 'azul-aeronáutica'),
		('feminino', 'alunos', 'jaleco-azul-aeronautica-de-mangas-curtas', 'eventual', 20, 'azul-aeronáutica, mangas curtas'),
		('feminino', 'alunos', 'jaleco-branco',                   'eventual', 21, 'branco'),
		('feminino', 'alunos', 'cinturao-preto',                  'eventual', 22, 'preto'),
		('feminino', 'alunos', 'porta-pistola-preto',             'eventual', 23, 'preto'),
		('feminino', 'pracas', 'gorro-feminino-azul-aeronautica', 'obrigatorio', 0, 'azul-aeronáutica'),
		('feminino', 'pracas', 'camiseta-branca',                 'obrigatorio', 1, 'branca'),
		('feminino', 'pracas', 'calca-feminina-azul-aeronautica', 'obrigatorio', 2, 'azul-aeronáutica'),
		('feminino', 'pracas', 'cinto-azul-aeronautica-branco-ou-preto', 'obrigatorio', 3, 'azul-aeronáutica, com fivela prateada'),
		('feminino', 'pracas', 'sapato-feminino-de-salto-medio-tipo-2', 'obrigatorio', 4, 'preto (salto médio ou baixo)'),
		('feminino', 'pracas', 'meia-preta-branca-de-nylon',      'obrigatorio', 5, 'preta'),
		('feminino', 'pracas', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('feminino', 'pracas', 'capa-de-chuva-azul-aeronautica',  'facultativo', 11, 'azul-aeronáutica'),
		('feminino', 'pracas', 'jaleco-azul-aeronautica-de-mangas-curtas', 'eventual', 20, 'azul-aeronáutica, mangas curtas'),
		('feminino', 'pracas', 'jaleco-branco',                   'eventual', 21, 'branco'),
		('feminino', 'pracas', 'cinturao-preto',                  'eventual', 22, 'preto'),
		('feminino', 'pracas', 'porta-pistola-preto',             'eventual', 23, 'preto'),
		-- MASCULINO
		('masculino', 'oficiais', 'gorro-masculino-azul-aeronautica', 'obrigatorio', 0, 'azul-aeronáutica, com friso prateado'),
		('masculino', 'oficiais', 'camiseta-branca',                  'obrigatorio', 1, 'branca'),
		('masculino', 'oficiais', 'calca-masculina-azul-aeronautica', 'obrigatorio', 2, 'azul-aeronáutica'),
		('masculino', 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto', 'obrigatorio', 3, 'azul-aeronáutica, com fivela prateada'),
		('masculino', 'oficiais', 'sapato-masculino-preto-tipo-2',    'obrigatorio', 4, 'preto'),
		('masculino', 'oficiais', 'meia-preta-branca-de-nylon',       'obrigatorio', 5, 'preta'),
		('masculino', 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('masculino', 'oficiais', 'capa-de-chuva-azul-aeronautica',   'facultativo', 11, 'azul-aeronáutica'),
		('masculino', 'oficiais', 'jaleco-azul-aeronautica-de-mangas-curtas', 'eventual', 20, 'azul-aeronáutica, mangas curtas'),
		('masculino', 'oficiais', 'jaleco-branco',                    'eventual', 21, 'branco'),
		('masculino', 'oficiais', 'cinturao-preto',                   'eventual', 22, 'preto'),
		('masculino', 'oficiais', 'porta-pistola-preto',              'eventual', 23, 'preto'),
		('masculino', 'cadetes', 'gorro-masculino-azul-aeronautica', 'obrigatorio', 0, 'azul-aeronáutica, com friso prateado'),
		('masculino', 'cadetes', 'camiseta-branca',                  'obrigatorio', 1, 'branca'),
		('masculino', 'cadetes', 'calca-masculina-azul-aeronautica', 'obrigatorio', 2, 'azul-aeronáutica'),
		('masculino', 'cadetes', 'cinto-azul-aeronautica-branco-ou-preto', 'obrigatorio', 3, 'azul-aeronáutica, com fivela prateada'),
		('masculino', 'cadetes', 'sapato-masculino-preto-tipo-2',    'obrigatorio', 4, 'preto'),
		('masculino', 'cadetes', 'meia-preta-branca-de-nylon',       'obrigatorio', 5, 'preta'),
		('masculino', 'cadetes', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('masculino', 'cadetes', 'capa-de-chuva-azul-aeronautica',   'facultativo', 11, 'azul-aeronáutica'),
		('masculino', 'cadetes', 'jaleco-azul-aeronautica-de-mangas-curtas', 'eventual', 20, 'azul-aeronáutica, mangas curtas'),
		('masculino', 'cadetes', 'jaleco-branco',                    'eventual', 21, 'branco'),
		('masculino', 'cadetes', 'cinturao-preto',                   'eventual', 22, 'preto'),
		('masculino', 'cadetes', 'porta-pistola-preto',              'eventual', 23, 'preto'),
		('masculino', 'suboficiais', 'gorro-masculino-azul-aeronautica', 'obrigatorio', 0, 'azul-aeronáutica, com friso azul-royal'),
		('masculino', 'suboficiais', 'camiseta-branca',                  'obrigatorio', 1, 'branca'),
		('masculino', 'suboficiais', 'calca-masculina-azul-aeronautica', 'obrigatorio', 2, 'azul-aeronáutica'),
		('masculino', 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto', 'obrigatorio', 3, 'azul-aeronáutica, com fivela prateada'),
		('masculino', 'suboficiais', 'sapato-masculino-preto-tipo-2',    'obrigatorio', 4, 'preto'),
		('masculino', 'suboficiais', 'meia-preta-branca-de-nylon',       'obrigatorio', 5, 'preta'),
		('masculino', 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('masculino', 'suboficiais', 'capa-de-chuva-azul-aeronautica',   'facultativo', 11, 'azul-aeronáutica'),
		('masculino', 'suboficiais', 'jaleco-azul-aeronautica-de-mangas-curtas', 'eventual', 20, 'azul-aeronáutica, mangas curtas'),
		('masculino', 'suboficiais', 'jaleco-branco',                    'eventual', 21, 'branco'),
		('masculino', 'suboficiais', 'cinturao-preto',                   'eventual', 22, 'preto'),
		('masculino', 'suboficiais', 'porta-pistola-preto',              'eventual', 23, 'preto'),
		('masculino', 'sargentos', 'gorro-masculino-azul-aeronautica', 'obrigatorio', 0, 'azul-aeronáutica'),
		('masculino', 'sargentos', 'camiseta-branca',                  'obrigatorio', 1, 'branca'),
		('masculino', 'sargentos', 'calca-masculina-azul-aeronautica', 'obrigatorio', 2, 'azul-aeronáutica'),
		('masculino', 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto', 'obrigatorio', 3, 'azul-aeronáutica, com fivela prateada'),
		('masculino', 'sargentos', 'sapato-masculino-preto-tipo-2',    'obrigatorio', 4, 'preto'),
		('masculino', 'sargentos', 'meia-preta-branca-de-nylon',       'obrigatorio', 5, 'preta'),
		('masculino', 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('masculino', 'sargentos', 'capa-de-chuva-azul-aeronautica',   'facultativo', 11, 'azul-aeronáutica'),
		('masculino', 'sargentos', 'jaleco-azul-aeronautica-de-mangas-curtas', 'eventual', 20, 'azul-aeronáutica, mangas curtas'),
		('masculino', 'sargentos', 'jaleco-branco',                    'eventual', 21, 'branco'),
		('masculino', 'sargentos', 'cinturao-preto',                   'eventual', 22, 'preto'),
		('masculino', 'sargentos', 'porta-pistola-preto',              'eventual', 23, 'preto'),
		('masculino', 'alunos', 'gorro-masculino-azul-aeronautica', 'obrigatorio', 0, 'azul-aeronáutica, com friso prateado (exceto alunos da EPCAR e do CPORAER-SJ)'),
		('masculino', 'alunos', 'camiseta-branca',                  'obrigatorio', 1, 'branca'),
		('masculino', 'alunos', 'calca-masculina-azul-aeronautica', 'obrigatorio', 2, 'azul-aeronáutica'),
		('masculino', 'alunos', 'cinto-azul-aeronautica-branco-ou-preto', 'obrigatorio', 3, 'azul-aeronáutica, com fivela prateada'),
		('masculino', 'alunos', 'sapato-masculino-preto-tipo-2',    'obrigatorio', 4, 'preto'),
		('masculino', 'alunos', 'meia-preta-branca-de-nylon',       'obrigatorio', 5, 'preta'),
		('masculino', 'alunos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('masculino', 'alunos', 'capa-de-chuva-azul-aeronautica',   'facultativo', 11, 'azul-aeronáutica'),
		('masculino', 'alunos', 'jaleco-azul-aeronautica-de-mangas-curtas', 'eventual', 20, 'azul-aeronáutica, mangas curtas'),
		('masculino', 'alunos', 'jaleco-branco',                    'eventual', 21, 'branco'),
		('masculino', 'alunos', 'cinturao-preto',                   'eventual', 22, 'preto'),
		('masculino', 'alunos', 'porta-pistola-preto',              'eventual', 23, 'preto'),
		('masculino', 'pracas', 'gorro-masculino-azul-aeronautica', 'obrigatorio', 0, 'azul-aeronáutica'),
		('masculino', 'pracas', 'camiseta-branca',                  'obrigatorio', 1, 'branca'),
		('masculino', 'pracas', 'calca-masculina-azul-aeronautica', 'obrigatorio', 2, 'azul-aeronáutica'),
		('masculino', 'pracas', 'cinto-azul-aeronautica-branco-ou-preto', 'obrigatorio', 3, 'azul-aeronáutica, com fivela prateada'),
		('masculino', 'pracas', 'sapato-masculino-preto-tipo-2',    'obrigatorio', 4, 'preto'),
		('masculino', 'pracas', 'meia-preta-branca-de-nylon',       'obrigatorio', 5, 'preta'),
		('masculino', 'pracas', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('masculino', 'pracas', 'capa-de-chuva-azul-aeronautica',   'facultativo', 11, 'azul-aeronáutica'),
		('masculino', 'pracas', 'jaleco-azul-aeronautica-de-mangas-curtas', 'eventual', 20, 'azul-aeronáutica, mangas curtas'),
		('masculino', 'pracas', 'jaleco-branco',                    'eventual', 21, 'branco'),
		('masculino', 'pracas', 'cinturao-preto',                   'eventual', 22, 'preto'),
		('masculino', 'pracas', 'porta-pistola-preto',              'eventual', 23, 'preto')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from comp c
join rumaer.uniform u on u.numero = 7 and u.letra = 'E' and u.deleted_at is null
join rumaer.uniform_variant uv
	on uv.uniform_id = u.id
	and uv.circulo = c.circulo::rumaer.circulo_hierarquico
	and uv.genero = c.genero::rumaer.genero
join rumaer.piece p on p.slug = c.slug and p.deleted_at is null
where not exists (
	select 1 from rumaer.uniform_variant_piece x where x.variant_id = uv.id and x.piece_id = p.id
);
