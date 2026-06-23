-- Exemplo demonstrativo do Fluxo de Produção estruturado (NÃO é migration).
--
-- Popula um fluxo realista para a preparação "Cozido à Pernambucana"
-- (31 insumos, global, id 1e13efe5-7e7f-4e80-a0c1-8e0029e6772f) para inspeção
-- visual no editor (/global/recipes/<id> → aba "Fluxo de produção").
--
-- É um SEED de demonstração — rode manualmente contra o banco desejado; não
-- coloque em supabase/migrations (não deve ser aplicado em todo ambiente).
-- Idempotente: soft-deleta o fluxo anterior da receita antes de recriar.
--
-- Estrutura (DAG):
--   Refogar temperos (7 insumos)   → Base aromática   ┐
--   Preparar carnes  (5 insumos)   → Carnes seladas   ├→ Cozinhar e montar o cozido → [FINAL]
--   Higienizar legumes (12 insumos)→ Legumes preparados┤
--   Molhos e farinha (7 insumos)   → Molhos e pirão   ┘
--
-- Balanço: cada um dos 31 insumos é consumido integralmente (net_quantity) em
-- exatamente uma etapa → 0 excesso, 0 não-consumido; exatamente 1 saída final.

do $$
declare
  rid uuid := '1e13efe5-7e7f-4e80-a0c1-8e0029e6772f';
  s_temperos uuid; s_carnes uuid; s_legumes uuid; s_molhos uuid; s_final uuid;
  o_temperos uuid; o_carnes uuid; o_legumes uuid; o_molhos uuid;
  u_caldeirao uuid; u_faca uuid; u_tabua uuid; u_colher uuid; u_panela uuid;
  r record;
  tgt uuid;
