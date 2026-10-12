## Context

- Projeto 001/IEFA/2025, frente Provisões (fardamento gratuito). Responsável técnico: Cap Hoffmann. Documentação de planejamento (detalhamento, análise do legado, requisitos v0.2, cronograma v1.2, folha de decisão, plano de desenvolvimento) fica local, fora do repositório, por regra do projeto: só documentação de sistema entra aqui.
- O legado fab-provisao (`C:\Users\Rafael\dev\IEFA\SIA`, repo separado) é especificação executável: modelo de 78 entidades, regras das OS 14 a 16 (necessidade = A + B + C − estoque, com seis defeitos catalogados), matriz RBAC de 9 perfis × 44 itens, 21 templates. Stack descartada.
- Núcleo em 11/10/2026 (`be713a86`): `core.item` (`kind` ∈ insumo, equipamento, material; PK compartilhada com a tabela de perfil), `core.military_identity` (saram, posto, nome de guerra, OM; sem CPF) e vínculo SARAM verificado, `core.units` com `is_training` e `supporting_unit_id`, PBAC com escopos `unit`, `mess_hall`, `kitchen` e módulos por papel no α, ledger `inventory` ainda com FK dura para `kitchen`, `rumaer.piece` sem grade de tamanhos.
- Trilho de app novo percorrido por rumaer, sucont e contrate: app → schema → tipos → `AppModule` → wrapper PBAC → manifesto → Terraform. `apps/rumaer` é o template estrutural; `apps/sucont` é o precedente de design do sisub com contrato próprio e de vários módulos por app.
- Decisões do projeto marcadas em 11/10/2026 (P1 a P5, Q1 a Q7, D1 a D6) estão na folha de decisão local; as que afetam este change aparecem abaixo com o código original entre parênteses.

## Goals / Non-Goals

**Goals:** registrar a decisão de plataforma como código e spec; criar a fundação (app, schema, domínio, acesso, deploy, cobertura legal) sem nenhuma tabela de negócio; fixar o lugar do item de fardamento no núcleo e o glossário antes da primeira tabela; deixar os changes seguintes (catálogo, grupos, antropometria, curva, SIGPES) sem decisão estrutural pendente.

**Non-Goals:** ver `proposal.md`.

## Decisions

### D1. Plataforma: app novo no monorepo sobre o núcleo (P1)

`apps/sisprov` no monorepo IEFA, schema `sisprov`, `packages/sisprov-domain`, três módulos PBAC. O legado não é compilado nem dependência: suas regras entram traduzidas, com os defeitos corrigidos, em funções puras testadas.

Alternativa descartada: evoluir o legado. Build irreproduzível (repositórios Maven mortos, container proprietário), schema perdido, Java 6 e Tapestry 5.0.6 sem suporte, segurança da integração com bypass por flag de JVM. O que tem valor sobrevive à migração; o que não tem é exatamente a stack.

### D2. Design system do sisub com contrato próprio (folha D1)

O SISPROV é operação de almoxarifado e gestão, a mesma natureza do sisub. Adota tokens, tipografia de sete níveis, primitivos (`field.tsx`, `item.tsx`, `button`, `card`) e as regras do `STYLE_CONTRACT.md` do sisub, copiados para o app (o monorepo não tem package de UI compartilhado; cada app carrega `components/ui`). O contrato próprio (`apps/sisprov/STYLE_CONTRACT.md`) registra só as diferenças: sem módulos por cozinha, sem ambiente de rancho, casca por sidebar com três módulos.

Descartados: o contrato institucional do rumaer (navy e dourado, consulta pública) e o Pale Brutalism do portal (CMS). `.claude/rules/ui.md` ganha a linha do sisprov.

### D3. Módulos PBAC por papel, escopados por OM (Q3)

| Módulo | Papel | Níveis | Escopo |
| --- | --- | --- | --- |
| `sisprov-planning` | Elo SISPROV na OM: informa ou ajusta a previsão de incorporação da OM, acompanha adesão da coleta de tamanhos | 1 consulta, 2 informar e ajustar | `unit` (OM); global para a SDAB |
| `sisprov-supply` | Almoxarifado da OM: recebe OF, registra distribuição, troca e devolução | 1 consulta, 2 operar | `unit` (OM) |
| `sisprov-admin` | SDAB: grupos de demanda e enxovais sistêmicos, curvas, períodos, aprovação de OF; e governança dos acessos do app | 2 gestão sistêmica, 3 gerenciar grants | global (sem escopo) para a SDAB; escopado por OM quando a gestão for delegada |

