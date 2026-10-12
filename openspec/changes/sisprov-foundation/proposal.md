## Why

O SISPROV (Sistema de Provisões, fardamento gratuito) é a frente do Projeto SIA (Convênio 001/IEFA/2025, IEFA × FCMF) que inverte a lógica de provisão de fardamento da FAB: em vez de o estoque perseguir o consumo passado, o sistema parte do efetivo previsto de incorporação e renovação, aplica o enxoval do grupo de demanda e a curva antropométrica por gênero, desconta o estoque da rede e gera a ordem de fornecimento ao depósito central, com aprovação humana.

O legado (fab-provisao, Dextra, 2013 a 2015, Java 6 + EJB 3 + Tapestry 5.0.6 + JBoss 4) foi entregue e nunca implantado. A análise de 26/08/2026 mostrou build irreproduzível, schema SQL perdido, integração com o SIA frágil por construção e a distribuição individual ao militar nunca implementada. O que tem valor nele (modelo de dados de 78 entidades, regras de cálculo das OS 14 a 16 com seis defeitos catalogados, 21 templates de relatório, matriz RBAC) é portável sem compilar nada.

Em 11/10/2026 o Cap Hoffmann, responsável técnico, marcou a folha de decisão do projeto (a ratificar pela Direção): a plataforma é o monorepo IEFA, sobre o núcleo comum onde o SISUB já roda em produção. Este change registra essa decisão e cria a fundação sobre a qual as fases seguintes constroem: o app, o schema, os módulos de autorização, o lugar do item de fardamento no núcleo e o glossário. É o entregável do marco M1 do cronograma do projeto.

Nada do SISPROV existe hoje no monorepo. O que o núcleo já entrega e o SISPROV herda: `core.item` (identidade de item com `kind = material`), `core.military_identity` e o vínculo SARAM verificado, PBAC por papel escopado por OM com hierarquia de apoio (precedente do Projeto α), ledger de estoque, fechamento mensal, MRP, `procurement`, `finance`, catálogo regulamentar `rumaer`, ambiente de treino, `legal-kit`, `auth-kit`, `supabase-kit`.

## What Changes

- **App novo `apps/sisprov`** (TanStack Start + Nitro, React 19), pelo trilho dos sete passos que rumaer, sucont e contrate percorreram, com o design system do sisub e `STYLE_CONTRACT.md` próprio. Nasce com login, hub por permissão, três módulos vazios honestos, rotas legais e aviso de ciência, e nenhuma tela de negócio: o conteúdo vem nos changes seguintes.
- **Package novo `packages/sisprov-domain`** com a estrutura do `sisub-domain` (schemas, operations, guards, types, utils) e os guards dos três módulos. Operations chegam com o catálogo (change seguinte).
- **Schema `sisprov`** no banco compartilhado: criado vazio, com grants no padrão do sucont, exposto no PostgREST e na lista de schemas tipados. Nenhuma tabela neste change, de propósito: tabela com `unit_id` só nasce depois de declarada no guard de reset de treino do sisub.
- **Três módulos PBAC por papel**, escopados por OM (`unit`) com hierarquia de apoio, no `AppModule` de `@iefa/pbac`: `sisprov-planning` (elo SISPROV na OM: previsão de incorporação), `sisprov-supply` (almoxarifado da OM: receber OF, distribuir) e `sisprov-admin` (SDAB: enxovais, curvas, aprovação de OF, grants). O militar não tem módulo: é sessão autenticada.
- **Identidade do item de fardamento** decidida: `core.item` com `kind = material` e perfil no schema `sisprov`, ligado a `rumaer.piece` quando a peça existe no regulamento. Especificada aqui, construída no change do catálogo.
- **Lote do glossário de fardamento** (`sisprov-glossary`): um nome por conceito antes da primeira tabela.
- **Reset de treino**: regra de que toda tabela operacional do `sisprov` entra em `RESET_TARGET_TABLES` no PR que a cria, e referência (catálogo, curvas) em `RESET_EXCLUSIONS`.
- **Documentos legais**: o SISPROV entra nos Termos de Uso, na Política de Privacidade e no inventário da Política de Cookies (`theme`, `auth_rate_limit`, `fab_remember_email`), em versão nova (linha nova, nunca `UPDATE`). Texto proposto; o mantenedor decide.
- **Deploy e infra**: entrada no `apps.manifest.json` (artefatos regerados por `generate:deploy`), jobs `check/build/deploy-sisprov` no `deploy.yml`, stack `infra/sisprov`.
- **Documentação de sistema**: página em `apps/docs/content/docs/sisprov`, seção dos módulos em `docs/pbac/modulos.mdx`, arquivos do catálogo de edge cases, linhas nas tabelas de `AGENTS.md`, `README.md`, `PRODUCT.md` e `LGPD.md`.

