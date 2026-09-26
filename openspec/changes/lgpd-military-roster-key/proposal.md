## Why

`core.user_military_data` espelha o cadastro de pessoal da Força: 68.317 linhas (o efetivo inteiro), carregadas de fora do repo só por INSERT (`pg_stat` desde 2025-07: 68.738 inserts, 421 deletes, 0 updates). Os apps usam o espelho para identificar pelo SARAM (`nrOrdem`) quem tem conta (1.430 em `core.user_data`) e mostrar posto e nome de guerra.

A **chave primária é o CPF em texto puro** (`"nrCpf"`). O CPF não serve a nenhum uso dos apps: o sisub o mostra mascarado no perfil do próprio titular (`user.fn.ts:69`); sucont, rumaer e a API não o leem. A LGPD pede finalidade e necessidade (art. 6º, I e III).

O que já está certo e não muda:
- A rota `/api/user-military-data` é restrita (`RESTRICTED_PATHS`) e não projeta o CPF.
- **Não há FK** de `core.user_data."nrOrdem"` nem de `core.person.nr_ordem` para o espelho, por decisão registrada em `20260910225309_core_person_registry.sql`: o espelho é sincronizado de fora, e uma FK transformaria atraso de carga em erro de escrita (quem chegou depois da última carga ficaria trancado fora, e a carga que apaga linhas abortaria). Esta proposta mantém essa decisão.
- A retenção indeterminada é **decisão declarada** em `LGPD.md`.

## What Changes

- **CPF deixa de ser a chave.** O espelho ganha uma PK física (`id` identity, gerada no INSERT, sem mudar a carga), e o CPF vira coluna comum, com `UNIQUE` para preservar a garantia que a PK dava à carga. O `nrOrdem` continua com o índice que já tem; não ganha `UNIQUE` enquanto não se souber como a carga se comporta (tarefa 1.1).
- **CPF fora das leituras dos apps, garantido por regra estática.** Todos os apps leem o banco como `service_role` (ou pelo Drizzle com o role do projeto), então isolamento por grant não separa app de carga. A garantia possível nesta arquitetura:
  - uma view `core.military_identity` com o mínimo que os apps usam: `nr_ordem`, `posto`, `nome_guerra`, `sg_org`, `data_atualizacao`. Sem nome completo (`nmPessoa`), que sucont e rumaer já deixam de fora de propósito, e sem CPF;
  - uma regra de `.opengrep/rules/` que reprova leitura de `nrCpf`/`nmPessoa` fora de uma allowlist com motivo (o perfil do próprio titular, mascarado; a rota restrita da API, que projeta `nmPessoa`);
  - os leitores passam para a view: `core.person_identity`, `core.v_user_identity`, `analytics.v_user_identity`, `sisub-domain` (`user.ts`, `dashboard.ts`, `snack-requests.ts`, `price-research-report.ts`), sucont (`military.server.ts`, `people.fn.ts`), rumaer (`military.fn.ts`) e a fixture de teste.
- **Identificadores em snake_case** na view; a tabela crua mantém os nomes do sistema de origem para a carga não mudar.

## Capabilities

### New Capabilities
- `military-roster`: identificação militar pelo SARAM, com CPF e nome completo fora das leituras dos apps.

### Modified Capabilities
- Nenhuma.

## Impact

- **Apps:** `sisub`, `sucont`, `rumaer`, `api` (leituras). **Packages:** `sisub-domain`, `database`.
- **Banco:** PK de `core.user_military_data`, `UNIQUE` no CPF, a view nova e as views dependentes recriadas sobre ela (elas bloqueiam o `ALTER` da PK se não forem tratadas). Tipos regerados no mesmo PR (`db:types` e `db:drizzle:pull`: `drizzle/schema.ts` hoje declara `nrCpf` como `primaryKey`).
- **Gate:** regra nova de opengrep. Espera o mantenedor.

## Não-objetivos

- FK para o espelho (ver Why).
- Mudar retenção ou texto da Política de Privacidade (documento legal: linha nova em `iefa.legal_documents`, decisão do mantenedor).
- Hash ou cifragem do CPF: sem uso nos apps, a minimização vem de não lê-lo; cifrar sem chave gerenciada fora do banco seria segurança de fachada.
- Recortar o espelho ao efetivo com conta: o recorte é de quem faz a carga.
