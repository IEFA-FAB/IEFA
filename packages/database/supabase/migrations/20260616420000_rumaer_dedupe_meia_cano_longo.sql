-- Remove peça redundante 'meia-preta-de-cano-longo' (criada por engano): o catálogo já tinha
-- 'meia-preta-branca-de-cano-longo' (FAB-V-077). Repõe as composições (8º e 10º) para a peça oficial
-- e faz soft-delete da redundante.
do $$
declare
	new_id uuid;
	old_id uuid;
begin
	select id into new_id from rumaer.piece where slug = 'meia-preta-branca-de-cano-longo' and deleted_at is null;
	select id into old_id from rumaer.piece where slug = 'meia-preta-de-cano-longo' and deleted_at is null;

	if new_id is not null and old_id is not null then
		update rumaer.uniform_variant_piece uvp
		set piece_id = new_id
		where uvp.piece_id = old_id
			and not exists (
				select 1 from rumaer.uniform_variant_piece x
				where x.variant_id = uvp.variant_id and x.piece_id = new_id
			);
		delete from rumaer.uniform_variant_piece where piece_id = old_id;
		update rumaer.piece set deleted_at = now(), updated_at = now() where id = old_id;
	end if;
end $$;
