-- Cria e preenche o "12º Uniforme" A/B/C/D (Arts. 42-45 do RUMAER), atividades de subsistência — grupo servicos.
-- 12A (cozinha) e 12B (copa): unissex. 12C (refeitório/arrumadores) e 12D (trabalhos especiais/comissaria):
-- feminino e masculino; a comissaria de bordo do 12D entra como sub_variacao='comissaria'.
-- Círculos: suboficiais, sargentos, praças (cabos/soldados/taifeiros).
-- Peças novas: avental branco de PVC, avental preto p/ comissaria, touca branca descartável, meia-bota branca,
-- sapato branco soft antiderrapante, camisa feminina branca com gola tipo padre, lenço de pescoço p/ comissaria.

insert into rumaer.piece (codigo, nome, slug, tipo) values
	(null, 'avental branco em PVC',                          'avental-branco-de-pvc',                    'acessorio'),
	(null, 'avental preto para comissaria de bordo',         'avental-preto-para-comissaria-de-bordo',   'acessorio'),
	(null, 'touca branca descartável',                       'touca-branca-descartavel',                 'cabeca'),
	(null, 'meia-bota branca',                               'meia-bota-branca',                         'calcado'),
	(null, 'sapato branco tipo "soft" antiderrapante',       'sapato-branco-soft-antiderrapante',        'calcado'),
	(null, 'camisa feminina branca de mangas compridas com gola tipo padre', 'camisa-feminina-branca-com-gola-tipo-padre', 'torso'),
	(null, 'lenço de pescoço para comissaria de bordo',      'lenco-de-pescoco-para-comissaria-de-bordo', 'acessorio')
on conflict (slug) do update set
	nome = excluded.nome, tipo = coalesce(excluded.tipo, rumaer.piece.tipo), deleted_at = null, updated_at = now();

-- ===================== 12º A (cozinha) =====================
do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=12 and letra='A' and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (12,'A','12º Uniforme A','servicos','subsistencia','subsistência (cozinha)','Art. 42',220,
			'12º Uniforme "A", subsistência — chefes de cozinha, cozinheiro e auxiliar de cozinha.')
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
		('dolma-branco','obrigatorio',0,'branco'),
		('camiseta-branca','obrigatorio',1,'branca'),
		('calca-branca-para-trabalhos-de-copa-e-cozinha','obrigatorio',2,'branca'),
		('meio-avental-branco','obrigatorio',3,'branco, em tecido (para áreas quentes)'),
		('avental-branco-de-pvc','obrigatorio',4,'para açougueiro e pré-preparo de hortifruti'),
		('sapato-branco-soft-antiderrapante','obrigatorio',5,'branco, tipo soft antiderrapante (cozinheiro)'),
		('meia-branca-de-cano-medio','obrigatorio',6,'branca'),
		('touca-branca-descartavel','obrigatorio',7,'branca, descartável (cozinheiros e auxiliares de cozinha)'),
		('camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca'),
		('gorro-branco-para-chefe-de-cozinha','eventual',20,'para chefe de cozinha')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from circ cr cross join pecas c
join rumaer.uniform u on u.numero=12 and u.letra='A' and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id and uv.circulo=cr.circulo::rumaer.circulo_hierarquico and uv.genero='unissex'
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);

-- ===================== 12º B (copa) =====================
do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=12 and letra='B' and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (12,'B','12º Uniforme B','servicos','subsistencia','subsistência (copa)','Art. 43',230,
			'12º Uniforme "B", subsistência — trabalhos em copa, sem manipulação de alimentos.')
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
		('camiseta-branca','obrigatorio',0,'branca'),
		('calca-branca-para-trabalhos-de-copa-e-cozinha','obrigatorio',1,'branca'),
		('meia-bota-branca','obrigatorio',2,'branca'),
		('meia-branca-de-cano-medio','obrigatorio',3,'branca'),
		('camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca'),
		('jaqueta-impermeavel-azul-aeronautica','facultativo',11,'azul-aeronáutica'),
		('avental-branco-de-pvc','eventual',20,'branco, em PVC'),
		('jaleco-branco','eventual',21,'branco')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from circ cr cross join pecas c
join rumaer.uniform u on u.numero=12 and u.letra='B' and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id and uv.circulo=cr.circulo::rumaer.circulo_hierarquico and uv.genero='unissex'
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);