## Capabilities

### New Capabilities
- `sisprov-foundation`: o app, o schema, o package de domínio, o deploy e a cobertura legal do SISPROV no monorepo.
- `sisprov-access`: autorização do SISPROV por papel (planning, supply, admin), escopada por OM com hierarquia de apoio; militar como sessão autenticada; autogestão de grants só dos módulos do app, auditada.
- `sisprov-item-identity`: o item de fardamento como `core.item` de tipo material com perfil `sisprov` e vínculo opcional ao catálogo regulamentar.
- `sisprov-glossary`: um nome por conceito do fardamento em todas as camadas.

### Modified Capabilities
- Nenhuma spec arquivada muda. `core.item` (change `sisub-inventory-operations`, migration `20260901120000`) ganha um segundo cliente sem alteração de schema neste change.

## Impact

- **Apps:** `sisprov` (novo), `docs` (página nova). **Packages:** `sisprov-domain` (novo), `pbac` (três módulos no union), `database` (migration do schema, lista de schemas), `legal-kit` (`APP_NAMES`).
- **Banco:** `create schema sisprov` + grants + `pgrst.db_schemas`; versão nova dos três documentos legais em `iefa.legal_documents`. **Espera o mantenedor** (migration, documento legal).
- **Gates e infra:** `apps.manifest.json` e artefatos gerados, `deploy.yml`, `infra/sisprov/**`, `knip.json`. Espera o mantenedor (`infra/**`, `.github/**`).
- **LGPD:** o app passa a tratar dado pessoal (e-mail institucional, SARAM via `core.military_identity`); por isso entra nos documentos e leva `legal-kit`. Dado antropométrico só chega no change do cadastro (F1.3), com RIPD próprio.
- **Sisub:** `SisubModule` em `policies/labels.ts` exclui `sisprov-${string}`, como já faz com `sucont-${string}` e `alpha-${string}`; nada mais muda no sisub.

## Não-objetivos

- Qualquer tela ou tabela de negócio: catálogo (F1.1), grupos de demanda (F1.2), cadastro antropométrico e coleta (F1.3, F1.6), curva (F1.4), integração SIGPES (F1.5) são changes próprios, nesta ordem, conforme `SIA/docs/SISPROV-plano-desenvolvimento.md` (local).
- Refactor do ledger para aceitar `core.item` (G1), eixo de escopo do estoque (G2), separação `core-domain` (G7): change `sisprov-core-inventory`, antes da Fase 2.
- Operar o depósito central (logística física, OS 08 a 12 do legado) e a integração SIA de NF: fora da v1 por decisão Q1, com gate à SDAB.
- MOMAT, DEMOP e balanço: fora da v1 por decisão Q6, com gate à SDAB.
- Portar código do legado: o legado é especificação executável, nunca dependência.
- Carga de efetivo por planilha: descartada (Q4); a fonte é o SIGPES online, no núcleo.
- Chat de módulo, MCP e qualquer IA: não há caso de uso escrito; IA nunca é caminho crítico.
- Agent-web (Markdown negotiation, `llms.txt`): o SISPROV é inteiro autenticado; entra quando houver conteúdo público ou tool de agente.
- Ratificar a decisão de plataforma pela Direção: este change a registra como decisão do responsável técnico, com a ressalva.
