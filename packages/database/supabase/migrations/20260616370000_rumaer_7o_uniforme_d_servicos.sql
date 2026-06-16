-- Cria e preenche o "7º Uniforme D" (Art. 35 do RUMAER), serviços administrativos — grupo servicos.
-- Variantes: feminino e masculino (oficiais, suboficiais, sargentos). Sem gestante, sem uso eventual.
-- Gorro com friso prateado (oficiais) / azul-royal (suboficiais) / liso (sargentos).
-- Peça nova: meia branca de cano médio. Bermuda usa a peça genérica azul-aeronáutica (obs por gênero).
-- Idempotente; casa variante por (círculo, gênero) e peça por slug.

insert into rumaer.piece (codigo, nome, slug, tipo) values
	(null, 'meia branca de cano médio', 'meia-branca-de-cano-medio', 'acessorio')
on conflict (slug) do update set
	nome = excluded.nome, tipo = coalesce(excluded.tipo, rumaer.piece.tipo), deleted_at = null, updated_at = now();

do $$
declare
	u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero = 7 and letra = 'D' and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (7, 'D', '7º Uniforme D', 'servicos', 'servicos', 'serviços administrativos', 'Art. 35', 150,
			'7º Uniforme "D", utilizado para serviços administrativos.')
		returning id into u_id;

		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id, 'oficiais'), (u_id, 'suboficiais'), (u_id, 'sargentos')
		on conflict (uniform_id, categoria) do nothing;

		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id, 'oficiais',    'feminino',  null, 0),
			(u_id, 'suboficiais', 'feminino',  null, 1),
			(u_id, 'sargentos',   'feminino',  null, 2),
			(u_id, 'oficiais',    'masculino', null, 3),
			(u_id, 'suboficiais', 'masculino', null, 4),
			(u_id, 'sargentos',   'masculino', null, 5)
		on conflict (uniform_id, circulo, genero, sub_variacao) do nothing;
	end if;
end $$;

