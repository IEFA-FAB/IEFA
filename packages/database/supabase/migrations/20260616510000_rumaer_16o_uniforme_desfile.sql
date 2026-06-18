-- Cria e preenche o "16º Uniforme" A/B/C (Art. 54 do RUMAER), desfile militar / guarda de honra — grupo desfile.
-- Unissex (capacete; camisa e calça masculinas OU femininas, listadas como alternativas).
--   A: oficiais e alunos (centros de formação de oficiais) — com espada.
--   B: suboficiais, sargentos, alunos EEAR, praças (cabos/soldados/taifeiros).
--   C: tropa de Polícia da Aeronáutica (oficiais, suboficiais, sargentos, praças) — equipamento branco + braçal/cordão.
-- Peças novas: capacete branco (desfile), braçal branco da Polícia da Aeronáutica, colete refletivo tipo suspensório.

insert into rumaer.piece (codigo, nome, slug, tipo) values
	(null, 'capacete branco',                                'capacete-branco',                       'cabeca'),
	(null, 'braçal branco da Polícia da Aeronáutica',        'bracal-branco-policia-aeronautica',     'acessorio'),
	(null, 'colete refletivo tipo suspensório',              'colete-refletivo-suspensorio',          'acessorio')
on conflict (slug) do update set nome=excluded.nome, tipo=coalesce(excluded.tipo, rumaer.piece.tipo), deleted_at=null, updated_at=now();

-- ===================== 16º A =====================
do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=16 and letra='A' and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (16,'A','16º Uniforme A','desfile','desfile','desfile / guarda de honra','Art. 54',330,
			'16º Uniforme "A", desfile militar e guarda de honra — oficiais e alunos dos centros de formação de oficiais.')
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
		('camisas-femininas-azuis-claras-de-mangas-curtas','obrigatorio',1,'azul-clara, mangas curtas, com passantes (masculina ou feminina)'),
		('camisas-masculinas-azuis-claras-de-mangas-curtas','obrigatorio',2,'azul-clara, mangas curtas, com passantes (masculina ou feminina)'),
		('cachecol-branco-para-desfile','obrigatorio',3,'branco'),
		('luva-branca-de-algodao','obrigatorio',4,'branca'),
		('calca-feminina-azul-aeronautica','obrigatorio',5,'azul-aeronáutica, usada com bombacha (masculina ou feminina)'),
		('calca-masculina-azul-aeronautica','obrigatorio',6,'azul-aeronáutica, usada com bombacha (masculina ou feminina)'),
		('cinto-azul-aeronautica-branco-ou-preto','obrigatorio',7,'azul-aeronáutica, com fivela prateada'),
		('meia-bota-preta','obrigatorio',8,'preta'),
		('meia-preta-branca-de-cano-longo','obrigatorio',9,'preta, cano longo'),
		('fiador-para-espada','obrigatorio',10,null),
		('guia-branca-de-couro-para-espada','obrigatorio',11,'branca'),
		('espada','obrigatorio',12,null),
		('cinturao-branco','obrigatorio',13,'branco'),
		('porta-pistola-branco','obrigatorio',14,'branco'),
		('porta-sabre-branco','obrigatorio',15,'branco'),
		('talabarte-branco','obrigatorio',16,'branco'),
		('camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',20,'2ª pele branca')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from circ cr cross join pecas c
join rumaer.uniform u on u.numero=16 and u.letra='A' and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id and uv.circulo=cr.circulo::rumaer.circulo_hierarquico and uv.genero='unissex'
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);

