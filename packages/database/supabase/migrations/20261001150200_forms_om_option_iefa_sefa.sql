-- forms_om_option_iefa_sefa
-- A OM da resposta passa a ser validada contra `forms.om_option` ativo (apps/forms,
-- `getOrCreateResponseSessionFn`), e a opção "Outro…" de texto livre sai da tela.
--
-- Por quê: o escopo dos visualizadores (`response_viewer_scope_binding`, atributo `om`) filtra
-- respostas pela OM que o RESPONDENTE declara. Texto livre deixava a resposta fora de qualquer
-- escopo por erro de digitação e aceitava qualquer string na coluna que decide quem vê o quê.
--
-- As duas OMs que já chegaram por "Outro…" em produção (conferido em 2026-10-01: SEFA 3
-- respostas, IEFA 2) entram na lista, para quem as usa continuar respondendo. Dado de
-- referência, não de acesso. Idempotente.

insert into forms.om_option (name, sort_order) values
	('IEFA', 30),
	('SEFA', 31)
on conflict (name) do nothing;
