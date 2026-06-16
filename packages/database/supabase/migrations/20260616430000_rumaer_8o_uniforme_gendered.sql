-- Corrige o "8º Uniforme": o gorro (bibico) é gendered (FAB-V-055 feminino / FAB-V-057 masculino),
-- então o 8º NÃO é unissex. Reconstrói as variantes por gênero (feminino e masculino × 6 círculos),
-- usando o gorro gendered conforme o círculo (friso) e o gênero. Remove a peça genérica
-- 'gorro-azul-aeronautica' criada por engano. Demais peças (macacão/luva/meia-bota de voo) são compartilhadas.
do $$
declare
	u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero = 8 and letra is null and deleted_at is null limit 1;
	if u_id is null then
		raise exception '8º Uniforme não encontrado';
	end if;

	delete from rumaer.uniform_variant where uniform_id = u_id;

	insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
		(u_id, 'oficiais',    'feminino',  null, 0),
		(u_id, 'suboficiais', 'feminino',  null, 1),
		(u_id, 'cadetes',     'feminino',  null, 2),
		(u_id, 'sargentos',   'feminino',  null, 3),
		(u_id, 'alunos',      'feminino',  null, 4),
		(u_id, 'pracas',      'feminino',  null, 5),
		(u_id, 'oficiais',    'masculino', null, 6),
		(u_id, 'suboficiais', 'masculino', null, 7),
		(u_id, 'cadetes',     'masculino', null, 8),
		(u_id, 'sargentos',   'masculino', null, 9),
		(u_id, 'alunos',      'masculino', null, 10),
		(u_id, 'pracas',      'masculino', null, 11)
	on conflict (uniform_id, circulo, genero, sub_variacao) do nothing;
end $$;

with cg(circulo, genero) as (
	values
		('oficiais','feminino'),('suboficiais','feminino'),('cadetes','feminino'),
		('sargentos','feminino'),('alunos','feminino'),('pracas','feminino'),
		('oficiais','masculino'),('suboficiais','masculino'),('cadetes','masculino'),
		('sargentos','masculino'),('alunos','masculino'),('pracas','masculino')
),
pecas(slug, nivel, ordem, obs) as (
	values
		('macacao-verde-de-voo',                              'obrigatorio', 1,  'verde de voo'),
		('camiseta-branca',                                   'obrigatorio', 2,  'branca'),
		('luva-de-voo',                                       'obrigatorio', 3,  null),
		('meia-bota-de-voo',                                  'obrigatorio', 4,  'preta de voo'),
		('meia-preta-branca-de-cano-longo',                   'obrigatorio', 5,  'preta, cano longo'),
		('camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo', 10, '2ª pele branca'),
		('jaqueta-verde-de-voo',                              'facultativo', 11, 'verde de voo'),
		('capa-de-chuva-azul-aeronautica',                    'facultativo', 12, 'azul-aeronáutica'),
		('bone-operacional',                                  'eventual',    20, null),
		('cachecol-branco',                                   'eventual',    21, null),
		('porta-pistola-de-peitoral-preto',                   'eventual',    22, 'preto, de peitoral')
),
gorro(circulo, obs) as (
	values
		('oficiais',    'azul-aeronáutica, com friso prateado'),
		('cadetes',     'azul-aeronáutica, com friso prateado'),
		('alunos',      'azul-aeronáutica, com friso prateado (exceto EPCAR e CPORAER-SJ)'),
		('suboficiais', 'azul-aeronáutica, com friso azul-royal'),
		('sargentos',   'azul-aeronáutica'),
		('pracas',      'azul-aeronáutica')
),
comp(circulo, genero, slug, nivel, ordem, obs) as (
	select cg.circulo, cg.genero, p.slug, p.nivel, p.ordem, p.obs
	from cg cross join pecas p
	union all
	select cg.circulo, cg.genero,
		case cg.genero when 'feminino' then 'gorro-feminino-azul-aeronautica' else 'gorro-masculino-azul-aeronautica' end,
		'obrigatorio', 0, g.obs
	from cg join gorro g on g.circulo = cg.circulo
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from comp c
join rumaer.uniform u on u.numero = 8 and u.letra is null and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id = u.id
	and uv.circulo = c.circulo::rumaer.circulo_hierarquico
	and uv.genero = c.genero::rumaer.genero
join rumaer.piece p on p.slug = c.slug and p.deleted_at is null
where not exists (
	select 1 from rumaer.uniform_variant_piece x where x.variant_id = uv.id and x.piece_id = p.id
);

-- remove a peça genérica criada por engano (8º agora usa os gorros gendered)
update rumaer.piece set deleted_at = now(), updated_at = now()
where slug = 'gorro-azul-aeronautica' and deleted_at is null
  and not exists (
	select 1 from rumaer.uniform_variant_piece vp
	join rumaer.piece p2 on p2.id = vp.piece_id where p2.slug = 'gorro-azul-aeronautica'
  );
