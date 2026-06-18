-- Cria e preenche o "17º Uniforme" A/B/C (Art. 55 do RUMAER), desfile militar / guarda de honra — grupo desfile.
-- Igual ao 16º porém com camisa de mangas COMPRIDAS + gravata (em vez de mangas curtas + cachecol).
-- Unissex (capacete; camisa/calça masc ou fem; gravata feminina ou masculina vertical). Peças já existem.

-- ===================== 17º A =====================
do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=17 and letra='A' and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (17,'A','17º Uniforme A','desfile','desfile','desfile / guarda de honra','Art. 55',360,
			'17º Uniforme "A", desfile e guarda de honra (mangas compridas) — oficiais e alunos dos centros de formação de oficiais.')
		returning id into u_id;
		insert into rumaer.uniform_category (uniform_id, categoria) values (u_id,'oficiais'),(u_id,'alunos_formacao') on conflict do nothing;
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id,'oficiais','unissex',null,0),(u_id,'alunos','unissex',null,1) on conflict do nothing;
	end if;
end $$;

with circ(circulo) as (values ('oficiais'),('alunos')),
pecas(slug, nivel, ordem, obs) as (
	values
		('capacete-branco','obrigatorio',0,'branco'),
		('camisa-feminina-azul-clara-de-mangas-compridas','obrigatorio',1,'azul-clara, mangas compridas (masculina ou feminina)'),
		('camisa-masculina-azul-clara-de-mangas-compridas','obrigatorio',2,'azul-clara, mangas compridas (masculina ou feminina)'),
		('gravata-feminina-preta','obrigatorio',3,'preta (feminina ou masculina vertical)'),
		('gravata-vertical-preta','obrigatorio',4,'preta (feminina ou masculina vertical)'),
		('luva-branca-de-algodao','obrigatorio',5,'branca'),
		('calca-feminina-azul-aeronautica','obrigatorio',6,'azul-aeronáutica, usada com bombacha (masculina ou feminina)'),
		('calca-masculina-azul-aeronautica','obrigatorio',7,'azul-aeronáutica, usada com bombacha (masculina ou feminina)'),
		('cinto-azul-aeronautica-branco-ou-preto','obrigatorio',8,'azul-aeronáutica, com fivela prateada'),
		('meia-bota-preta','obrigatorio',9,'preta'),
		('meia-preta-branca-de-cano-longo','obrigatorio',10,'preta, cano longo'),
		('fiador-para-espada','obrigatorio',11,null),
		('guia-branca-de-couro-para-espada','obrigatorio',12,'branca'),
		('espada','obrigatorio',13,null),
		('cinturao-branco','obrigatorio',14,'branco'),
		('porta-pistola-branco','obrigatorio',15,'branco'),
		('porta-sabre-branco','obrigatorio',16,'branco'),
		('talabarte-branco','obrigatorio',17,'branco'),
		('camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',20,'2ª pele branca')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from circ cr cross join pecas c
join rumaer.uniform u on u.numero=17 and u.letra='A' and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id and uv.circulo=cr.circulo::rumaer.circulo_hierarquico and uv.genero='unissex'
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);

-- ===================== 17º B =====================
do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=17 and letra='B' and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (17,'B','17º Uniforme B','desfile','desfile','desfile / guarda de honra','Art. 55',370,
			'17º Uniforme "B", desfile e guarda de honra (mangas compridas) — suboficiais, sargentos, alunos da EEAR e praças.')
		returning id into u_id;
		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id,'suboficiais'),(u_id,'sargentos'),(u_id,'alunos_formacao'),(u_id,'pracas') on conflict do nothing;
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id,'suboficiais','unissex',null,0),(u_id,'sargentos','unissex',null,1),(u_id,'alunos','unissex',null,2),(u_id,'pracas','unissex',null,3) on conflict do nothing;
	end if;
end $$;