O militar (preenche tamanhos, confirma recebimento) é qualquer sessão autenticada, como o `diner` do sisub: não tem módulo. O escopo desce pela hierarquia de apoio (`core.units.supporting_unit_id`, `expandSupportCoverage` do pbac): grant no GAP-SJ cobre IAE, DCTA e IEFA-SJ, o inverso não.

Por que módulos e não níveis de um módulo só: almoxarife e elo são papéis diferentes na mesma OM, com o mesmo nível 2, e um não implica o outro. É a regra escrita no `AppModule` para o α: papéis são módulos, porque o escopo é por papel.

Por que não `storage`: em agosto estava reservado; hoje é o módulo de estoque do sisub, escopado por cozinha, com telas em `/storage/$kitchenId`. Não serve ao fardamento.

Registro no banco: `access_control.user_permissions.module` é `text` sem CHECK; os nomes novos não pedem DDL (precedente: `20260918123000_alpha_role_modules_unit_scope.sql`). A unicidade por (usuário, módulo, OM) já existe (`user_permissions_allow_uniq`/`_deny_uniq`).

Consequência no sisub: `SisubModule` em `apps/sisub/src/components/features/global/policies/labels.ts` passa a excluir `sisprov-${string}`, para o `Record<SisubModule, string>` não quebrar com módulo de outro app (o mesmo que aconteceu com o sucont).

### D4. Item de fardamento sobre `core.item` (P5, Q2)

O item estocável de fardamento é uma linha de `core.item` com `kind = 'material'` e `catalog_scope` a definir no change do catálogo (candidato: valor novo `fardamento`, porque `alimentacao`, `auxiliar` e `permanente` não o descrevem; decisão fica para lá, com a migration que o cria). O perfil vive no schema `sisprov` com a MESMA PK (subtipo com PK compartilhada, a técnica de `20260901120000_core_item_nucleus.sql`): família, variante por gênero, tamanho, aplicabilidade por posto, quadro e especialidade.

A peça do RUMAER (`rumaer.piece`) é referência regulamentar: FK opcional do perfil para ela. Nem toda peça do regulamento é distribuída gratuitamente, e nem todo item distribuído está no regulamento com o grão de tamanho. Três camadas, uma identidade: núcleo (o que é comprável e estocável), regulamento (o que a norma prescreve), grade (o que se distribui, por tamanho).

Descartado: catálogo próprio sem `core.item` (duas identidades para a mesma coisa; o ledger teria de escolher) e `rumaer` como dono do item (o rumaer é consulta normativa, sem estoque nem tamanho).

Consequência para G1: quando o ledger passar a aceitar `core.item` (change `sisprov-core-inventory`), o item de fardamento já é cliente, sem migração de identidade.

### D5. Reset de treino desde a primeira migration (folha D3)

Toda tabela do `sisprov` com `unit_id` entra em `RESET_TARGET_TABLES` (`apps/sisub/src/test/operations/training.operations.test.ts`) no PR que a cria, na ordem declara → aplica → mergeia. Tabelas de referência sem OM (catálogo, grade, curvas e versões) entram em `RESET_EXCLUSIONS` com justificativa. O recálculo da curva exclui cadastros da OM sentinela.

Este change não cria tabela nenhuma, então não declara nada: o guard default-deny é o motivo de o schema nascer vazio aqui e as tabelas virem uma a uma nos changes seguintes.

### D6. Glossário antes da tabela (folha D2)

O lote `sisprov-glossary` fixa identificador, nome no banco e rótulo de cada conceito do fardamento antes da primeira migration de negócio. O sisub precisou de oito lotes de renomeação para chegar a um nome por conceito; aqui os nomes nascem certos. Identificador em inglês, salvo o que a NSCA não reconheceria traduzido (`posto`, `quadro`, `saram`, `especialidade`) e valor de domínio que é categoria da norma ou da SDAB (`avulsa`).

### D7. App inteiro autenticado, sem agent-web

Ao contrário do rumaer, o SISPROV não tem conteúdo público: `/` redireciona para o hub ou para `/auth`. Rotas legais e `/health` são as únicas públicas. `createAgentServerEntry`, `llms.txt` e `agent-skills` ficam de fora até existir conteúdo público ou tool de agente; `robots.txt` nega tudo.

### D8. Shell: sidebar com três módulos, hub por permissão

O `AppShell` do sisub depende de módulos por cozinha, escopo em URL, paleta de comandos e rascunhos. O do SISPROV nasce menor: `SidebarProvider` + `Sidebar` do primitivo `sidebar.tsx` do sisub, um item por módulo acessível (`accessibleModules(permissions)`), rodapé com links legais e menu do usuário, `PageHeader` no topo de cada página. O hub lista os módulos como cards no padrão do sisub e explica a negativa quando o guard redireciona (`?denied=`). Sem módulo nenhum, a tela diz que o acesso ainda não foi concedido e a quem pedir.

