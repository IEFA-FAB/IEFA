-- Seed das três entidades sentinela do ambiente de treino.
--
-- IDs NUNCA são hard-coded: `core.units` e `core.mess_halls` usam bigserial e `core.kitchen`
-- é identity, então os valores diferem entre local, staging e produção. Um literal escrito
-- aqui apontaria para uma unidade REAL noutro ambiente — e o reset é destrutivo.
--
-- `core.kitchen` não tem coluna `code`; a cozinha de treino é identificada pelo
-- `display_name` e pelo vínculo com a unidade de treino.
--
-- Idempotente: `where not exists` em cada insert, então reaplicar não duplica.

-- ─── Unidade ─────────────────────────────────────────────────────────────────

insert into core.units (code, display_name, type, is_training)
select 'TREINO', 'Unidade de Treinamento', 'consumption', true
where not exists (select 1 from core.units where is_training);

-- ─── Cozinha ─────────────────────────────────────────────────────────────────

insert into core.kitchen (unit_id, display_name, type, is_training)
select u.id, 'Cozinha de Treinamento', 'production', true
from core.units u
where u.is_training
	and not exists (select 1 from core.kitchen where is_training);

-- ─── Refeitório ──────────────────────────────────────────────────────────────

insert into core.mess_halls (unit_id, kitchen_id, code, display_name, is_training)
select u.id, k.id, 'TREINO', 'Refeitório de Treinamento', true
from core.units u
join core.kitchen k on k.is_training
where u.is_training
	and not exists (select 1 from core.mess_halls where is_training);

-- ─── Verificação ─────────────────────────────────────────────────────────────
-- Falha alto e cedo se o seed não produziu exatamente uma de cada: sem as sentinelas o
-- seed da política "Conjunto Treino" resolveria escopos nulos e concederia acesso GLOBAL.

do $$
declare
	n_units      integer;
	n_kitchens   integer;
	n_mess_halls integer;
begin
	select count(*) into n_units      from core.units      where is_training;
	select count(*) into n_kitchens   from core.kitchen    where is_training;
	select count(*) into n_mess_halls from core.mess_halls where is_training;

	if n_units <> 1 or n_kitchens <> 1 or n_mess_halls <> 1 then
		raise exception 'Seed do escopo de treino inconsistente: % unidade(s), % cozinha(s), % refeitório(s)',
			n_units, n_kitchens, n_mess_halls;
	end if;
end $$;
