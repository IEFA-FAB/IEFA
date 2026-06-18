-- Adiciona as sub_variações do 10º Uniforme (Art. 38, item i): EAS e contra-incêndio.
-- Modeladas como genero='unissex' + sub_variacao, uma variante por círculo (6 círculos do 10º).
--   eas (Esquadrão Aeroterrestre de Salvamento): boina grená, camisa de combate, macacão operacional,
--     meia-bota marrom; gorro laranja eventual (também Equipes de Resgate).
--   contra_incendio: capacete de combate a incêndio, cordão e cinturão vermelhos, bota de bombeiro.
-- Peças novas: macacão operacional, capacete de combate a incêndio (esta também usada no 11º).

insert into rumaer.piece (codigo, nome, slug, tipo) values
	(null, 'macacão operacional',            'macacao-operacional',            'torso'),
	(null, 'capacete de combate a incêndio', 'capacete-de-combate-a-incendio', 'cabeca')
on conflict (slug) do update set nome=excluded.nome, tipo=coalesce(excluded.tipo, rumaer.piece.tipo), deleted_at=null, updated_at=now();

do $$
declare u_id uuid;
begin
	select id into u_id from rumaer.uniform where numero=10 and letra is null and deleted_at is null limit 1;
	if u_id is not null then
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem) values
			(u_id,'oficiais','unissex','eas',20),(u_id,'suboficiais','unissex','eas',21),(u_id,'cadetes','unissex','eas',22),
			(u_id,'sargentos','unissex','eas',23),(u_id,'alunos','unissex','eas',24),(u_id,'pracas','unissex','eas',25),
			(u_id,'oficiais','unissex','contra_incendio',30),(u_id,'suboficiais','unissex','contra_incendio',31),(u_id,'cadetes','unissex','contra_incendio',32),
			(u_id,'sargentos','unissex','contra_incendio',33),(u_id,'alunos','unissex','contra_incendio',34),(u_id,'pracas','unissex','contra_incendio',35)
		on conflict do nothing;
	end if;
end $$;

with circ(circulo) as (values ('oficiais'),('suboficiais'),('cadetes'),('sargentos'),('alunos'),('pracas')),
pecas(subvar, slug, nivel, ordem, obs) as (
	values
		-- EAS
		('eas','boina-grena','obrigatorio',0,'grená'),
		('eas','camisa-de-combate','obrigatorio',1,null),
		('eas','macacao-operacional','obrigatorio',2,null),
		('eas','meia-bota-marrom','obrigatorio',3,'marrom'),
		('eas','meia-preta-branca-de-cano-longo','obrigatorio',4,'preta, cano longo'),
		('eas','cinto-preto-com-fivela-preta','obrigatorio',5,'preto, com fivela preta'),
		('eas','camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca'),
		('eas','gorro-laranja','eventual',20,'laranja (também Equipes de Resgate ativadas no COMAER)'),
		-- contra-incêndio
		('contra_incendio','capacete-de-combate-a-incendio','obrigatorio',0,null),
		('contra_incendio','gandola-camuflada','obrigatorio',1,'camuflada'),
		('contra_incendio','camiseta-camuflada','obrigatorio',2,'camuflada'),
		('contra_incendio','calca-camuflada','obrigatorio',3,'camuflada'),
		('contra_incendio','bota-para-motociclista-e-bombeiro','obrigatorio',4,'para combate a incêndio'),
		('contra_incendio','meia-preta-branca-de-cano-longo','obrigatorio',5,'preta, cano longo'),
		('contra_incendio','cordao-vermelho','obrigatorio',6,'vermelho, fixado ao ombro direito'),
		('contra_incendio','cinturao-vermelho','obrigatorio',7,'vermelho'),
		('contra_incendio','camisa-branca-flanelada-de-mangas-compridas-2-pele','facultativo',10,'2ª pele branca')
)
insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem)
select uv.id, p.id, c.nivel::rumaer.obrigatoriedade, c.obs, c.ordem
from circ cr cross join pecas c
join rumaer.uniform u on u.numero=10 and u.letra is null and u.deleted_at is null
join rumaer.uniform_variant uv on uv.uniform_id=u.id and uv.circulo=cr.circulo::rumaer.circulo_hierarquico
	and uv.genero='unissex' and uv.sub_variacao=c.subvar
join rumaer.piece p on p.slug=c.slug and p.deleted_at is null
where not exists (select 1 from rumaer.uniform_variant_piece x where x.variant_id=uv.id and x.piece_id=p.id);