-- ===================== 16º B =====================
do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=16 and letra='B' and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (16,'B','16º Uniforme B','desfile','desfile','desfile / guarda de honra','Art. 54',340,
			'16º Uniforme "B", desfile militar e guarda de honra — suboficiais, sargentos, alunos da EEAR e praças.')
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
		('camisas-femininas-azuis-claras-de-mangas-curtas','obrigatorio',1,'azul-clara, mangas curtas — passantes (suboficiais) ou ombreiras (sargentos, alunos EEAR, cabos, soldados, taifeiros)'),
		('camisas-masculinas-azuis-claras-de-mangas-curtas','obrigatorio',2,'azul-clara, mangas curtas — passantes (suboficiais) ou ombreiras (sargentos, alunos EEAR, cabos, soldados, taifeiros)'),
		('cachecol-branco-para-desfile','obrigatorio',3,'branco'),
		('luva-branca-de-algodao','obrigatorio',4,'branca'),
		('calca-feminina-azul-aeronautica','obrigatorio',5,'azul-aeronáutica, usada com bombacha (masculina ou feminina)'),
		('calca-masculina-azul-aeronautica','obrigatorio',6,'azul-aeronáutica, usada com bombacha (masculina ou feminina)'),
		('cinto-azul-aeronautica-branco-ou-preto','obrigatorio',7,'azul-aeronáutica, com fivela prateada'),
		('meia-bota-preta','obrigatorio',8,'preta'),
		('meia-preta-branca-de-cano-longo','obrigatorio',9,'preta, cano longo'),
		('cinturao-preto','obrigatorio',10,'preto'),
		('porta-pistola-preto','obrigatorio',11,'preto'),
		('porta-sabre-preto','obrigatorio',12,'preto'),
		('camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',20,'2ª pele branca')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from circ cr cross join pecas c
join rumaer.uniform u on u.numero=16 and u.letra='B' and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id and uv.circulo=cr.circulo::rumaer.circulo_hierarquico and uv.genero='unissex'
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);

-- ===================== 16º C (Polícia da Aeronáutica) =====================
do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=16 and letra='C' and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (16,'C','16º Uniforme C','desfile','desfile','desfile / Polícia da Aeronáutica','Art. 54',350,
			'16º Uniforme "C", desfile e atividades da tropa de Polícia da Aeronáutica (policiamento, patrulhamento, balizamento e escolta).')
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
		('camisas-masculinas-azuis-claras-de-mangas-curtas','obrigatorio',1,'azul-clara, mangas curtas — passantes (oficiais/suboficiais) ou ombreiras (sargentos, cabos, soldados, taifeiros)'),
		('cachecol-branco-para-desfile','obrigatorio',2,'branco'),
		('luva-de-couro-branca-com-palma-preta-e-cano-longo','obrigatorio',3,'branca, palma preta, cano longo'),
		('calca-feminina-azul-aeronautica','obrigatorio',4,'azul-aeronáutica, usada com bombacha (masculina ou feminina)'),
		('calca-masculina-azul-aeronautica','obrigatorio',5,'azul-aeronáutica, usada com bombacha (masculina ou feminina)'),
		('cinto-azul-aeronautica-branco-ou-preto','obrigatorio',6,'azul-aeronáutica, com fivela prateada'),
		('meia-bota-preta','obrigatorio',7,'preta'),
		('meia-preta-branca-de-cano-longo','obrigatorio',8,'preta, cano longo'),
		('bracal-branco-policia-aeronautica','obrigatorio',9,'branco, fixado ao ombro esquerdo'),
		('cinturao-branco','obrigatorio',10,'branco'),
		('porta-pistola-branco','obrigatorio',11,'branco'),
		('porta-cassetete-branco','obrigatorio',12,'branco'),
		('porta-algemas-branco','obrigatorio',13,'branco'),
		('porta-sabre-branco','obrigatorio',14,'branco'),
		('talabarte-branco','obrigatorio',15,'branco'),
		('cordao-branco','obrigatorio',16,'branco, fixado ao ombro direito'),
		('camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',20,'2ª pele branca'),
		('colete-refletivo-suspensorio','eventual',30,'tipo suspensório, no controle de trânsito')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from circ cr cross join pecas c
join rumaer.uniform u on u.numero=16 and u.letra='C' and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id and uv.circulo=cr.circulo::rumaer.circulo_hierarquico and uv.genero='unissex'
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);
