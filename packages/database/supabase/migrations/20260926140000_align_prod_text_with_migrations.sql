-- Texto de produção alinhado ao que as migrations do repositório gravam. Sem efeito em schema,
-- permissão ou comportamento: é descrição e comentário.
--
-- Auditoria de 2026-09-26 (histórico remoto × arquivos da `main`, e o catálogo de produção ×
-- o estado final do replay). Tudo o que as migrations definem está em produção; divergia só isto:
--
--   * "Conjunto Parceiro Externo" (`access_control.policy`): a política já existia quando
--     20260909124343 rodou, e o ramo `else` daquele arquivo só marca `managed` — a descrição
--     ficou sem o " Gerenciada: não editável." que um banco novo recebe;
--   * comentário de `access_control.change_module_permission(...)`: produção cita
--     "20260919005526", versão que não existe (o texto aplicado era de um rascunho); o arquivo
--     20260919010255 cita a si mesmo;
--   * comentários de `rumaer.uniform_variant{,_image}.blur_placeholder`: produção tem o texto
--     sem acentos ("<=32px", "previa") de uma aplicação anterior à revisão do arquivo.
--
-- `access_control.policy` é tabela vigiada (20260921130100): escrita fora de função auditada
-- levanta ACCESS_CHANGE_UNAUDITED, e migration abre o bypass na própria transação. A troca de
-- descrição não concede nem revoga nada, então não há linha de sensitive_operation_log.
--
-- APLICADA em 2026-09-26, antes do merge, em transação única com o
-- `INSERT INTO supabase_migrations.schema_migrations (version, name)` no timestamp exato deste
-- arquivo. Idempotente: num banco novo a descrição já nasce certa e o `update` não casa nada.

select set_config('iefa.audit_bypass', 'align policy description with 20260909124343', true);

update access_control.policy
set description = 'Parceiro institucional externo à FAB: leitura do catálogo global (insumos, receitas, planos semanais, preparações congeladas e filas de revisão). Nenhuma escrita, nenhum escopo de unidade, cozinha ou refeitório. Gerenciada: não editável.',
	updated_at = now()
where name = 'Conjunto Parceiro Externo'
	and deleted_at is null
	and managed
	and description = 'Parceiro institucional externo à FAB: leitura do catálogo global (insumos, receitas, planos semanais, preparações congeladas e filas de revisão). Nenhuma escrita, nenhum escopo de unidade, cozinha ou refeitório.';

comment on function access_control.change_module_permission(uuid, text, text, uuid, text, integer, bigint, bigint, bigint, timestamptz, text, text) is
	'Concede (upsert na partição allow OU deny, devolvendo deny_present) ou revoga (a partição pedida: allow, deny ou all) um grant inline e grava a linha em sensitive_operation_log na MESMA transação. SECURITY INVOKER, só service_role; o ator (p_actor) tem de ser a sessão — a garantia é do app. Ver 20260918130335 e 20260919010255.';

comment on column rumaer.uniform_variant.blur_placeholder is
	'LQIP da imagem base: data URL PNG (thumbhash ≤32px) gerado por Bun.Image#placeholder(). Null = sem prévia, cai no estado de carregamento.';
comment on column rumaer.uniform_variant_image.blur_placeholder is
	'LQIP da imagem alternativa (look): data URL PNG (thumbhash ≤32px) gerado por Bun.Image#placeholder(). Null = sem prévia.';
