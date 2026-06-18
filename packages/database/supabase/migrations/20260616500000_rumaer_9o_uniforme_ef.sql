-- Cria e preenche o "9º Uniforme" A/B (Arts. 52-53 do RUMAER), condicionamento físico/esporte — grupo educacao_fisica.
-- Gendered. 9A (geral): 6 círculos × fem/masc. 9B (instrutores de EF): oficiais/suboficiais/sargentos × fem/masc.
-- Listras da calça/calção variam por círculo (2/1/sem) — registrado na observação.
-- Peça nova: camiseta branca de mangas compridas com gládio alado (a de mangas curtas já existe).

insert into rumaer.piece (codigo, nome, slug, tipo) values
	(null, 'camiseta branca de mangas compridas com gládio alado', 'camiseta-branca-de-mangas-compridas-com-gladio-alado', 'torso')
on conflict (slug) do update set nome=excluded.nome, tipo=coalesce(excluded.tipo, rumaer.piece.tipo), deleted_at=null, updated_at=now();

-- ===================== 9º A =====================
do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=9 and letra='A' and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (9,'A','9º Uniforme A','educacao_fisica','ed_fisica','educação física','Art. 52',310,
			'9º Uniforme "A", prática de exercícios de condicionamento físico e atividades esportivas.')
		returning id into u_id;
		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id,'oficiais'),(u_id,'cadetes'),(u_id,'suboficiais'),(u_id,'sargentos'),(u_id,'alunos_formacao'),(u_id,'pracas') on conflict do nothing;
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id,'oficiais','feminino',null,0),(u_id,'cadetes','feminino',null,1),(u_id,'suboficiais','feminino',null,2),
			(u_id,'sargentos','feminino',null,3),(u_id,'alunos','feminino',null,4),(u_id,'pracas','feminino',null,5),
			(u_id,'oficiais','masculino',null,6),(u_id,'cadetes','masculino',null,7),(u_id,'suboficiais','masculino',null,8),
			(u_id,'sargentos','masculino',null,9),(u_id,'alunos','masculino',null,10),(u_id,'pracas','masculino',null,11)
		on conflict do nothing;
	end if;
end $$;

with cg(circulo, genero) as (
	values ('oficiais','feminino'),('cadetes','feminino'),('suboficiais','feminino'),('sargentos','feminino'),('alunos','feminino'),('pracas','feminino'),
		('oficiais','masculino'),('cadetes','masculino'),('suboficiais','masculino'),('sargentos','masculino'),('alunos','masculino'),('pracas','masculino')
),
pecas(genero, slug, nivel, ordem, obs) as (
	values
		('feminino','top-azul-azul-aeronautica','obrigatorio',0,'azul-royal'),
		('feminino','camiseta-branca-com-gladio-alado-para-ed-fisica','obrigatorio',1,'branca, com gládio alado (curta ou comprida)'),
		('feminino','camiseta-branca-de-mangas-compridas-com-gladio-alado','obrigatorio',2,'branca, com gládio alado (curta ou comprida)'),
		('feminino','calca-para-educacao-fisica','obrigatorio',3,'azul-royal, com listras conforme círculo — calça ou calção'),
		('feminino','calcao-azul-aeronautica-para-ed-fisica','obrigatorio',4,'azul-royal, com listras conforme círculo — calça ou calção'),
		('feminino','bermuda-azul-royal','obrigatorio',5,'feminina, azul-royal'),
		('feminino','tenis-branco-pratica-atividade-fisica','obrigatorio',6,'branco'),
		('feminino','meia-branca-de-cano-medio','obrigatorio',7,'branca, cano médio'),
		('feminino','camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca'),
		('feminino','bone-para-educacao-fisica','facultativo',11,null),
		('feminino','jaqueta-para-educacao-fisica','facultativo',12,'usada com calção ou calça'),
		('feminino','maio-preto-de-tecido-sintetico-com-elastomero','eventual',20,'preto'),
		('feminino','touca-preta-para-natacao','eventual',21,'preta'),
		('feminino','roupao-azul-aeronautica','eventual',22,'azul-aeronáutica'),
		('feminino','jaqueta-de-competicao-esportiva','eventual',23,'agasalho de competição esportiva'),
		('masculino','camiseta-branca-com-gladio-alado-para-ed-fisica','obrigatorio',1,'branca, com gládio alado (curta ou comprida)'),
		('masculino','camiseta-branca-de-mangas-compridas-com-gladio-alado','obrigatorio',2,'branca, com gládio alado (curta ou comprida)'),
		('masculino','calca-para-educacao-fisica','obrigatorio',3,'azul-royal, com listras conforme círculo (exceto CPORAER-SJ sem listra) — calça ou calção'),
		('masculino','calcao-azul-aeronautica-para-ed-fisica','obrigatorio',4,'azul-royal, com listras conforme círculo (exceto CPORAER-SJ sem listra) — calça ou calção'),
		('masculino','tenis-branco-pratica-atividade-fisica','obrigatorio',6,'branco'),
		('masculino','meia-branca-de-cano-medio','obrigatorio',7,'branca, cano médio'),
		('masculino','camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca'),
		('masculino','bone-para-educacao-fisica','facultativo',11,null),
		('masculino','jaqueta-para-educacao-fisica','facultativo',12,'usada com calção ou calça'),
		('masculino','bermuda-azul-royal','facultativo',13,'masculina, azul-royal'),
		('masculino','calcao-preto-tipo-natacao','eventual',20,'preto, para natação'),
		('masculino','touca-preta-para-natacao','eventual',21,'preta'),
		('masculino','roupao-azul-aeronautica','eventual',22,'azul-aeronáutica'),
		('masculino','jaqueta-de-competicao-esportiva','eventual',23,'agasalho de competição esportiva')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from cg join pecas c on c.genero=cg.genero
join rumaer.uniform u on u.numero=9 and u.letra='A' and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id and uv.circulo=cg.circulo::rumaer.circulo_hierarquico and uv.genero=cg.genero::rumaer.genero
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);

