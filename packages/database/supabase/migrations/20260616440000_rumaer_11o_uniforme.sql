-- Cria e preenche o "11º Uniforme" A/B/C (Art. 39 do RUMAER), instrução/manutenção/industrial — grupo servicos.
-- Gendered (o gorro/bibico varia fem/masc). Círculos: oficiais, suboficiais, sargentos, alunos (EEAR), praças.
-- Calçado obrigatório com 3 alternativas (sapato preto, meia-bota preta ou borzeguim) — todas obrigatórias com obs.
-- NÃO modelado neste passo: item g) (equipes de contra incêndio / EPI) — entra como sub_variacao depois.
-- Todas as peças já existem no catálogo. Idempotente.

-- ===================== 11º A =====================
do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=11 and letra='A' and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (11,'A','11º Uniforme A','servicos','operacional','instrução / manutenção','Art. 39',190,
			'11º Uniforme "A", para instrução e atividades manufatureiras, industriais, de manutenção e movimentação de carga.')
		returning id into u_id;
		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id,'oficiais'),(u_id,'suboficiais'),(u_id,'sargentos'),(u_id,'alunos_formacao'),(u_id,'pracas')
		on conflict do nothing;
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id,'oficiais','feminino',null,0),(u_id,'suboficiais','feminino',null,1),(u_id,'sargentos','feminino',null,2),
			(u_id,'alunos','feminino',null,3),(u_id,'pracas','feminino',null,4),
			(u_id,'oficiais','masculino',null,5),(u_id,'suboficiais','masculino',null,6),(u_id,'sargentos','masculino',null,7),
			(u_id,'alunos','masculino',null,8),(u_id,'pracas','masculino',null,9)
		on conflict do nothing;
	end if;
end $$;

with cg(circulo, genero) as (
	values ('oficiais','feminino'),('suboficiais','feminino'),('sargentos','feminino'),('alunos','feminino'),('pracas','feminino'),
		('oficiais','masculino'),('suboficiais','masculino'),('sargentos','masculino'),('alunos','masculino'),('pracas','masculino')
),
pecas(slug, nivel, ordem, obs) as (
	values
		('camiseta-branca','obrigatorio',1,'branca'),
		('calca-de-brim-azul-aeronautica','obrigatorio',2,'azul-aeronáutica'),
		('cinto-azul-aeronautica-branco-ou-preto','obrigatorio',3,'azul-aeronáutica, com fivela prateada'),
		('sapato-masculino-preto-tipo-2','obrigatorio',4,'preto (sapato, meia-bota ou borzeguim)'),
		('meia-bota-preta','obrigatorio',5,'preta (sapato, meia-bota ou borzeguim)'),
		('borzeguim-preto-acolchoado','obrigatorio',6,'preto (sapato, meia-bota ou borzeguim)'),
		('meia-preta-branca-de-nylon','obrigatorio',7,'preta'),
		('camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca'),
		('jaqueta-impermeavel-azul-aeronautica','facultativo',11,'azul-aeronáutica'),
		('capa-de-chuva-azul-aeronautica','facultativo',12,'azul-aeronáutica'),
		('blusao-azul-aeronautica','facultativo',13,'azul-aeronáutica'),
		('abrigo-impermeavel-amarelo','facultativo',14,'amarelo'),
		('luva-de-la-preta','facultativo',15,'preta'),
		('sapato-preto-soft-antiderrapante','eventual',20,'preto, tipo soft antiderrapante (estoque de rancho)')
),
gorro(circulo, obs) as (
	values ('oficiais','azul-aeronáutica, com friso prateado (dispensado em atividades técnicas)'),
		('suboficiais','azul-aeronáutica, com friso azul-royal (dispensado em atividades técnicas)'),
		('sargentos','azul-aeronáutica (dispensado em atividades técnicas)'),
		('alunos','azul-aeronáutica (dispensado em atividades técnicas)'),
		('pracas','azul-aeronáutica (dispensado em atividades técnicas)')
),
comp(circulo, genero, slug, nivel, ordem, obs) as (
	select cg.circulo, cg.genero, p.slug, p.nivel, p.ordem, p.obs from cg cross join pecas p
	union all
	select cg.circulo, cg.genero,
		case cg.genero when 'feminino' then 'gorro-feminino-azul-aeronautica' else 'gorro-masculino-azul-aeronautica' end,
		'obrigatorio',0,g.obs from cg join gorro g on g.circulo=cg.circulo
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from comp c
join rumaer.uniform u on u.numero=11 and u.letra='A' and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id and uv.circulo=c.circulo::rumaer.circulo_hierarquico and uv.genero=c.genero::rumaer.genero
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);

