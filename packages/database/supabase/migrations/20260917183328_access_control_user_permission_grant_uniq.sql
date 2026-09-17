-- Unicidade GERAL do grant inline em `access_control.user_permissions` — qualquer
-- módulo, qualquer escopo.
--
-- ## O defeito
--
-- `grantUnscopedModulePermission` (@iefa/pbac) concede com update-first → insert →
-- retry no 23505. O retry é o que fecha a corrida entre dois administradores
-- concedendo ao mesmo usuário no mesmo instante — e ele SÓ existe se o banco recusar
-- o segundo insert. Até aqui, a recusa vinha de dois índices únicos PARCIAIS:
--
--   user_permissions_rumaer_global_uniq (20260704140000) — só `module = 'rumaer'`
--   user_permissions_sucont_global_uniq (20260705190000) — só `module = 'sucont'`
--
-- Todo o resto da tabela compartilhada ficou sem garantia nenhuma: os quatro módulos
-- que substituíram o `sucont` no split (20260910184943 — `sucont-1`, `sucont-3`,
-- `sucont-4`, `sucont-admin`; o `sucont` do índice antigo não é mais lido por
-- ninguém), os módulos do sisub (`global`, `admin`, `kitchen`, `messhall`, `unit`,
-- `analytics`, `storage`, `kitchen-production`, `local-analytics`, `diner`) e os do
-- Projeto α. Sem índice, a corrida não estoura 23505: ela grava DUAS linhas. Revogar
-- apaga uma, a outra continua concedendo — o acesso "revogado" segue de pé, e a
-- pessoa aparece duas vezes nas telas de acesso.
--
-- Quatro pares já existiam em produção quando esta migração foi escrita — em
-- `analytics`, `kitchen-production`, `storage` e `unit`, todos globais, nenhum deles
-- alcançado pelos dois índices parciais. Um par tinha NÍVEIS DIFERENTES (3 e 2), que é
-- o caso em que a duplicata deixa de ser só cosmética: apagar a linha "certa" rebaixa
-- o acesso sem que ninguém peça.
--
-- E não é só o grant global. `createUserPermission` (@iefa/sisub-domain) insere direto,
-- com escopo (`unit_id`/`kitchen_id`/`mess_hall_id`) e sem checar nada — dois cliques
-- no diálogo gravam duas linhas. Por isso a unicidade aqui é pela CHAVE INTEIRA, o
-- escopo incluído, e não só pelo grant unscoped.
--
-- ## A consolidação, e por que ela não mexe em quem pode o quê
--
-- As duplicatas existentes colapsam numa linha só, a MAIS ANTIGA do grupo (o `id` dela
-- é o que as telas e a trilha de auditoria já citam). O conteúdo que sobra é escolhido
-- para preservar exatamente a decisão que `resolveEffectivePermissions` (@iefa/pbac) já
-- toma hoje sobre o grupo — ninguém ganha nem perde acesso ao rodar isto:
--
--   - `level` — se QUALQUER linha do grupo é deny (`level <= 0`), o deny sobrevive:
--     é a precedência de deny da resolução, e colapsar para o maior nível transformaria
--     uma negação vigente em concessão. Não havendo deny, sobrevive o MAIOR nível, que
--     é o que a resolução já emite (a fase 2 colapsa por módulo+escopo pelo maior
--     nível). Nenhum dos quatro grupos de hoje tem deny — o ramo existe pela
--     idempotência;
--   - `expires_at` — sobrevive o prazo mais LONGO (`null`, que é "nunca expira", vence
--     qualquer data; entre datas, a maior). Para um allow é o acesso que o usuário de
--     fato tem hoje; para um deny é a negação que de fato vigora. Nos dois casos a
--     escolha é a conservadora: a resolução ignora linha vencida, então encurtar o
--     prazo aqui revogaria em silêncio.
--
-- ## `policy_statement` e `user_policy_attachment` — por que NÃO ganham índice aqui
--
-- `user_policy_attachment` JÁ tem `user_policy_attachment_unique (user_id, policy_id)`:
-- a invariante existe, e não há duplicata. Nada a fazer.
--
-- `policy_statement` fica de fora de propósito, e não por esquecimento:
--
--   1. duplicata ali não muda decisão de autorização. `resolveEffectivePermissions`
--      colapsa os statements por (módulo, escopo) pelo maior nível, e os denies entram
--      num `Set` — duas linhas idênticas resolvem igual a uma. Em `user_permissions` é
--      o contrário: a duplicata é justamente o que faz a REVOGAÇÃO não revogar;
--   2. não existe ali o caminho de escrita que produz a duplicata. O statement é criado
--      explicitamente pelo console de políticas, tem id próprio, aparece na lista e é
--      editado/removido POR id. Não há upsert por chave natural correndo com outro
--      administrador, que é a corrida que o 23505 fecha do lado do grant inline;
--   3. e a checagem foi feita: 0 duplicatas em `policy_statement` (por policy_id +
--      módulo + escopo, com e sem o nível) e 0 em `user_policy_attachment`.
--
-- Se algum dia o console de políticas ganhar um "conceder módulo X à política Y"
-- idempotente — upsert por chave natural, como o do grant inline —, o mesmo índice
-- passa a valer lá, pelo mesmo motivo.
--
-- ## Forma
--
-- Índice, e não constraint, porque `add constraint` não tem `if not exists` e esta
-- migração precisa ser reaplicável. `nulls not distinct` (Postgres 15+; o banco está
-- no 17.4) é o que faz o índice enxergar as colunas de escopo nulas como IGUAIS — sem
-- ele, `NULL <> NULL` deixaria todo grant global passar, que é exatamente a razão de os
-- índices de 2026-07 terem nascido parciais.

