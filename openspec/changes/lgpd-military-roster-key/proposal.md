## Why

`core.user_military_data` é o espelho do cadastro de pessoal da Força: 68.317 linhas (o efetivo inteiro), carregadas de fora do repo só por INSERT (`pg_stat` desde 2025-07: 68.738 inserts, 421 deletes, 0 updates). Os apps usam a tabela para uma coisa só: identificar a pessoa que tem conta (1.430 em `core.user_data`) pelo SARAM (`nrOrdem`) e mostrar posto e nome de guerra.

Mesmo assim, a **chave primária é o CPF em texto puro** (`"nrCpf"`), e é por ela que a tabela se identifica, enquanto o vínculo real com os apps é o `nrOrdem`, que só ganhou índice e não tinha unicidade declarada. A LGPD pede finalidade e necessidade (art. 6º, I e III): o CPF não serve a nenhum uso dos apps (o sisub o mostra mascarado no perfil, `user.fn.ts:69`; sucont, rumaer e a API não o leem) e, por ser a PK, se espalha para todo lugar que referencie a linha.

O que já está certo e não muda:
- A rota `/api/user-military-data` é restrita (`RESTRICTED_PATHS`) e não projeta o CPF.
- A retenção indeterminada é **decisão declarada** em `LGPD.md` ("anunciar um prazo de descarte que ninguém executa é informação falsa").

## What Changes

- **Chave pelo SARAM.** `nrOrdem` passa a ser `NOT NULL` e `UNIQUE` (hoje: 0 nulos, 0 duplicados), e o vínculo dos apps (`core.user_data."nrOrdem"`, `core.v_user_identity`) passa a ser uma FK para ele. O CPF deixa de ser PK: vira coluna comum, com acesso só do servidor.
- **CPF fora do caminho de leitura dos apps.** Uma view `core.military_identity` (`nrOrdem`, posto, nome de guerra, nome, OM) é o que os apps leem. A tabela com o CPF fica restrita ao `service_role` do processo de carga e ao perfil do próprio titular (mascarado).
- **Carga compatível.** A carga externa continua gravando por INSERT; com o `UNIQUE (nrOrdem)`, recarga que insere antes de apagar falharia. Por isso o passo 1 é saber **quem carrega e como**, e só então aplicar o `UNIQUE`.
- **Colunas em snake_case** na view nova (`nr_ordem`, `posto`, `nome_guerra`), mantendo a tabela crua com os nomes do sistema de origem para a carga não mudar.

## Capabilities

### New Capabilities
- `military-roster`: identificação militar pelo SARAM, CPF fora das leituras dos apps.

### Modified Capabilities
- Nenhuma.

## Impact

**Apps:** `sisub` (perfil, identidade), `sucont` (`military.server.ts`, `people.fn.ts`), `rumaer` (`military.fn.ts`), `api` (`/user-military-data`). Leituras passam para a view.

**Banco:** `core.user_military_data` (PK, UNIQUE, grants), `core.user_data` (FK), view nova `core.military_identity`. Mudança de chave de tabela com dado pessoal: espera o mantenedor.

## Não-objetivos

- Mudar a retenção ou o texto da Política de Privacidade. Se a proposta avançar para prazo de guarda, isso é decisão do mantenedor e documento legal novo (linha nova em `iefa.legal_documents`), nunca aqui.
- Hash ou cifragem do CPF: sem uso nos apps, a minimização vem de não lê-lo; cifrar sem chave gerenciada seria segurança de fachada.
- Apagar o efetivo que não tem conta: a tabela é espelho de sistema externo, e o recorte é decisão de quem faz a carga.