with comp(genero, circulo, slug, nivel, ordem, obs) as (
	values
		-- FEMININO
		('feminino', 'oficiais', 'gorro-feminino-azul-aeronautica', 'obrigatorio', 0, 'azul-aeronáutica, com friso prateado'),
		('feminino', 'oficiais', 'camiseta-branca',                 'obrigatorio', 1, 'branca'),
		('feminino', 'oficiais', 'bermuda-azul-aeronautica',        'obrigatorio', 2, 'feminina, azul-aeronáutica'),
		('feminino', 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto', 'obrigatorio', 3, 'azul-aeronáutica, com fivela prateada'),
		('feminino', 'oficiais', 'tenis-branco-multiuso',           'obrigatorio', 4, 'branco'),
		('feminino', 'oficiais', 'meia-branca-de-cano-medio',       'obrigatorio', 5, 'branca, cano médio'),
		('feminino', 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('feminino', 'oficiais', 'capa-de-chuva-azul-aeronautica',  'facultativo', 11, 'azul-aeronáutica'),
		('feminino', 'suboficiais', 'gorro-feminino-azul-aeronautica', 'obrigatorio', 0, 'azul-aeronáutica, com friso azul-royal'),
		('feminino', 'suboficiais', 'camiseta-branca',                 'obrigatorio', 1, 'branca'),
		('feminino', 'suboficiais', 'bermuda-azul-aeronautica',        'obrigatorio', 2, 'feminina, azul-aeronáutica'),
		('feminino', 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto', 'obrigatorio', 3, 'azul-aeronáutica, com fivela prateada'),
		('feminino', 'suboficiais', 'tenis-branco-multiuso',           'obrigatorio', 4, 'branco'),
		('feminino', 'suboficiais', 'meia-branca-de-cano-medio',       'obrigatorio', 5, 'branca, cano médio'),
		('feminino', 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('feminino', 'suboficiais', 'capa-de-chuva-azul-aeronautica',  'facultativo', 11, 'azul-aeronáutica'),
		('feminino', 'sargentos', 'gorro-feminino-azul-aeronautica', 'obrigatorio', 0, 'azul-aeronáutica'),
		('feminino', 'sargentos', 'camiseta-branca',                 'obrigatorio', 1, 'branca'),
		('feminino', 'sargentos', 'bermuda-azul-aeronautica',        'obrigatorio', 2, 'feminina, azul-aeronáutica'),
		('feminino', 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto', 'obrigatorio', 3, 'azul-aeronáutica, com fivela prateada'),
		('feminino', 'sargentos', 'tenis-branco-multiuso',           'obrigatorio', 4, 'branco'),
		('feminino', 'sargentos', 'meia-branca-de-cano-medio',       'obrigatorio', 5, 'branca, cano médio'),
		('feminino', 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('feminino', 'sargentos', 'capa-de-chuva-azul-aeronautica',  'facultativo', 11, 'azul-aeronáutica'),
		-- MASCULINO
		('masculino', 'oficiais', 'gorro-masculino-azul-aeronautica', 'obrigatorio', 0, 'azul-aeronáutica, com friso prateado'),
		('masculino', 'oficiais', 'camiseta-branca',                  'obrigatorio', 1, 'branca'),
		('masculino', 'oficiais', 'bermuda-azul-aeronautica',         'obrigatorio', 2, 'masculina, azul-aeronáutica'),
		('masculino', 'oficiais', 'cinto-azul-aeronautica-branco-ou-preto', 'obrigatorio', 3, 'azul-aeronáutica, com fivela prateada'),
		('masculino', 'oficiais', 'tenis-branco-multiuso',            'obrigatorio', 4, 'branco'),
		('masculino', 'oficiais', 'meia-branca-de-cano-medio',        'obrigatorio', 5, 'branca, cano médio'),
		('masculino', 'oficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('masculino', 'oficiais', 'capa-de-chuva-azul-aeronautica',   'facultativo', 11, 'azul-aeronáutica'),
		('masculino', 'suboficiais', 'gorro-masculino-azul-aeronautica', 'obrigatorio', 0, 'azul-aeronáutica, com friso azul-royal'),
		('masculino', 'suboficiais', 'camiseta-branca',                  'obrigatorio', 1, 'branca'),
		('masculino', 'suboficiais', 'bermuda-azul-aeronautica',         'obrigatorio', 2, 'masculina, azul-aeronáutica'),
		('masculino', 'suboficiais', 'cinto-azul-aeronautica-branco-ou-preto', 'obrigatorio', 3, 'azul-aeronáutica, com fivela prateada'),
		('masculino', 'suboficiais', 'tenis-branco-multiuso',            'obrigatorio', 4, 'branco'),
		('masculino', 'suboficiais', 'meia-branca-de-cano-medio',        'obrigatorio', 5, 'branca, cano médio'),
		('masculino', 'suboficiais', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('masculino', 'suboficiais', 'capa-de-chuva-azul-aeronautica',   'facultativo', 11, 'azul-aeronáutica'),
		('masculino', 'sargentos', 'gorro-masculino-azul-aeronautica', 'obrigatorio', 0, 'azul-aeronáutica'),
		('masculino', 'sargentos', 'camiseta-branca',                  'obrigatorio', 1, 'branca'),
		('masculino', 'sargentos', 'bermuda-azul-aeronautica',         'obrigatorio', 2, 'masculina, azul-aeronáutica'),
		('masculino', 'sargentos', 'cinto-azul-aeronautica-branco-ou-preto', 'obrigatorio', 3, 'azul-aeronáutica, com fivela prateada'),
		('masculino', 'sargentos', 'tenis-branco-multiuso',            'obrigatorio', 4, 'branco'),
		('masculino', 'sargentos', 'meia-branca-de-cano-medio',        'obrigatorio', 5, 'branca, cano médio'),
		('masculino', 'sargentos', 'camisa-branca-flanelada-de-mangas-compridas-2-pele', 'facultativo', 10, '2ª pele branca'),
		('masculino', 'sargentos', 'capa-de-chuva-azul-aeronautica',   'facultativo', 11, 'azul-aeronáutica')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from comp c
join rumaer.uniform u on u.numero = 7 and u.letra = 'D' and u.deleted_at is null
join rumaer.uniform_variant uv
	on uv.uniform_id = u.id
	and uv.circulo = c.circulo::rumaer.circulo_hierarquico
	and uv.genero = c.genero::rumaer.genero
join rumaer.piece p on p.slug = c.slug and p.deleted_at is null
where not exists (
	select 1 from rumaer.uniform_variant_piece x where x.variant_id = uv.id and x.piece_id = p.id
);
