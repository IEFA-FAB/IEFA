-- Cria e preenche o "15º Uniforme" (Art. 51 do RUMAER), motociclista batedor em escolta — grupo servicos.
-- Unissex (capacete, sem gorro). Círculos: oficiais, suboficiais, sargentos, praças (cabos e soldados).
-- Peça nova: joelheiras de proteção.

insert into rumaer.piece (codigo, nome, slug, tipo) values
	(null, 'joelheiras de proteção', 'joelheiras-de-protecao', 'acessorio')
on conflict (slug) do update set nome=excluded.nome, tipo=coalesce(excluded.tipo, rumaer.piece.tipo), deleted_at=null, updated_at=now();

do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=15 and letra is null and deleted_at is null limit 1;
	if u_id is null then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, ordem, descricao_md)
		values (15,null,'15º Uniforme','servicos','operacional','motociclista batedor','Art. 51',300,
			'15º Uniforme, utilizado em atividades de motociclista batedor em escolta.')
		returning id into u_id;
		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u_id,'oficiais'),(u_id,'suboficiais'),(u_id,'sargentos'),(u_id,'pracas') on conflict do nothing;
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id,'oficiais','unissex',null,0),(u_id,'suboficiais','unissex',null,1),
			(u_id,'sargentos','unissex',null,2),(u_id,'pracas','unissex',null,3)
		on conflict do nothing;
	end if;
end $$;

with circ(circulo) as (values ('oficiais'),('suboficiais'),('sargentos'),('pracas')),
pecas(slug, nivel, ordem, obs) as (
	values
		('capacete-branco-para-motociclista','obrigatorio',0,'branco'),
		('jaqueta-preta-de-couro','obrigatorio',1,'preta'),
		('camiseta-camuflada','obrigatorio',2,'camuflada'),
		('calca-camuflada','obrigatorio',3,'camuflada'),
		('cinto-preto-com-fivela-preta','obrigatorio',4,'preto, com fivela preta'),
		('bota-para-motociclista-e-bombeiro','obrigatorio',5,'preta, para motociclista'),
		('meia-preta-branca-de-cano-longo','obrigatorio',6,'preta, cano longo'),
		('cinturao-preto','obrigatorio',7,'preto'),
		('porta-pistola-preto','obrigatorio',8,'preto'),
		('joelheiras-de-protecao','obrigatorio',9,null),
		('luva-de-couro-preta-com-faixa-refletiva-para-motociclismo','obrigatorio',10,'preta, com faixa refletiva'),
		('camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',11,'2ª pele branca')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from circ cr cross join pecas c
join rumaer.uniform u on u.numero=15 and u.letra is null and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id and uv.circulo=cr.circulo::rumaer.circulo_hierarquico and uv.genero='unissex'
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);