### D9. Documentos legais: versão nova com o SISPROV

O app grava `theme` (cookie), `auth_rate_limit` e `fab_remember_email` (auth-kit) no navegador. O guard `cookie-inventory.test.ts` exige que a linha de cada chave nomeie o app; o LGPD.md exige o app na lista dos Termos e da Privacidade. Logo o change traz a migration `legal_documents_sisprov` com Termos 2.4.0, Privacidade 2.4.0 e Cookies 1.7.0, reinserindo o conjunto completo (os guards leem só a migration de maior timestamp) e acrescentando o SISPROV onde os outros sistemas são enumerados. O texto é proposta; o mantenedor decide e aplica. Até aplicar, o app roda sob os documentos vigentes.

Dado antropométrico (tamanhos por SARAM) e gênero NÃO entram nesta versão: chegam com o change do cadastro (F1.3), que leva RIPD e versão própria da Privacidade.

### D10. Entrega em PRs pequenos; migration espera o mantenedor

Este change se implementa em um PR (bootstrap), com a migration do schema e a dos documentos legais abertas e à espera do mantenedor. Os changes seguintes são um PR cada. Nenhuma migration é aplicada pela sessão; `db:types` e `db:drizzle:pull` rodam depois do apply, no mesmo PR.

## Risks / Trade-offs

- **Fase 1 antes do refactor do ledger (folha D4).** O catálogo e a curva nascem sem o estoque; `RF-05.2` (necessidade líquida) fica bloqueada por G1 e G2 até o change `sisprov-core-inventory`. Mitigação: o item nasce sobre `core.item` (D4), que é o que o ledger vai aceitar; o `design.md` do refactor começa durante a Fase 1 com o item de fardamento como caso de teste.
- **Dependência do SIGPES (Q4) sem data.** Não afeta este change; afeta o M3. Registrada no cronograma local como DEP-D, no caminho crítico, com plano B pela extração oficial em lote.
- **Documento legal em versão nova faz o aviso de ciência reaparecer para todos os apps.** Custo conhecido e aceito (aconteceu nas versões 1.4 a 1.6 dos Cookies). Alternativa de adiar deixaria o app no ar fora do documento, o erro que o Contrate cometeu.
- **Um app a mais no deploy.** Jobs `check/build/deploy-sisprov` seguem à mão no `deploy.yml`, como os demais; o teste do gerador cobra a presença.

## Migration Plan

1. Mergear o change (documentos) e o PR de bootstrap com as duas migrations à espera.
2. Mantenedor aplica `create schema sisprov` (`db:push --dry-run` antes) e a versão nova dos documentos legais; regenera `db:types` e `db:drizzle:pull`; `audit:rls` verde.
3. Provisionar `infra/sisprov` (backend, tfvars, secret `/iefa/prod/sisprov` com `VITE_SISPROV_SUPABASE_URL`, `VITE_SISPROV_SUPABASE_PUBLISHABLE_KEY`, `SISPROV_SUPABASE_SECRET_KEY`), `SISPROV_HEALTH_URL` nas variáveis do GitHub, host `sisprov.iefa.com.br`.
4. Primeiro grant `sisprov-admin` nível 3 ao Cap Hoffmann por SQL auditado (`changeModulePermission` não tem ator antes do primeiro admin): migration de uma linha com `audit_context`, como o α fez.
5. Changes seguintes: `sisprov-catalog` (F1.1), `sisprov-demand-groups` (F1.2), `sisprov-size-records` (F1.3 + F1.6), `sisprov-size-curve` (F1.4), `core-sigpes-sync` (F1.5), `sisprov-core-inventory` (Fase N), `sisprov-engine` (Fase 2), `sisprov-distribution` (Fase 3).

Rollback: o app sem tráfego pode ser retirado do manifesto e do ALB; o schema vazio pode ser dropado; os módulos no `AppModule` sem grant não autorizam nada. A versão dos documentos legais não se reverte (linha nova, nunca apagada): se o SISPROV não for ao ar, a versão seguinte o retira do texto.

## Open Questions

- `catalog_scope` do item de fardamento: valor novo `fardamento` ou reaproveitar `permanente`? Decide o change do catálogo, com a SDAB (fardamento é consumo, não permanente).
- Nível 2 de `sisprov-admin` escopado por OM: há caso real de gestão sistêmica delegada a uma OM, ou a SDAB é sempre global? Fica permitido pelo modelo; a tela de grants só oferece global até aparecer o caso.
- Host definitivo (`sisprov.iefa.com.br`) e prioridade do listener no ALB: o mantenedor define no provisionamento.