-- ─── 1. Consolida as duplicatas existentes ───────────────────────────────────
-- Duas janelas de propósito: `w_ord` ordena para eleger o sobrevivente (`row_number`),
-- e `w_all` fica SEM `order by` para que os agregados enxerguem o grupo INTEIRO — uma
-- janela ordenada traz o frame default (até a linha corrente) e transformaria
-- `max(level)`/`bool_or(...)` em agregado corrente, elegendo o conteúdo errado.
with grupo as (
	select
		id,
		row_number() over w_ord as posicao,
		count(*) over w_all as linhas,
		min(level) over w_all as menor_nivel,
		max(level) over w_all as maior_nivel,
		bool_or(expires_at is null) over w_all as tem_permanente,
		max(expires_at) over w_all as prazo_mais_longo
	from access_control.user_permissions
	window
		w_ord as (partition by user_id, module, mess_hall_id, kitchen_id, unit_id order by created_at asc, id asc),
		w_all as (partition by user_id, module, mess_hall_id, kitchen_id, unit_id)
),
-- CTE que modifica dados roda mesmo sem ser referenciada — é ela que aplica o conteúdo
-- consolidado na linha que fica, antes de o delete abaixo remover as demais. As duas
-- enxergam o MESMO snapshot e atuam sobre ids disjuntos (posicao = 1 × posicao > 1).
sobrevivente as (
	update access_control.user_permissions p
	set
		level = case when g.menor_nivel <= 0 then g.menor_nivel else g.maior_nivel end,
		expires_at = case when g.tem_permanente then null else g.prazo_mais_longo end
	from grupo g
	where p.id = g.id
		and g.linhas > 1
		and g.posicao = 1
	returning p.id
)
delete from access_control.user_permissions p
using grupo g
where p.id = g.id
	and g.linhas > 1
	and g.posicao > 1;

-- ─── 2. A garantia geral ─────────────────────────────────────────────────────
create unique index if not exists user_permissions_grant_uniq
on access_control.user_permissions (user_id, module, mess_hall_id, kitchen_id, unit_id)
nulls not distinct;

-- ─── 3. Os dois parciais viram redundância ───────────────────────────────────
-- Qualquer par de linhas que violasse um deles viola o índice geral: mesmo `user_id`,
-- mesmo `module` (fixo no predicado) e os três escopos nulos — que o `nulls not
-- distinct` agora compara como iguais. Mantê-los custaria duas escritas de índice por
-- grant de rumaer/sucont e deixaria a impressão de que a unicidade daqueles dois
-- módulos vem de outro lugar.
drop index if exists access_control.user_permissions_rumaer_global_uniq;
drop index if exists access_control.user_permissions_sucont_global_uniq;