-- ===================== 9º B (instrutores de EF) =====================
do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=9 and letra='B' and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (9,'B','9º Uniforme B','educacao_fisica','ed_fisica','educação física (instrutores)','Art. 53',320,
			'9º Uniforme "B", condicionamento físico para instrutores de educação física.')
		returning id into u_id;
		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id,'oficiais'),(u_id,'suboficiais'),(u_id,'sargentos') on conflict do nothing;
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id,'oficiais','feminino',null,0),(u_id,'suboficiais','feminino',null,1),(u_id,'sargentos','feminino',null,2),
			(u_id,'oficiais','masculino',null,3),(u_id,'suboficiais','masculino',null,4),(u_id,'sargentos','masculino',null,5)
		on conflict do nothing;
	end if;
end $$;

with cg(circulo, genero) as (
	values ('oficiais','feminino'),('suboficiais','feminino'),('sargentos','feminino'),
		('oficiais','masculino'),('suboficiais','masculino'),('sargentos','masculino')
),
pecas(genero, slug, nivel, ordem, obs) as (
	values
		('feminino','top-azul-azul-aeronautica','obrigatorio',0,'azul-royal'),
		('feminino','camiseta-branca-olimpica-com-gola-em-v-e-debrum','obrigatorio',1,'gola em "V" e debrum azul-royal (uso por fora da calça/calção)'),
		('feminino','calca-para-educacao-fisica','obrigatorio',3,'azul-royal — 2 listras (oficiais), 1 listra (suboficiais/sargentos) — calça ou calção'),
		('feminino','calcao-azul-aeronautica-para-ed-fisica','obrigatorio',4,'azul-royal — 2 listras (oficiais), 1 listra (suboficiais/sargentos) — calça ou calção'),
		('feminino','bermuda-azul-royal','obrigatorio',5,'feminina, azul-royal'),
		('feminino','tenis-branco-pratica-atividade-fisica','obrigatorio',6,'branco'),
		('feminino','meia-branca-de-cano-medio','obrigatorio',7,'branca, cano médio'),
		('feminino','camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca'),
		('feminino','bone-para-educacao-fisica','facultativo',11,null),
		('feminino','jaqueta-para-educacao-fisica','facultativo',12,'usada com calção ou calça'),
		('feminino','maio-preto-de-tecido-sintetico-com-elastomero','eventual',20,'preto'),
		('feminino','touca-preta-para-natacao','eventual',21,'preta'),
		('feminino','roupao-azul-aeronautica','eventual',22,'azul-aeronáutica'),
		('masculino','camiseta-branca-olimpica-com-gola-em-v-e-debrum','obrigatorio',1,'gola em "V" e debrum azul-royal (uso por fora da calça/calção)'),
		('masculino','calca-para-educacao-fisica','obrigatorio',3,'azul-royal — 2 listras (oficiais), 1 listra (suboficiais/sargentos) — calça ou calção'),
		('masculino','calcao-azul-aeronautica-para-ed-fisica','obrigatorio',4,'azul-royal — 2 listras (oficiais), 1 listra (suboficiais/sargentos) — calça ou calção'),
		('masculino','tenis-branco-pratica-atividade-fisica','obrigatorio',6,'branco'),
		('masculino','meia-branca-de-cano-medio','obrigatorio',7,'branca, cano médio'),
		('masculino','camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca'),
		('masculino','bone-para-educacao-fisica','facultativo',11,null),
		('masculino','jaqueta-para-educacao-fisica','facultativo',12,'usada com calção ou calça'),
		('masculino','bermuda-azul-royal','facultativo',13,'masculina, azul-royal'),
		('masculino','calcao-preto-tipo-natacao','eventual',20,'preto, para natação'),
		('masculino','touca-preta-para-natacao','eventual',21,'preta'),
		('masculino','roupao-azul-aeronautica','eventual',22,'azul-aeronáutica')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from cg join pecas c on c.genero=cg.genero
join rumaer.uniform u on u.numero=9 and u.letra='B' and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id and uv.circulo=cg.circulo::rumaer.circulo_hierarquico and uv.genero=cg.genero::rumaer.genero
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);
