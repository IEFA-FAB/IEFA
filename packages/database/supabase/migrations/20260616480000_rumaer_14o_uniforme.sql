-- Cria e preenche o "14º Uniforme" A/B/C (Arts. 48-50 do RUMAER) — grupo servicos.
--   A (hotelaria): gendered; funções (governança/recepção/arrumação) como alternativas na observação.
--   B (condução de viaturas): gendered; blazer/paletó com gládio alado bordado.
--   C (barbearia): unissex (composição masculina — gorro/calça/sapato masculinos).
-- Categorias: suboficiais, sargentos, praças (cabos/soldados/taifeiros). Gorro friso azul-royal p/ suboficiais.
-- Peças novas: 6 camisas polo de hotelaria (azul-aeronáutica/azul-clara/cinza × fem/masc).

insert into rumaer.piece (codigo, nome, slug, tipo) values
	(null, 'camisa polo feminina azul-aeronáutica',  'camisa-polo-feminina-azul-aeronautica',  'torso'),
	(null, 'camisa polo feminina azul-clara',        'camisa-polo-feminina-azul-clara',        'torso'),
	(null, 'camisa polo feminina cinza',             'camisa-polo-feminina-cinza',             'torso'),
	(null, 'camisa polo masculina azul-aeronáutica', 'camisa-polo-masculina-azul-aeronautica', 'torso'),
	(null, 'camisa polo masculina azul-clara',       'camisa-polo-masculina-azul-clara',       'torso'),
	(null, 'camisa polo masculina cinza',            'camisa-polo-masculina-cinza',            'torso')
on conflict (slug) do update set
	nome = excluded.nome, tipo = coalesce(excluded.tipo, rumaer.piece.tipo), deleted_at = null, updated_at = now();

-- ===================== 14º A (hotelaria) =====================
do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=14 and letra='A' and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (14,'A','14º Uniforme A','servicos','hotelaria','hotelaria','Art. 48',270,
			'14º Uniforme "A", atividades de hotelaria (governança, recepção, arrumação e serviços gerais).')
		returning id into u_id;
		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id,'suboficiais'),(u_id,'sargentos'),(u_id,'pracas') on conflict do nothing;
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id,'suboficiais','feminino',null,0),(u_id,'sargentos','feminino',null,1),(u_id,'pracas','feminino',null,2),
			(u_id,'suboficiais','masculino',null,3),(u_id,'sargentos','masculino',null,4),(u_id,'pracas','masculino',null,5)
		on conflict do nothing;
	end if;
end $$;

