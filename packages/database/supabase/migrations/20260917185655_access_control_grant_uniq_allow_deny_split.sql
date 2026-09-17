-- Corrige a unicidade do grant inline: UM índice geral vira DOIS parciais, allow e deny.
--
-- ## O que o índice geral quebrou
--
-- `user_permissions_grant_uniq` (20260917183328) impôs uma linha por
-- (user_id, module, mess_hall_id, kitchen_id, unit_id). Isso fecha a duplicata — mas
-- fecha junto um recurso que o modelo TEM e usa: o **deny sobre allow**.
--
-- `resolveEffectivePermissions` (@iefa/pbac) trata `level <= 0` como PRECEDÊNCIA, não
-- como ausência, e a precedência só significa alguma coisa se o deny e o allow puderem
-- coexistir na MESMA chave — é assim que se nega um módulo a quem tem o allow, sem
-- apagar o allow, e é assim que um deny com prazo nega temporariamente e some sozinho
-- quando vence. A suíte de integração do sisub fixa exatamente isso, semeando duas
-- linhas `global` para o mesmo usuário:
--
--   "deny EXPIRADO deixa de negar — expirar é sumir, não bloquear"  (level 0 vencido + level 2)
--   "deny VIGENTE continua negando"                                 (level 0 no futuro + level 2)
--
-- Com o índice geral, a segunda linha de cada par vira 23505: o recurso deixa de ser
-- representável no banco, e os dois testes passam a falhar. A unicidade estava certa;
-- a CHAVE é que estava errada — ela ignorava que allow e deny são duas afirmações
-- diferentes sobre o mesmo grant, e não duas versões da mesma.
--
-- ## A chave certa
--
-- Dois índices únicos PARCIAIS sobre a mesma tupla, particionando a tabela pelo sinal
-- do nível — um allow e um deny por grant, nunca dois de cada:
--
--   user_permissions_allow_uniq  where level > 0
--   user_permissions_deny_uniq   where level <= 0
--
-- Os dois com `nulls not distinct`, que é o que faz as colunas de escopo nulas contarem
-- como iguais (sem isso, `NULL <> NULL` deixa todo grant global passar). A exigência do
-- mantenedor continua atendida na íntegra: **nenhum módulo e nenhum escopo admite grant
-- duplicado**, em nenhum dos dois sinais. O que volta a ser possível é o par
-- allow + deny, que nunca foi duplicata — é a negação de um acesso existente.
--
-- Os predicados são `> 0` e `<= 0`, e não `> 0` e `= 0`, de propósito: juntos eles
-- cobrem a coluna INTEIRA. `level` é `integer` sem CHECK, e `resolveEffectivePermissions`
-- já lê qualquer `level <= 0` como deny — com `= 0` um `level = -1` cairia fora dos dois
-- índices e ficaria sem garantia nenhuma, que é exatamente o buraco que este PR fecha.
--
-- ## Consequência conhecida de reproduzir o histórico
--
-- Em banco NOVO (local/staging), a consolidação de 20260917183328 roda antes desta
-- migração e colapsa em uma linha só cada chave duplicada — inclusive um par
-- allow + deny, se houver. Isso é lossy por ser história: a partir daqui o par volta a
-- ser gravável, e em produção o caso não existiu (0 linhas com `level <= 0` no momento
-- em que aquela migração rodou).

-- ─── 1. Os dois parciais entram ANTES de o geral sair ────────────────────────
-- Nesta ordem a tabela nunca fica sem proteção: enquanto o geral existe ele é mais
-- estrito que os dois juntos, então criar primeiro não pode falhar por dado existente.
create unique index if not exists user_permissions_allow_uniq
on access_control.user_permissions (user_id, module, mess_hall_id, kitchen_id, unit_id)
nulls not distinct
where level > 0;

create unique index if not exists user_permissions_deny_uniq
on access_control.user_permissions (user_id, module, mess_hall_id, kitchen_id, unit_id)
nulls not distinct
where level <= 0;

-- ─── 2. O geral sai ──────────────────────────────────────────────────────────
-- Ele não é mais "a garantia": é só o que impede o deny de coexistir com o allow.
drop index if exists access_control.user_permissions_grant_uniq;
