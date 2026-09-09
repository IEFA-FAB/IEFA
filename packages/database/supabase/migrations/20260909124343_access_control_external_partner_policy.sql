-- Política gerenciada "Conjunto Parceiro Externo" — leitura do catálogo global, nada além.
--
-- Motivo: parceiros institucionais fora da FAB (GS1 Brasil, no primeiro caso) precisam
-- CONSULTAR o catálogo de insumos e receitas sem qualquer poder de escrita. O "Conjunto
-- Treino" não serve para isso: ele concede unit:2, kitchen:2, kitchen-production:2,
-- messhall:2 e local-analytics:2 — é um sandbox de escrita, não um acesso de leitura.
--
-- `global` nível 1 é exatamente a fronteira certa: todas as telas de escrita do catálogo
-- (receita nova, edição de receita, plano semanal, equipamentos, locais, política de
-- revisão) exigem `global` nível 2 no `beforeLoad`, e as operações de domínio exigem o
-- mesmo no servidor.
--
-- `managed = true`: a política não é editável pela UI. Sem isso, alguém poderia elevar o
-- statement para nível 2 no console e transformar o acesso de parceiro em escrita no
-- catálogo de produção — mesma proteção que o "Conjunto Treino" já tem.
--
-- DDL idempotente (reaplicável por db:push ou MCP apply_migration).

-- ─── Política ────────────────────────────────────────────────────────────────

insert into access_control.policy (name, description, managed)
select
	'Conjunto Parceiro Externo',
	'Parceiro institucional externo à FAB: leitura do catálogo global (insumos, receitas, planos semanais, preparações congeladas e filas de revisão). Nenhuma escrita, nenhum escopo de unidade, cozinha ou refeitório.',
	true
where not exists (
	select 1 from access_control.policy
	where name = 'Conjunto Parceiro Externo' and deleted_at is null
);

-- ─── Statement único: global nível 1, sem escopo ─────────────────────────────

insert into access_control.policy_statement (policy_id, module, level)
select p.id, 'global', 1
from access_control.policy p
where p.name = 'Conjunto Parceiro Externo'
	and p.deleted_at is null
	and not exists (
		select 1 from access_control.policy_statement s
		where s.policy_id = p.id and s.module = 'global'
	);

-- ─── Anexo dos parceiros da GS1 Brasil ───────────────────────────────────────
-- Resolvido por e-mail em vez de UUID: o id do usuário difere entre ambientes e um
-- hard-code apontaria para outra pessoa fora de produção. Quem não existe não é anexado —
-- a migration não falha, e reaplicá-la depois da criação da conta completa o anexo.
-- `lower(email)` porque o cadastro normaliza o e-mail para minúsculas.

insert into access_control.user_policy_attachment (user_id, policy_id)
select u.id, p.id
from auth.users u
cross join access_control.policy p
where p.name = 'Conjunto Parceiro Externo'
	and p.deleted_at is null
	and lower(u.email) in ('leonardo.nunes@gs1br.org', 'pedro.ferreira@gs1br.org')
on conflict (user_id, policy_id) do nothing;