with cg(circulo, genero) as (
	values ('suboficiais','feminino'),('sargentos','feminino'),('pracas','feminino'),
		('suboficiais','masculino'),('sargentos','masculino'),('pracas','masculino')
),
pecas(genero, slug, nivel, ordem, obs) as (
	values
		-- feminino
		('feminino','camisa-polo-feminina-azul-aeronautica','obrigatorio',1,'governança'),
		('feminino','camisa-polo-feminina-azul-clara','obrigatorio',2,'recepção'),
		('feminino','camisa-polo-feminina-cinza','obrigatorio',3,'arrumação e serviços gerais'),
		('feminino','saia-azul-aeronautica','obrigatorio',4,'governança/recepção (saia ou calça)'),
		('feminino','calca-feminina-azul-aeronautica','obrigatorio',5,'governança/recepção (saia ou calça)'),
		('feminino','calca-de-brim-azul-aeronautica','obrigatorio',6,'arrumação e serviços gerais'),
		('feminino','cinto-azul-aeronautica-branco-ou-preto','obrigatorio',7,'azul-aeronáutica, com fivela prateada'),
		('feminino','sapato-feminino-de-salto-medio-tipo-2','obrigatorio',8,'preto, salto médio ou baixo (governança/recepção)'),
		('feminino','borzeguim-preto-acolchoado','obrigatorio',9,'preto (arrumação e serviços gerais)'),
		('feminino','meia-calca-social-lisa','obrigatorio',10,'cor da pele (com saia)'),
		('feminino','meia-preta-branca-de-nylon','obrigatorio',11,'social preta (com calça)'),
		('feminino','meia-preta-branca-de-cano-longo','obrigatorio',12,'preta, cano longo (arrumação)'),
		('feminino','camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',20,'2ª pele branca'),
		('feminino','colete-azul-aeronautica-com-gola-em-v','facultativo',21,'gola em "V"'),
		('feminino','pulover-azul-aeronautica','facultativo',22,'azul-aeronáutica'),
		('feminino','jaqueta-feminina-azul-aeronautica-com-forro-removivel','facultativo',23,'azul-aeronáutica'),
		('feminino','jaqueta-impermeavel-azul-aeronautica','facultativo',24,'azul-aeronáutica (arrumação e serviços gerais)'),
		('feminino','capa-de-chuva-azul-aeronautica','facultativo',25,'azul-aeronáutica'),
		('feminino','japona-azul-aeronautica','facultativo',26,'azul-aeronáutica'),
		('feminino','cachecol-branco','facultativo',27,null),
		('feminino','luva-de-la-preta','facultativo',28,'preta'),
		-- masculino
		('masculino','camisa-polo-masculina-azul-aeronautica','obrigatorio',1,'governança'),
		('masculino','camisa-polo-masculina-azul-clara','obrigatorio',2,'recepção'),
		('masculino','camisa-polo-masculina-cinza','obrigatorio',3,'arrumação e serviços gerais'),
		('masculino','calca-masculina-azul-aeronautica','obrigatorio',5,'governança/recepção'),
		('masculino','calca-de-brim-azul-aeronautica','obrigatorio',6,'arrumação e serviços gerais'),
		('masculino','cinto-azul-aeronautica-branco-ou-preto','obrigatorio',7,'azul-aeronáutica, com fivela prateada'),
		('masculino','sapato-masculino-preto-tipo-2','obrigatorio',8,'preto (governança/recepção)'),
		('masculino','borzeguim-preto-acolchoado','obrigatorio',9,'preto (arrumação e serviços gerais)'),
		('masculino','meia-preta-branca-de-nylon','obrigatorio',11,'preta'),
		('masculino','meia-preta-branca-de-cano-longo','obrigatorio',12,'preta, cano longo (arrumação)'),
		('masculino','camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',20,'2ª pele branca'),
		('masculino','colete-azul-aeronautica-com-gola-em-v','facultativo',21,'gola em "V"'),
		('masculino','pulover-azul-aeronautica','facultativo',22,'azul-aeronáutica'),
		('masculino','jaqueta-masculina-azul-aeronautica-com-forro-removivel','facultativo',23,'azul-aeronáutica'),
		('masculino','jaqueta-impermeavel-azul-aeronautica','facultativo',24,'azul-aeronáutica (arrumação e serviços gerais)'),
		('masculino','capa-de-chuva-azul-aeronautica','facultativo',25,'azul-aeronáutica'),
		('masculino','japona-azul-aeronautica','facultativo',26,'azul-aeronáutica'),
		('masculino','cachecol-branco','facultativo',27,null),
		('masculino','luva-de-la-preta','facultativo',28,'preta')
),
friso(circulo, obs) as (
	values ('suboficiais','azul-aeronáutica, com friso azul-royal'),('sargentos','azul-aeronáutica'),('pracas','azul-aeronáutica')
),
comp(circulo, genero, slug, nivel, ordem, obs) as (
	select cg.circulo, cg.genero, p.slug, p.nivel, p.ordem, p.obs from cg join pecas p on p.genero=cg.genero
	union all
	select cg.circulo, cg.genero,
		case cg.genero when 'feminino' then 'gorro-feminino-azul-aeronautica' else 'gorro-masculino-azul-aeronautica' end,
		'obrigatorio',0,f.obs from cg join friso f on f.circulo=cg.circulo
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from comp c
join rumaer.uniform u on u.numero=14 and u.letra='A' and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id and uv.circulo=c.circulo::rumaer.circulo_hierarquico and uv.genero=c.genero::rumaer.genero
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);

-- ===================== 14º B (condução de viaturas) =====================
do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=14 and letra='B' and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (14,'B','14º Uniforme B','servicos','conducao','condução de viaturas','Art. 49',280,
			'14º Uniforme "B", condução de viaturas em serviços administrativos.')
		returning id into u_id;
		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id,'suboficiais'),(u_id,'sargentos'),(u_id,'pracas') on conflict do nothing;
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id,'suboficiais','feminino',null,0),(u_id,'sargentos','feminino',null,1),(u_id,'pracas','feminino',null,2),
			(u_id,'suboficiais','masculino',null,3),(u_id,'sargentos','masculino',null,4),(u_id,'pracas','masculino',null,5)
		on conflict do nothing;
	end if;
end $$;