-- ===================== 12º C (refeitório/arrumadores) =====================
do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=12 and letra='C' and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (12,'C','12º Uniforme C','servicos','subsistencia','subsistência (refeitório)','Art. 44',240,
			'12º Uniforme "C", subsistência — trabalhos em refeitórios (arrumadores).')
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
		('feminino','camisa-feminina-branca-de-mangas-curtas','obrigatorio',0,'branca (mangas curtas ou compridas)'),
		('feminino','camisa-feminina-branca-de-mangas-compridas','obrigatorio',1,'branca (mangas curtas ou compridas)'),
		('feminino','gravata-feminina-preta','obrigatorio',2,'uso exclusivo com camisa de mangas compridas'),
		('feminino','calca-feminina-preta','obrigatorio',3,'calça ou saia, preta'),
		('feminino','saia-preta','obrigatorio',4,'calça ou saia, preta'),
		('feminino','cinto-feminino-preto-de-couro','obrigatorio',5,'preto, de couro'),
		('feminino','sapato-feminino-preto-antiderrapante-tipo-2','obrigatorio',6,'preto, salto médio ou baixo, tipo soft'),
		('feminino','meia-calca-social-lisa','obrigatorio',7,'preta (quando usando saia)'),
		('feminino','meia-preta-branca-de-nylon','obrigatorio',8,'preta (quando usando calça)'),
		('feminino','camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca'),
		('feminino','camiseta-branca','facultativo',11,'branca'),
		-- masculino
		('masculino','camisa-masculina-branca-de-mangas-curtas','obrigatorio',0,'branca (mangas curtas ou compridas)'),
		('masculino','camisa-masculina-branca-de-mangas-compridas','obrigatorio',1,'branca (mangas curtas ou compridas)'),
		('masculino','gravata-vertical-preta','obrigatorio',2,'vertical'),
		('masculino','calca-preta','obrigatorio',3,'preta'),
		('masculino','cinto-masculino-preto-de-couro','obrigatorio',4,'preto, de couro'),
		('masculino','sapato-masculino-preto-tipo-2','obrigatorio',5,'preto'),
		('masculino','meia-preta-branca-de-nylon','obrigatorio',6,'preta'),
		('masculino','camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca'),
		('masculino','camiseta-branca','facultativo',11,'branca')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from cg
join pecas c on c.genero = cg.genero
join rumaer.uniform u on u.numero=12 and u.letra='C' and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id and uv.circulo=cg.circulo::rumaer.circulo_hierarquico and uv.genero=cg.genero::rumaer.genero
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);

-- ===================== 12º D (trabalhos especiais / comissaria de bordo) =====================
do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=12 and letra='D' and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (12,'D','12º Uniforme D','servicos','subsistencia','subsistência (trabalhos especiais / comissaria)','Art. 45',250,
			'12º Uniforme "D", subsistência — trabalhos especiais em refeitório e comissaria de bordo.')
		returning id into u_id;
		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id,'suboficiais'),(u_id,'sargentos'),(u_id,'pracas') on conflict do nothing;
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id,'suboficiais','feminino',null,0),(u_id,'sargentos','feminino',null,1),(u_id,'pracas','feminino',null,2),
			(u_id,'suboficiais','feminino','comissaria',3),(u_id,'sargentos','feminino','comissaria',4),(u_id,'pracas','feminino','comissaria',5),
			(u_id,'suboficiais','masculino',null,6),(u_id,'sargentos','masculino',null,7),(u_id,'pracas','masculino',null,8),
			(u_id,'suboficiais','masculino','comissaria',9),(u_id,'sargentos','masculino','comissaria',10),(u_id,'pracas','masculino','comissaria',11)
		on conflict do nothing;
	end if;
end $$;

