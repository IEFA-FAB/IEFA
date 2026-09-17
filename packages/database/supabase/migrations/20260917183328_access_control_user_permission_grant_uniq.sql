-- Unicidade GERAL do grant inline em `access_control.user_permissions` — qualquer
-- módulo, qualquer escopo.
--
-- SUPERSEDIDA EM PARTE por 20260917185655: o índice único GERAL criado aqui impedia o
-- deny (`level <= 0`) de coexistir com o allow na mesma chave, e a migração seguinte o
-- troca por dois parciais (`user_permissions_allow_uniq` e `user_permissions_deny_uniq`).
-- O diagnóstico e a consolidação abaixo continuam valendo; a forma do índice, não.
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
-- ## A consolidação: uma LINHA vence, não um conteúdo montado
--
-- As duplicatas colapsam numa linha só, e a linha que fica é eleita por ORDEM — `level`
-- e `expires_at` saem sempre da MESMA linha vencedora. Isso é o ponto: agregar os dois
-- campos de forma independente (o maior nível de uma linha, o prazo mais permissivo de
-- outra) fabrica uma concessão que nunca existiu — (nível 1, sem prazo) somado a
-- (nível 2, vence em outubro) viraria nível 2 PERMANENTE, escalada silenciosa; e um deny
-- com prazo sobre um allow permanente viraria deny permanente.
--
-- Antes da ordem, a PARTIÇÃO: ela inclui o SINAL do nível (`level > 0`). Allow e deny da
-- mesma chave são grupos SEPARADOS, e cada um elege o seu sobrevivente — um deny vigente
-- não elimina o allow que convive com ele. É o par que a migração seguinte
-- (20260917185655) volta a permitir com os dois índices parciais; colapsá-lo aqui
-- destruiria justamente o que ela restaura.
--
-- A ordem DENTRO de cada grupo, e o que cada chave protege:
--
--   1. linha VIVA antes de linha vencida — a vencida não concede nem nega nada hoje, e
--      deixá-la vencer a eleição apagaria a linha que está em vigor (é o caso que o teste
--      "deny EXPIRADO deixa de negar" fixa);
--   2. linha PERMANENTE (`expires_at is null`) antes do maior nível — e esta ordem é
--      deliberada. Entre uma elevação com prazo (nível 2 até outubro) e o acesso base
--      permanente (nível 1 sem prazo), manter a elevação apagaria a linha que sustenta o
--      acesso DEPOIS de outubro: quando o prazo vencesse, a pessoa perderia o módulo
--      inteiro em vez de cair para a base — e, com o índice novo, o par não é recriável
--      sozinho. Entre perder a elevação temporária e perder o acesso base, perder a
--      elevação é o erro REVERSÍVEL (um administrador reconcede em um clique);
--   3. MAIOR nível — desempate entre linhas de mesma permanência; é o que a fase 2 da
--      resolução já emite por (módulo, escopo);
--   4. prazo mais LONGO — desempate entre linhas com prazo;
--   5. mais ANTIGA (`created_at`, `id`) — desempate estável, e mantém o `id` que as
--      telas e a trilha de auditoria já citam quando as linhas são equivalentes.
--
-- Nota histórica, e é fato verificado, não suposição: a versão desta migração APLICADA
-- em produção agregava `level` e `expires_at` de forma independente. Lá isso foi
-- inofensivo porque no momento em que ela rodou a tabela não tinha NENHUMA linha com
-- `expires_at` nem NENHUMA com `level <= 0` — os quatro grupos eram allows permanentes,
-- e no único par de níveis diferentes (3 e 2) o nível maior já estava na linha mais
-- antiga. A ordem acima elege exatamente as mesmas quatro linhas sobreviventes; a
-- correção existe para quando este arquivo rodar em banco NOVO (local/staging).
--
-- Consequência conhecida de reproduzir o histórico num banco que JÁ TEM dados: a
-- consolidação preserva o par allow + deny (a partição separa os dois), mas o índice
-- GERAL criado logo abaixo não o aceita — o `create unique index` falharia com 23505 e a
-- migração pararia ali. É o comportamento preferível entre os dois possíveis: parar com
-- erro visível é recuperável (a migração seguinte, 20260917185655, troca o índice pelos
-- dois parciais e o par passa a caber), enquanto apagar o deny para caber no índice seria
-- perda silenciosa de uma decisão de acesso explícita. Em banco NOVO a questão não se
-- coloca — não há linha nenhuma neste ponto — e em produção não se colocou: 0 linhas com
-- `level <= 0` quando esta migração rodou.
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
-- Nenhum `update`: a linha vencedora já CARREGA o nível e o prazo que devem sobreviver,
-- porque ela é eleita pela ordem abaixo. Só as perdedoras são removidas.
--
-- Duas janelas de propósito: `w_ord` ordena para eleger (`row_number`), e `w_all` fica
-- SEM `order by` para que `count(*)` enxergue o grupo INTEIRO — uma janela ordenada traz
-- o frame default (até a linha corrente) e contaria errado.
--
-- `now()` é o do Postgres, e não um instante calculado em JS: é o mesmo relógio que a
-- resolução usa para decidir o que está vencido.
with grupo as (
	select
		id,
		row_number() over w_ord as posicao,
		count(*) over w_all as linhas
	from access_control.user_permissions
	window
		w_ord as (
			-- A partição inclui o SINAL do nível: allow e deny são grupos separados, e cada
			-- um mantém o seu — o deny não elimina o allow com que convive.
			partition by user_id, module, mess_hall_id, kitchen_id, unit_id, (level > 0)
			order by
				-- 1. linha viva antes de linha vencida
				(expires_at is null or expires_at > now()) desc,
				-- 2. PERMANENTE antes do maior nível: perder a elevação temporária é
				--    reversível; perder o acesso base quando o prazo vencer, não
				(expires_at is null) desc,
				-- 3. maior nível
				level desc,
				-- 4. prazo mais longo, entre as que têm prazo
				expires_at desc,
				-- 5. desempate estável: a mais antiga
				created_at asc,
				id asc
		),
		w_all as (partition by user_id, module, mess_hall_id, kitchen_id, unit_id, (level > 0))
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
