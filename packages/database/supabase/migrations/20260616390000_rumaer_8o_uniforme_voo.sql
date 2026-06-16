-- Cria e preenche o "8º Uniforme" (Art. 37 do RUMAER), atividades aéreas (voo) — grupo servicos.
-- Uniforme UNISSEX: uma variante por círculo (genero='unissex') — oficiais, suboficiais, cadetes,
-- sargentos, alunos, praças (cabos, soldados, taifeiros). Só o gorro varia por círculo (friso).
-- Peças novas: gorro azul-aeronáutica (unissex), macacão verde de voo, meia preta de cano longo, boné operacional.
-- Idempotente; casa variante por (círculo, gênero) e peça por slug.

insert into rumaer.piece (codigo, nome, slug, tipo) values
	(null, 'gorro azul-aeronáutica',     'gorro-azul-aeronautica',     'cabeca'),
	(null, 'macacão verde de voo',       'macacao-verde-de-voo',       'torso'),
	(null, 'meia preta de cano longo',   'meia-preta-de-cano-longo',   'acessorio'),
	(null, 'boné operacional',           'bone-operacional',           'cabeca')
on conflict (slug) do update set
	nome = excluded.nome, tipo = coalesce(excluded.tipo, rumaer.piece.tipo), deleted_at = null, updated_at = now();

do $$
declare
	u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero = 8 and letra is null and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (8, null, '8º Uniforme', 'servicos', 'operacional', 'atividades aéreas', 'Art. 37', 170,
			'8º Uniforme, utilizado exclusivamente no desempenho das atividades aéreas.')
		returning id into u_id;

		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id, 'oficiais'), (u_id, 'cadetes'), (u_id, 'suboficiais'),
			(u_id, 'sargentos'), (u_id, 'alunos_formacao'), (u_id, 'pracas')
		on conflict (uniform_id, categoria) do nothing;

		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id, 'oficiais',    'unissex', null, 0),
			(u_id, 'suboficiais', 'unissex', null, 1),
			(u_id, 'cadetes',     'unissex', null, 2),
			(u_id, 'sargentos',   'unissex', null, 3),
			(u_id, 'alunos',      'unissex', null, 4),
			(u_id, 'pracas',      'unissex', null, 5)
		on conflict (uniform_id, circulo, genero, sub_variacao) do nothing;
	end if;
end $$;

-- composição comum (igual em todos os círculos) via cross join
with circ(circulo) as (
	values ('oficiais'),('suboficiais'),('cadetes'),('sargentos'),('alunos'),('pracas')
),
pecas(slug, nivel, ordem, obs) as (
	values
		('macacao-verde-de-voo',                              'obrigatorio', 1,  'verde de voo'),
		('camiseta-branca',                                   'obrigatorio', 2,  'branca'),
		('luva-de-voo',                                       'obrigatorio', 3,  null),
		('meia-bota-de-voo',                                  'obrigatorio', 4,  'preta de voo'),
		('meia-preta-de-cano-longo',                          'obrigatorio', 5,  'preta, cano longo'),
		('camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('jaqueta-verde-de-voo',                              'facultativo', 11, 'verde de voo'),
		('capa-de-chuva-azul-aeronautica',                    'facultativo', 12, 'azul-aeronáutica'),
		('bone-operacional',                                  'eventual',    20, null),
		('cachecol-branco',                                   'eventual',    21, null),
		('porta-pistola-de-peitoral-preto',                   'eventual',    22, 'preto, de peitoral')
),
-- gorro varia por círculo (friso)
gorro(circulo, obs) as (
	values
		('oficiais',    'azul-aeronáutica, com friso prateado'),
		('cadetes',     'azul-aeronáutica, com friso prateado'),
		('alunos',      'azul-aeronáutica, com friso prateado (exceto EPCAR e CPORAER-SJ)'),
		('suboficiais', 'azul-aeronáutica, com friso azul-royal'),
		('sargentos',   'azul-aeronáutica'),
		('pracas',      'azul-aeronáutica')
),
comp(circulo, slug, nivel, ordem, obs) as (
	select c.circulo, p.slug, p.nivel, p.ordem, p.obs from circ c cross join pecas p
	union all
	select g.circulo, 'gorro-azul-aeronautica', 'obrigatorio', 0, g.obs from gorro g
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from comp c
join rumaer.uniform u on u.numero = 8 and u.letra is null and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id = u.id
	and uv.circulo = c.circulo::rumaer.circulo_hierarquico and uv.genero = 'unissex'
join rumaer.piece p on p.slug = c.slug and p.deleted_at is null
where not exists (
	select 1 from rumaer.uniform_variant_piece x where x.variant_id = uv.id and x.piece_id = p.id
);