with cgs(circulo, genero, subvar) as (
	values ('suboficiais','feminino',null),('sargentos','feminino',null),('pracas','feminino',null),
		('suboficiais','feminino','comissaria'),('sargentos','feminino','comissaria'),('pracas','feminino','comissaria'),
		('suboficiais','masculino',null),('sargentos','masculino',null),('pracas','masculino',null),
		('suboficiais','masculino','comissaria'),('sargentos','masculino','comissaria'),('pracas','masculino','comissaria')
),
pecas(genero, subvar, slug, nivel, ordem, obs) as (
	values
		-- feminino (refeitório)
		('feminino',null,'colete-feminino-preto','obrigatorio',0,'preto'),
		('feminino',null,'camisa-feminina-branca-de-mangas-compridas','obrigatorio',1,'branca'),
		('feminino',null,'gravata-feminina-preta','obrigatorio',2,null),
		('feminino',null,'calca-feminina-preta','obrigatorio',3,'calça ou saia, preta'),
		('feminino',null,'saia-preta','obrigatorio',4,'calça ou saia, preta'),
		('feminino',null,'cinto-feminino-preto-de-couro','obrigatorio',5,'preto, de couro'),
		('feminino',null,'sapato-feminino-de-salto-medio-tipo-2','obrigatorio',6,'preto, salto médio ou baixo'),
		('feminino',null,'meia-calca-social-lisa','obrigatorio',7,'preta (quando usando saia)'),
		('feminino',null,'meia-preta-branca-de-nylon','obrigatorio',8,'social preta (quando usando calça)'),
		('feminino',null,'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca'),
		('feminino',null,'sobretudo-feminino-preto','facultativo',11,'preto, para comissária'),
		('feminino',null,'camiseta-branca','facultativo',12,'branca'),
		('feminino',null,'blazer-feminino-preto','eventual',20,'preto'),
		('feminino',null,'meio-avental-preto','eventual',21,'preto'),
		-- feminino comissaria de bordo
		('feminino','comissaria','blazer-feminino-preto','obrigatorio',0,'preto, para comissaria de bordo'),
		('feminino','comissaria','colete-feminino-preto','obrigatorio',1,'preto'),
		('feminino','comissaria','camisa-feminina-branca-com-gola-tipo-padre','obrigatorio',2,'branca, gola tipo padre'),
		('feminino','comissaria','lenco-de-pescoco-para-comissaria-de-bordo','obrigatorio',3,'para comissaria de bordo'),
		('feminino','comissaria','vestido-preto-para-comissaria-de-bordo','obrigatorio',4,'preto'),
		('feminino','comissaria','calca-feminina-preta','obrigatorio',5,'calça ou saia, preta'),
		('feminino','comissaria','saia-preta','obrigatorio',6,'calça ou saia, preta'),
		('feminino','comissaria','cinto-feminino-preto-de-couro','obrigatorio',7,'preto, de couro'),
		('feminino','comissaria','sapato-feminino-de-salto-medio-tipo-2','obrigatorio',8,'preto, salto médio (ou sapatilha)'),
		('feminino','comissaria','sapatilha-preta','obrigatorio',9,'preta (ou sapato de salto médio)'),
		('feminino','comissaria','meia-calca-social-lisa','obrigatorio',10,'preta (quando usando saia)'),
		('feminino','comissaria','meia-preta-branca-de-nylon','obrigatorio',11,'social preta (quando usando calça)'),
		('feminino','comissaria','camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',12,'2ª pele branca'),
		('feminino','comissaria','sobretudo-feminino-preto','facultativo',13,'preto, para comissária'),
		('feminino','comissaria','camiseta-branca','facultativo',14,'branca'),
		('feminino','comissaria','avental-preto-para-comissaria-de-bordo','eventual',20,'preto, usado sem o blazer'),
		-- masculino (refeitório)
		('masculino',null,'colete-preto','obrigatorio',0,'preto'),
		('masculino',null,'camisa-masculina-branca-de-mangas-compridas','obrigatorio',1,'branca'),
		('masculino',null,'gravata-vertical-preta','obrigatorio',2,'vertical (pode ser horizontal a critério do chefe)'),
		('masculino',null,'calca-preta','obrigatorio',3,'preta'),
		('masculino',null,'cinto-masculino-preto-de-couro','obrigatorio',4,'preto, de couro'),
		('masculino',null,'sapato-masculino-preto-tipo-2','obrigatorio',5,'preto'),
		('masculino',null,'meia-preta-branca-de-nylon','obrigatorio',6,'social preta'),
		('masculino',null,'camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca'),
		('masculino',null,'sobretudo-masculino-preto','facultativo',11,'preto, para comissário'),
		('masculino',null,'camiseta-branca','facultativo',12,'branca'),
		('masculino',null,'paleto-preto','eventual',20,'preto'),
		('masculino',null,'meio-avental-preto','eventual',21,'preto'),
		-- masculino comissaria de bordo
		('masculino','comissaria','paleto-preto','obrigatorio',0,'preto, para comissaria de bordo'),
		('masculino','comissaria','colete-preto','obrigatorio',1,'preto'),
		('masculino','comissaria','camisa-masculina-branca-de-mangas-compridas','obrigatorio',2,'branca'),
		('masculino','comissaria','gravata-vertical-preta','obrigatorio',3,'vertical'),
		('masculino','comissaria','calca-preta','obrigatorio',4,'preta'),
		('masculino','comissaria','cinto-masculino-preto-de-couro','obrigatorio',5,'preto, de couro'),
		('masculino','comissaria','sapato-masculino-preto-tipo-2','obrigatorio',6,'preto'),
		('masculino','comissaria','meia-preta-branca-de-nylon','obrigatorio',7,'social preta'),
		('masculino','comissaria','camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca'),
		('masculino','comissaria','sobretudo-masculino-preto','facultativo',11,'preto, para comissário'),
		('masculino','comissaria','camiseta-branca','facultativo',12,'branca'),
		('masculino','comissaria','avental-preto-para-comissaria-de-bordo','eventual',20,'preto, usado sem o paletó')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from cgs
join pecas c on c.genero = cgs.genero and c.subvar is not distinct from cgs.subvar
join rumaer.uniform u on u.numero=12 and u.letra='D' and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id
	and uv.circulo=cgs.circulo::rumaer.circulo_hierarquico
	and uv.genero=cgs.genero::rumaer.genero
	and uv.sub_variacao is not distinct from cgs.subvar
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);