-- ===================== 11º B =====================
do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=11 and letra='B' and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (11,'B','11º Uniforme B','servicos','operacional','instrução / manutenção','Art. 39',200,
			'11º Uniforme "B", com macacão, para instrução e atividades de manutenção.')
		returning id into u_id;
		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id,'oficiais'),(u_id,'suboficiais'),(u_id,'sargentos'),(u_id,'alunos_formacao'),(u_id,'pracas')
		on conflict do nothing;
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id,'oficiais','feminino',null,0),(u_id,'suboficiais','feminino',null,1),(u_id,'sargentos','feminino',null,2),
			(u_id,'alunos','feminino',null,3),(u_id,'pracas','feminino',null,4),
			(u_id,'oficiais','masculino',null,5),(u_id,'suboficiais','masculino',null,6),(u_id,'sargentos','masculino',null,7),
			(u_id,'alunos','masculino',null,8),(u_id,'pracas','masculino',null,9)
		on conflict do nothing;
	end if;
end $$;

with cg(circulo, genero) as (
	values ('oficiais','feminino'),('suboficiais','feminino'),('sargentos','feminino'),('alunos','feminino'),('pracas','feminino'),
		('oficiais','masculino'),('suboficiais','masculino'),('sargentos','masculino'),('alunos','masculino'),('pracas','masculino')
),
pecas(slug, nivel, ordem, obs) as (
	values
		('camiseta-branca','obrigatorio',1,'branca'),
		('macacao-azul-aeronautica','obrigatorio',2,'azul-aeronáutica'),
		('sapato-masculino-preto-tipo-2','obrigatorio',3,'preto (sapato, meia-bota ou borzeguim)'),
		('meia-bota-preta','obrigatorio',4,'preta (sapato, meia-bota ou borzeguim)'),
		('borzeguim-preto-acolchoado','obrigatorio',5,'preto (sapato, meia-bota ou borzeguim)'),
		('meia-preta-branca-de-nylon','obrigatorio',6,'preta'),
		('camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca'),
		('jaqueta-impermeavel-azul-aeronautica','facultativo',11,'azul-aeronáutica'),
		('capa-de-chuva-azul-aeronautica','facultativo',12,'azul-aeronáutica'),
		('blusao-azul-aeronautica','facultativo',13,'azul-aeronáutica'),
		('abrigo-impermeavel-amarelo','facultativo',14,'amarelo'),
		('luva-de-la-preta','facultativo',15,'preta')
),
gorro(circulo, obs) as (
	values ('oficiais','azul-aeronáutica, com friso prateado (dispensado em atividades técnicas)'),
		('suboficiais','azul-aeronáutica, com friso azul-royal (dispensado em atividades técnicas)'),
		('sargentos','azul-aeronáutica (dispensado em atividades técnicas)'),
		('alunos','azul-aeronáutica (dispensado em atividades técnicas)'),
		('pracas','azul-aeronáutica (dispensado em atividades técnicas)')
),
comp(circulo, genero, slug, nivel, ordem, obs) as (
	select cg.circulo, cg.genero, p.slug, p.nivel, p.ordem, p.obs from cg cross join pecas p
	union all
	select cg.circulo, cg.genero,
		case cg.genero when 'feminino' then 'gorro-feminino-azul-aeronautica' else 'gorro-masculino-azul-aeronautica' end,
		'obrigatorio',0,g.obs from cg join gorro g on g.circulo=cg.circulo
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from comp c
join rumaer.uniform u on u.numero=11 and u.letra='B' and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id and uv.circulo=c.circulo::rumaer.circulo_hierarquico and uv.genero=c.genero::rumaer.genero
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);