with cg(circulo, genero) as (
	values ('suboficiais','feminino'),('sargentos','feminino'),('pracas','feminino'),
		('suboficiais','masculino'),('sargentos','masculino'),('pracas','masculino')
),
pecas(genero, slug, nivel, ordem, obs) as (
	values
		-- feminino
		('feminino','blazer-feminino-preto','obrigatorio',0,'preto, com gládio alado bordado'),
		('feminino','camisa-feminina-branca-de-mangas-compridas','obrigatorio',1,'branca (compridas ou curtas)'),
		('feminino','camisa-feminina-branca-de-mangas-curtas','obrigatorio',2,'branca (compridas ou curtas)'),
		('feminino','gravata-feminina-preta','obrigatorio',3,null),
		('feminino','calca-feminina-preta','obrigatorio',4,'preta'),
		('feminino','cinto-feminino-preto-de-couro','obrigatorio',5,'preto, de couro'),
		('feminino','sapato-feminino-de-salto-medio-tipo-2','obrigatorio',6,'preto, salto médio ou baixo'),
		('feminino','meia-preta-branca-de-nylon','obrigatorio',7,'social preta'),
		('feminino','camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca'),
		('feminino','camiseta-branca','facultativo',11,'branca'),
		-- masculino
		('masculino','paleto-preto','obrigatorio',0,'preto, com gládio alado bordado'),
		('masculino','camisa-masculina-branca-de-mangas-compridas','obrigatorio',1,'branca (compridas ou curtas com colarinho)'),
		('masculino','camisa-masculina-branca-de-mangas-curtas-com-colarinho','obrigatorio',2,'branca (compridas ou curtas com colarinho)'),
		('masculino','gravata-vertical-preta','obrigatorio',3,'vertical'),
		('masculino','calca-preta','obrigatorio',4,'preta'),
		('masculino','cinto-azul-aeronautica-branco-ou-preto','obrigatorio',5,'preto, com fivela prateada'),
		('masculino','sapato-masculino-preto-tipo-2','obrigatorio',6,'preto'),
		('masculino','meia-preta-branca-de-nylon','obrigatorio',7,'preta'),
		('masculino','camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from cg
join pecas c on c.genero=cg.genero
join rumaer.uniform u on u.numero=14 and u.letra='B' and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id and uv.circulo=cg.circulo::rumaer.circulo_hierarquico and uv.genero=cg.genero::rumaer.genero
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);

-- ===================== 14º C (barbearia) =====================
do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=14 and letra='C' and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (14,'C','14º Uniforme C','servicos','barbearia','barbearia','Art. 50',290,
			'14º Uniforme "C", atividades de barbearia (composição masculina).')
		returning id into u_id;
		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id,'suboficiais'),(u_id,'sargentos'),(u_id,'pracas') on conflict do nothing;
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id,'suboficiais','unissex',null,0),(u_id,'sargentos','unissex',null,1),(u_id,'pracas','unissex',null,2)
		on conflict do nothing;
	end if;
end $$;

with circ(circulo) as (values ('suboficiais'),('sargentos'),('pracas')),
pecas(slug, nivel, ordem, obs) as (
	values
		('jaleco-para-barbeiro','obrigatorio',1,'branco, para barbeiro'),
		('calca-masculina-azul-aeronautica','obrigatorio',2,'azul-aeronáutica'),
		('cinto-azul-aeronautica-branco-ou-preto','obrigatorio',3,'azul-aeronáutica, com fivela prateada'),
		('sapato-masculino-preto-tipo-2','obrigatorio',4,'preto'),
		('meia-preta-branca-de-nylon','obrigatorio',5,'preta'),
		('camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca'),
		('camiseta-branca','facultativo',11,'branca'),
		('jaqueta-masculina-azul-aeronautica-com-forro-removivel','facultativo',12,'azul-aeronáutica'),
		('jaleco-branco','facultativo',13,'branco')
),
friso(circulo, obs) as (
	values ('suboficiais','azul-aeronáutica, com friso azul-royal'),('sargentos','azul-aeronáutica'),('pracas','azul-aeronáutica')
),
comp(circulo, slug, nivel, ordem, obs) as (
	select cr.circulo, p.slug, p.nivel, p.ordem, p.obs from circ cr cross join pecas p
	union all
	select f.circulo, 'gorro-masculino-azul-aeronautica', 'obrigatorio', 0, f.obs from friso f
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from comp c
join rumaer.uniform u on u.numero=14 and u.letra='C' and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id and uv.circulo=c.circulo::rumaer.circulo_hierarquico and uv.genero='unissex'
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);