begin
  -- 1) limpa fluxo anterior desta receita (idempotente)
  update sisub.recipe_step_input i set deleted_at = now()
    from sisub.recipe_step s where i.recipe_step_id = s.id and s.recipe_id = rid and i.deleted_at is null;
  update sisub.recipe_step_utensil u set deleted_at = now()
    from sisub.recipe_step s where u.recipe_step_id = s.id and s.recipe_id = rid and u.deleted_at is null;
  update sisub.recipe_step_output set deleted_at = now() where recipe_id = rid and deleted_at is null;
  update sisub.recipe_step set deleted_at = now() where recipe_id = rid and deleted_at is null;

  -- 2) utensílios (catálogo global) — upsert atômico. INSERT ... ON CONFLICT DO NOTHING
  -- evita a corrida TOCTOU do SELECT-then-INSERT (sem target, pega o índice parcial-único).
  insert into sisub.utensil(name) values ('Caldeirão') on conflict do nothing;
  select id into u_caldeirao from sisub.utensil where lower(name)=lower('Caldeirão') and kitchen_id is null and deleted_at is null limit 1;
  insert into sisub.utensil(name) values ('Faca de chef') on conflict do nothing;
  select id into u_faca from sisub.utensil where lower(name)=lower('Faca de chef') and kitchen_id is null and deleted_at is null limit 1;
  insert into sisub.utensil(name) values ('Tábua de corte') on conflict do nothing;
  select id into u_tabua from sisub.utensil where lower(name)=lower('Tábua de corte') and kitchen_id is null and deleted_at is null limit 1;
  insert into sisub.utensil(name) values ('Colher de pau') on conflict do nothing;
  select id into u_colher from sisub.utensil where lower(name)=lower('Colher de pau') and kitchen_id is null and deleted_at is null limit 1;
  insert into sisub.utensil(name) values ('Panela de refogar') on conflict do nothing;
  select id into u_panela from sisub.utensil where lower(name)=lower('Panela de refogar') and kitchen_id is null and deleted_at is null limit 1;

  -- 3) etapas
  insert into sisub.recipe_step(recipe_id,label,description,duration_minutes,canvas_x,canvas_y)
    values (rid,'Refogar temperos','Dourar alho e cebola, juntar tomate, pimentão e colorau formando a base aromática.',20,360,40) returning id into s_temperos;
  insert into sisub.recipe_step(recipe_id,label,description,duration_minutes,canvas_x,canvas_y)
    values (rid,'Preparar carnes','Dessalgar a carne seca, cortar e selar acém, bacon e calabresa.',45,360,210) returning id into s_carnes;
  insert into sisub.recipe_step(recipe_id,label,description,duration_minutes,canvas_x,canvas_y)
    values (rid,'Higienizar e cortar legumes','Lavar, descascar e cortar tubérculos, legumes e verduras em pedaços regulares.',30,360,380) returning id into s_legumes;
  insert into sisub.recipe_step(recipe_id,label,description,duration_minutes,canvas_x,canvas_y)
    values (rid,'Molhos e farinha','Reunir azeite, óleos, molhos, vinagre e farinha para acerto final e pirão.',10,360,560) returning id into s_molhos;
  insert into sisub.recipe_step(recipe_id,label,description,duration_minutes,canvas_x,canvas_y)
    values (rid,'Cozinhar e montar o cozido','Cozinhar carnes na base aromática, adicionar legumes em ordem de cocção e ajustar com molhos e farinha.',90,820,300) returning id into s_final;

  -- 4) saídas intermediárias (1 por etapa de preparo) + final
  insert into sisub.recipe_step_output(recipe_step_id,recipe_id,label,is_final) values (s_temperos,rid,'Base aromática',false) returning id into o_temperos;
  insert into sisub.recipe_step_output(recipe_step_id,recipe_id,label,is_final) values (s_carnes,rid,'Carnes seladas',false) returning id into o_carnes;
  insert into sisub.recipe_step_output(recipe_step_id,recipe_id,label,is_final) values (s_legumes,rid,'Legumes preparados',false) returning id into o_legumes;
  insert into sisub.recipe_step_output(recipe_step_id,recipe_id,label,is_final) values (s_molhos,rid,'Molhos e pirão',false) returning id into o_molhos;
  insert into sisub.recipe_step_output(recipe_step_id,recipe_id,label,quantity,measure_unit,is_final) values (s_final,rid,'Cozido à Pernambucana',100,'porções',true);

  -- 5) insumos crus → etapa por categoria (consumo integral = balanço ok)
  for r in
    select ri.id, ri.net_quantity, i.description, i.measure_unit
    from sisub.recipe_ingredients ri join sisub.ingredient i on i.id = ri.ingredient_id
    where ri.recipe_id = rid and ri.deleted_at is null
  loop
    if r.description ~* 'acém|carne|bacon|calabresa|linguiça|paio|charque' then
      tgt := s_carnes;
    elsif r.description ~* 'abóbora|batata|cenoura|chuchu|inhame|mandioca|aipim|macaxeira|maxixe|quiabo|couve|banana' then
      tgt := s_legumes;
    elsif r.description ~* 'alho|cebola|pimentão|tomate|colorau|colorífico|coentro|tempero|caldo de carne' then
      tgt := s_temperos;
    elsif r.description ~* 'azeite|óleo|oleo|margarina|catchup|molho|vinagre|farinha|sal' then
      tgt := s_molhos;
    else
      -- fallback p/ "Molhos e farinha", mas avisa: facilita pegar insumo mal-roteado
      -- quando o seed roda contra uma receita com nomes ligeiramente diferentes.
      tgt := s_molhos;
      raise notice 'Insumo não categorizado, atribuído a "Molhos e farinha": %', r.description;
    end if;
    insert into sisub.recipe_step_input(recipe_step_id,recipe_ingredient_id,quantity,measure_unit)
      values (tgt, r.id, r.net_quantity, r.measure_unit);
  end loop;

  -- 6) saídas das etapas de preparo → entram na montagem final
  insert into sisub.recipe_step_input(recipe_step_id,source_output_id) values (s_final,o_temperos);
  insert into sisub.recipe_step_input(recipe_step_id,source_output_id) values (s_final,o_carnes);
  insert into sisub.recipe_step_input(recipe_step_id,source_output_id) values (s_final,o_legumes);
  insert into sisub.recipe_step_input(recipe_step_id,source_output_id) values (s_final,o_molhos);

  -- 7) utensílios por etapa
  insert into sisub.recipe_step_utensil(recipe_step_id,utensil_id) values
    (s_temperos,u_panela),(s_temperos,u_colher),
    (s_legumes,u_faca),(s_legumes,u_tabua),
    (s_carnes,u_faca),(s_carnes,u_tabua),
    (s_final,u_caldeirao),(s_final,u_colher);
end $$;
