-- ============================================================================
-- RUMAER — seed parcial (5º e 7º Uniforme A) para validar o fluxo.
-- Restante dos uniformes é populado via CRUD admin.
-- Idempotente: peças via ON CONFLICT(slug); uniformes guardados por (numero, letra).
-- ============================================================================

-- ---- Catálogo de peças (idempotente por slug) ----
insert into rumaer.piece (nome, slug, tipo) values
	('Quepe', 'quepe', 'cabeca'),
	('Cobertura feminina', 'cobertura-feminina', 'cabeca'),
	('Túnica', 'tunica', 'torso'),
	('Camisa de manga longa', 'camisa-ml', 'torso'),
	('Camisa de manga curta', 'camisa-mc', 'torso'),
	('Calça', 'calca', 'pernas'),
	('Saia', 'saia', 'pernas'),
	('Sapato', 'sapato', 'calcado'),
	('Meia', 'meia', 'acessorio'),
	('Cinto', 'cinto', 'acessorio'),
	('Luvas', 'luvas', 'acessorio'),
	('Platina', 'platina', 'insignia'),
	('Distintivo de organização', 'distintivo-org', 'distintivo'),
	('Tarjeta de identificação', 'tarjeta', 'identificacao')
on conflict (slug) do nothing;

-- ---- Uniformes + variantes + categorias + composição ----
do $$
declare
	u5 uuid;
	u7 uuid;
	v_id uuid;
	-- helpers de peça
	p_quepe uuid := (select id from rumaer.piece where slug = 'quepe');
	p_cobf  uuid := (select id from rumaer.piece where slug = 'cobertura-feminina');
	p_tunica uuid := (select id from rumaer.piece where slug = 'tunica');
	p_caml  uuid := (select id from rumaer.piece where slug = 'camisa-ml');
	p_camc  uuid := (select id from rumaer.piece where slug = 'camisa-mc');
	p_calca uuid := (select id from rumaer.piece where slug = 'calca');
	p_saia  uuid := (select id from rumaer.piece where slug = 'saia');
	p_sapato uuid := (select id from rumaer.piece where slug = 'sapato');
	p_meia  uuid := (select id from rumaer.piece where slug = 'meia');
	p_cinto uuid := (select id from rumaer.piece where slug = 'cinto');
	p_luvas uuid := (select id from rumaer.piece where slug = 'luvas');
	p_platina uuid := (select id from rumaer.piece where slug = 'platina');
	p_distintivo uuid := (select id from rumaer.piece where slug = 'distintivo-org');
	p_tarjeta uuid := (select id from rumaer.piece where slug = 'tarjeta');
