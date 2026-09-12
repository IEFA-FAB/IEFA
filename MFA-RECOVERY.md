# MFA — recuperação de conta e o procedimento de último recurso

Quem perdeu o segundo fator tem quatro caminhos, nesta ordem. Cada um só existe porque o
anterior pode não estar disponível, e o último — o dashboard do Supabase — é o único que sai
da aplicação e, por isso, o único que não deixa rastro sozinho.

| # | Caminho | Quem executa | Deixa rastro |
|---|---------|--------------|--------------|
| 1 | **Dispositivo reserva** | o próprio titular | — (não há remoção) |
| 2 | **Código de recuperação** | o próprio titular | `mfa_reset_log` (`recovery-code`) + `sensitive_operation_log` |
| 3 | **Reset administrativo** (`/admin/permissions`) | `admin` nível 3, em elevação `fresh` | `mfa_reset_log` (`admin-reset`) + `sensitive_operation_log` |
| 4 | **Dashboard do Supabase** | quem tem acesso ao projeto | **nenhum automático** — o registro é manual, e está descrito abaixo |

Conta **protegida** (a que alcança operação classificada como `session`/`fresh`) não dispõe
do caminho 2: para ela os caminhos são o dispositivo reserva e o reset administrativo. A
regra é derivada do registro de classificação
(`apps/sisub/src/server/assurance-registry.ts`), nunca de um número de nível.

## Quando o caminho 4 é o único que sobra

Três situações, e só elas:

1. **Nenhum `admin` nível 3 consegue entrar.** O administrador também perdeu o dispositivo, e
   o reset administrativo exige que ele prove a própria identidade — é a trava funcionando,
   não um defeito.
2. **Só existe um `admin` nível 3 e ele é o titular bloqueado.** A tela recusa o reset da
   própria conta de propósito: `admin-reset` significa *alguém removeu o fator de alguém*, e
   o autoatendimento por esse caminho apagaria essa distinção da auditoria.
3. **O GoTrue recusa a remoção pela aplicação** (fator em estado inconsistente, erro do
   provedor). Raro, e o sintoma é a operação falhar com erro do GoTrue, não passar em silêncio.

Fora dessas três, use o caminho 3. O dashboard não pede justificativa, não confere nada e não
escreve linha nenhuma nos logs de auditoria — ele é uma porta de manutenção, não um
procedimento.

## Quem tem acesso ao dashboard

Requisitos, e nenhum deles é negociável caso a caso:

- **Mais de uma pessoa.** Uma só é um ponto único de falha em que o próprio procedimento de
  socorro some junto com a pessoa (férias, missão, desligamento). Duas, no mínimo, e elas
  precisam saber uma da outra.
- **Cada uma com MFA próprio ativo na conta do Supabase.** Quem tem acesso ao dashboard remove
  o segundo fator de qualquer conta do ERP e lê o banco inteiro: uma conta de dashboard sem
  segundo fator é a chave mestra guardada debaixo do tapete. O MFA se configura no perfil da
  conta do Supabase, não no projeto.
- **Acesso nominal, nunca compartilhado.** Um login de equipe torna "quem removeu" uma
  pergunta sem resposta — exatamente o que o `mfa_reset_log` existe para responder.
- **Revisão de membros do projeto a cada saída de pessoal.** Quem deixa a equipe sai do
  projeto no mesmo ato, sem esperar rotina.

Este documento não nomeia as pessoas: o repositório é público, e uma lista nominal de quem
detém a chave mestra é reconhecimento pronto para quem for atacar. A lista vive no cadastro de
membros do próprio projeto no Supabase, que é a fonte autoritativa de qualquer forma.

## Procedimento

**Antes de abrir o dashboard**, confirme a identidade do titular por canal que **não** seja o
e-mail — pessoalmente, por telefone conhecido ou pela chefia imediata. Se o adversário já tem
a caixa de e-mail da pessoa (o cenário em que o segundo fator é a última defesa), confirmar
por e-mail é confirmar com o adversário.

1. Dashboard do Supabase → projeto do IEFA → **Authentication → Users**.
2. Localize o usuário pelo e-mail e abra o registro dele.
3. Na seção de fatores de MFA, remova **todos** os fatores listados, inclusive os não
   verificados — um cadastro abandonado ocupa o nome do dispositivo e atrapalha o recadastro.
4. Remover um fator verificado **encerra todas as sessões do titular**. É o efeito desejado:
   se a conta estava comprometida, a sessão do adversário cai junto.
5. **Registre a remoção à mão** (passo obrigatório, detalhado abaixo).
6. Avise o titular pelo mesmo canal em que a identidade foi confirmada, e oriente o recadastro
   no primeiro acesso: `https://sisub.iefa.com.br/diner/security`.

### O registro manual, e por que ele não é opcional

A aplicação grava duas linhas em toda remoção de segundo fator. O dashboard não grava
nenhuma. Sem o registro manual, a conta aparece sem fator e **não existe resposta** para
"como ela ficou assim" — que é a única pergunta que a auditoria vai fazer.

No **SQL Editor** do mesmo dashboard, com os dois `uuid` preenchidos:

```sql
insert into access_control.mfa_reset_log (target_user_id, performed_by, method, reason)
values (
  '<uuid-do-titular>',
  '<uuid-de-quem-executou>',
  'admin-reset',
  'Removido pelo dashboard do Supabase. Motivo: <…>. Identidade confirmada por <canal>. Nenhum admin nível 3 disponível porque <…>.'
);
```

- `method` continua `'admin-reset'`: o `check` da tabela só aceita `'recovery-code'` e
  `'admin-reset'`, e criar um terceiro valor para caber este caso exigiria migration — a
  distinção que importa está escrita no `reason`, em texto, que é onde um auditor humano lê.
- `performed_by` é o `uuid` de **quem realmente executou**, em `auth.users`. Não use o do
  titular nem uma conta genérica: é a divergência entre ator e alvo que a investigação lê.
- As duas colunas de usuário são FK `on delete restrict`. Isso é proposital: a prova de quem
  removeu o MFA de quem não desaparece junto com a exclusão de um usuário.

O `sensitive_operation_log` **não** recebe linha manual. Ele registra execução de server
function, e inventar uma linha ali afirmaria que uma operação da aplicação rodou — o que não
aconteceu. O `mfa_reset_log` é o registro correto deste evento.

## Depois

- A conta fica **sem segundo fator** até o titular recadastrar. Enquanto isso ela não alcança
  operação classificada, e isso é o resultado certo: ninguém provou um segundo fator ainda.
- Se a conta é protegida, o recadastro inclui o **dispositivo reserva**, sem opção de pular.
  É justamente o que evita a próxima ida ao dashboard.
- Um uso do caminho 4 é sinal de que a escala de `admin` nível 3 ficou curta. Duas
  ocorrências em sequência não são azar: são a escala pedindo mais uma pessoa.

## Referências no código

| O quê | Onde |
|---|---|
| Reset administrativo (server fn) | `apps/sisub/src/server/mfa-admin.fn.ts` |
| Tela do reset | `apps/sisub/src/components/features/global/AdminMfaResetCard.tsx` (em `/admin/permissions`) |
| Códigos de recuperação | `apps/sisub/src/server/mfa-recovery.fn.ts`, `packages/sisub-domain/src/operations/mfa-recovery.ts` |
| Classificação e piso de garantia | `apps/sisub/src/server/assurance-registry.ts` |
| Tabelas | `packages/database/supabase/migrations/20260911120000_*`, `…120100_*`, `…120200_*` |
| Consulta do log de operações sensíveis | `/admin/audit-log` (exige `admin` nível 3) |