-- ===================== 11º C =====================
do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=11 and letra='C' and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (11,'C','11º Uniforme C','servicos','operacional','instrução / manutenção','Art. 39',210,
			'11º Uniforme "C", com bermuda, para instrução e atividades de manutenção.')
		returning id into u_id;
		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id,'oficiais'),(u_id,'suboficiais'),(u_id,'sargentos'),(u_id,'alunos_formacao'),(u_id,'pracas')
		on conflict do nothing;
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id,'oficiais','feminino',null,0),(u_id,'suboficiais','feminino',null,1),(u_id,'sargentos','feminino',null,2),
			(u_id,'alunos','feminino',null,3),(u_id,'pracas','feminino',null,4),
			(u_id,'oficiais','masculino',null,5),(u_id,'suboficiais','masculino',null,6),(u_id,'sargentos','masculino',null,7),
			(u_id,'alunos','masculino',null,8),(u_id,'pracas','masculino',null,9)
		on conflict do nothing;
	end if;
end $$;

with cg(circulo, genero) as (
	values ('oficiais','feminino'),('suboficiais','feminino'),('sargentos','feminino'),('alunos','feminino'),('pracas','feminino'),
		('oficiais','masculino'),('suboficiais','masculino'),('sargentos','masculino'),('alunos','masculino'),('pracas','masculino')
),
pecas(slug, nivel, ordem, obs) as (
	values
		('camiseta-branca','obrigatorio',1,'branca'),
		('bermuda-de-brim-azul-aeronautica','obrigatorio',2,'azul-aeronáutica'),
		('cinto-azul-aeronautica-branco-ou-preto','obrigatorio',3,'azul-aeronáutica, com fivela prateada'),
		('tenis-branco-multiuso','obrigatorio',4,'branco'),
		('meia-branca-de-cano-medio','obrigatorio',5,'branca, cano médio'),
		('camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca'),
		('capa-de-chuva-azul-aeronautica','facultativo',11,'azul-aeronáutica'),
		('abrigo-impermeavel-amarelo','facultativo',12,'amarelo'),
		('luva-de-la-preta','facultativo',13,'preta')
),
gorro(circulo, obs) as (
	values ('oficiais','azul-aeronáutica, com friso prateado (dispensado em atividades técnicas)'),
		('suboficiais','azul-aeronáutica, com friso azul-royal (dispensado em atividades técnicas)'),
		('sargentos','azul-aeronáutica (dispensado em atividades técnicas)'),
		('alunos','azul-aeronáutica (dispensado em atividades técnicas)'),
		('pracas','azul-aeronáutica (dispensado em atividades técnicas)')
),
comp(circulo, genero, slug, nivel, ordem, obs) as (
	select cg.circulo, cg.genero, p.slug, p.nivel, p.ordem, p.obs from cg cross join pecas p
	union all
	select cg.circulo, cg.genero,
		case cg.genero when 'feminino' then 'gorro-feminino-azul-aeronautica' else 'gorro-masculino-azul-aeronautica' end,
		'obrigatorio',0,g.obs from cg join gorro g on g.circulo=cg.circulo
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from comp c
join rumaer.uniform u on u.numero=11 and u.letra='C' and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id and uv.circulo=c.circulo::rumaer.circulo_hierarquico and uv.genero=c.genero::rumaer.genero
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);