with circ(circulo) as (values ('suboficiais'),('sargentos'),('alunos'),('pracas')),
pecas(slug, nivel, ordem, obs) as (
	values
		('capacete-azul-aeronautica','obrigatorio',0,'azul-aeronáutica'),
		('camisa-feminina-azul-clara-de-mangas-compridas','obrigatorio',1,'azul-clara, mangas compridas (masculina ou feminina)'),
		('camisa-masculina-azul-clara-de-mangas-compridas','obrigatorio',2,'azul-clara, mangas compridas (masculina ou feminina)'),
		('gravata-feminina-preta','obrigatorio',3,'preta (feminina ou masculina vertical)'),
		('gravata-vertical-preta','obrigatorio',4,'preta (feminina ou masculina vertical)'),
		('luva-branca-de-algodao','obrigatorio',5,'branca'),
		('calca-feminina-azul-aeronautica','obrigatorio',6,'azul-aeronáutica, usada com bombacha (masculina ou feminina)'),
		('calca-masculina-azul-aeronautica','obrigatorio',7,'azul-aeronáutica, usada com bombacha (masculina ou feminina)'),
		('cinto-azul-aeronautica-branco-ou-preto','obrigatorio',8,'azul-aeronáutica, com fivela prateada'),
		('meia-bota-preta','obrigatorio',9,'preta'),
		('meia-preta-branca-de-cano-longo','obrigatorio',10,'preta, cano longo'),
		('cinturao-preto','obrigatorio',11,'preto'),
		('porta-pistola-preto','obrigatorio',12,'preto'),
		('porta-sabre-preto','obrigatorio',13,'preto'),
		('camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',20,'2ª pele branca')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from circ cr cross join pecas c
join rumaer.uniform u on u.numero=17 and u.letra='B' and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id and uv.circulo=cr.circulo::rumaer.circulo_hierarquico and uv.genero='unissex'
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);

-- ===================== 17º C (Polícia da Aeronáutica) =====================
do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=17 and letra='C' and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (17,'C','17º Uniforme C','desfile','desfile','desfile / Polícia da Aeronáutica','Art. 55',380,
			'17º Uniforme "C" (mangas compridas), desfile e atividades da tropa de Polícia da Aeronáutica.')
		returning id into u_id;
		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id,'oficiais'),(u_id,'suboficiais'),(u_id,'sargentos'),(u_id,'pracas') on conflict do nothing;
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id,'oficiais','unissex',null,0),(u_id,'suboficiais','unissex',null,1),(u_id,'sargentos','unissex',null,2),(u_id,'pracas','unissex',null,3) on conflict do nothing;
	end if;
end $$;

with circ(circulo) as (values ('oficiais'),('suboficiais'),('sargentos'),('pracas')),
pecas(slug, nivel, ordem, obs) as (
	values
		('capacete-branco','obrigatorio',0,'branco'),
		('camisa-masculina-azul-clara-de-mangas-compridas','obrigatorio',1,'azul-clara, mangas compridas'),
		('gravata-feminina-preta','obrigatorio',2,'preta (feminina ou masculina vertical)'),
		('gravata-vertical-preta','obrigatorio',3,'preta (feminina ou masculina vertical)'),
		('luva-de-couro-branca-com-palma-preta-e-cano-longo','obrigatorio',4,'branca, palma preta, cano longo'),
		('calca-feminina-azul-aeronautica','obrigatorio',5,'azul-aeronáutica, usada com bombacha (masculina ou feminina)'),
		('calca-masculina-azul-aeronautica','obrigatorio',6,'azul-aeronáutica, usada com bombacha (masculina ou feminina)'),
		('cinto-azul-aeronautica-branco-ou-preto','obrigatorio',7,'azul-aeronáutica, com fivela prateada'),
		('meia-bota-preta','obrigatorio',8,'preta'),
		('meia-preta-branca-de-cano-longo','obrigatorio',9,'preta, cano longo'),
		('bracal-branco-policia-aeronautica','obrigatorio',10,'branco, fixado ao ombro esquerdo'),
		('cinturao-branco','obrigatorio',11,'branco'),
		('porta-pistola-branco','obrigatorio',12,'branco'),
		('porta-cassetete-branco','obrigatorio',13,'branco'),
		('porta-algemas-branco','obrigatorio',14,'branco'),
		('porta-sabre-branco','obrigatorio',15,'branco'),
		('talabarte-branco','obrigatorio',16,'branco'),
		('cordao-branco','obrigatorio',17,'branco, fixado ao ombro direito'),
		('camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',20,'2ª pele branca'),
		('colete-refletivo-suspensorio','eventual',30,'tipo suspensório, no controle de trânsito'),
		('capa-de-chuva-azul-aeronautica','eventual',31,'azul-aeronáutica')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from circ cr cross join pecas c
join rumaer.uniform u on u.numero=17 and u.letra='C' and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id and uv.circulo=cr.circulo::rumaer.circulo_hierarquico and uv.genero='unissex'
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);