begin
	-- =========================== 5º Uniforme A ===========================
	if not exists (select 1 from rumaer.uniform where numero = 5 and letra = 'A') then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, eq_mb, eq_eb, eq_civil, ordem, descricao_md)
		values (5, 'A', '5º Uniforme A', 'representacao', 'passeio_completo', 'passeio completo', 'Art. 24',
			'1º Uniforme (Marinha)', 'Tropa A (Exército)', 'passeio_completo', 50,
			'Uniforme de passeio completo, usado em solenidades e ocasiões de representação.')
		returning id into u5;

		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u5, 'oficiais'), (u5, 'suboficiais'), (u5, 'sargentos');

		-- Variante oficiais masculino
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem)
		values (u5, 'oficiais', 'masculino', null, 0) returning id into v_id;
		insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem) values
			(v_id, p_quepe, 'obrigatorio', null, 0),
			(v_id, p_tunica, 'obrigatorio', null, 1),
			(v_id, p_caml, 'obrigatorio', null, 2),
			(v_id, p_calca, 'obrigatorio', null, 3),
			(v_id, p_sapato, 'obrigatorio', null, 4),
			(v_id, p_meia, 'obrigatorio', 'meia preta', 5),
			(v_id, p_cinto, 'obrigatorio', null, 6),
			(v_id, p_platina, 'obrigatorio', 'conforme posto e quadro', 7),
			(v_id, p_tarjeta, 'obrigatorio', null, 8),
			(v_id, p_luvas, 'facultativo', 'em clima frio', 9),
			(v_id, p_distintivo, 'eventual', 'conforme designação', 10);

		-- Variante oficiais feminino (saia + cobertura feminina)
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem)
		values (u5, 'oficiais', 'feminino', null, 1) returning id into v_id;
		insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem) values
			(v_id, p_cobf, 'obrigatorio', null, 0),
			(v_id, p_tunica, 'obrigatorio', null, 1),
			(v_id, p_caml, 'obrigatorio', null, 2),
			(v_id, p_saia, 'obrigatorio', null, 3),
			(v_id, p_sapato, 'obrigatorio', 'scarpin preto', 4),
			(v_id, p_platina, 'obrigatorio', 'conforme posto e quadro', 5),
			(v_id, p_tarjeta, 'obrigatorio', null, 6),
			(v_id, p_luvas, 'facultativo', 'em clima frio', 7);

		-- Variante oficiais feminino gestante
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem)
		values (u5, 'oficiais', 'feminino', 'gestante', 2) returning id into v_id;
		insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem) values
			(v_id, p_cobf, 'obrigatorio', null, 0),
			(v_id, p_caml, 'obrigatorio', 'modelo gestante', 1),
			(v_id, p_saia, 'obrigatorio', 'modelo gestante', 2),
			(v_id, p_sapato, 'obrigatorio', null, 3),
			(v_id, p_tarjeta, 'obrigatorio', null, 4);
	end if;

	-- =========================== 7º Uniforme A ===========================
	if not exists (select 1 from rumaer.uniform where numero = 7 and letra = 'A') then
		insert into rumaer.uniform (numero, letra, nome, grupo, subgrupo, traje, art_referencia, eq_mb, eq_eb, eq_civil, ordem, descricao_md)
		values (7, 'A', '7º Uniforme A', 'servicos', 'passeio', 'passeio', 'Art. 26',
			'3º Uniforme (Marinha)', 'Tropa B (Exército)', 'passeio', 70,
			'Uniforme de passeio para expediente e serviços administrativos.')
		returning id into u7;

		insert into rumaer.uniform_category (uniform_id, categoria) values
			(u7, 'oficiais'), (u7, 'sargentos'), (u7, 'suboficiais');

		-- oficiais masculino
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem)
		values (u7, 'oficiais', 'masculino', null, 0) returning id into v_id;
		insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem) values
			(v_id, p_quepe, 'obrigatorio', null, 0),
			(v_id, p_camc, 'obrigatorio', null, 1),
			(v_id, p_calca, 'obrigatorio', null, 2),
			(v_id, p_sapato, 'obrigatorio', null, 3),
			(v_id, p_cinto, 'obrigatorio', null, 4),
			(v_id, p_platina, 'obrigatorio', 'conforme posto', 5),
			(v_id, p_tarjeta, 'obrigatorio', null, 6);

		-- oficiais feminino
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem)
		values (u7, 'oficiais', 'feminino', null, 1) returning id into v_id;
		insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem) values
			(v_id, p_cobf, 'obrigatorio', null, 0),
			(v_id, p_camc, 'obrigatorio', null, 1),
			(v_id, p_saia, 'obrigatorio', null, 2),
			(v_id, p_sapato, 'obrigatorio', 'scarpin preto', 3),
			(v_id, p_platina, 'obrigatorio', 'conforme posto', 4),
			(v_id, p_tarjeta, 'obrigatorio', null, 5);

		-- sargentos masculino
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem)
		values (u7, 'sargentos', 'masculino', null, 2) returning id into v_id;
		insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem) values
			(v_id, p_quepe, 'obrigatorio', null, 0),
			(v_id, p_camc, 'obrigatorio', null, 1),
			(v_id, p_calca, 'obrigatorio', null, 2),
			(v_id, p_sapato, 'obrigatorio', null, 3),
			(v_id, p_cinto, 'obrigatorio', null, 4),
			(v_id, p_distintivo, 'obrigatorio', 'graduação', 5),
			(v_id, p_tarjeta, 'obrigatorio', null, 6);

		-- sargentos feminino
		insert into rumaer.uniform_variant (uniform_id, circulo, genero, sub_variacao, ordem)
		values (u7, 'sargentos', 'feminino', null, 3) returning id into v_id;
		insert into rumaer.uniform_variant_piece (variant_id, piece_id, obrigatoriedade, observacao, ordem) values
			(v_id, p_cobf, 'obrigatorio', null, 0),
			(v_id, p_camc, 'obrigatorio', null, 1),
			(v_id, p_saia, 'obrigatorio', null, 2),
			(v_id, p_sapato, 'obrigatorio', 'scarpin preto', 3),
			(v_id, p_distintivo, 'obrigatorio', 'graduação', 4),
			(v_id, p_tarjeta, 'obrigatorio', null, 5);
	end if;
end $$;
