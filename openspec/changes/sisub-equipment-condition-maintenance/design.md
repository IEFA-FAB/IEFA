# Design: sisub-equipment-condition-maintenance

## Contexto — o que já existe

O modelo tipado de equipamento (migrations `20260825120000` e `20260825120100`, aplicadas em produção) tem três camadas:

- `kitchen.equipment_role` — o papel funcional ("forno combinado"), taxonomia global.
- `kitchen.equipment_model` + `equipment_model_role` — o modelo comercial e os papéis que ele assume (é o que representa o multifuncional). `kitchen_id` null = catálogo global.
- `kitchen.equipment_unit` + `equipment_unit_role` — a unidade física instalada, com `status` (`active` | `maintenance` | `decommissioned`) e override de `simultaneous_slots`.

E do lado da preparação, `kitchen.recipe_equipment_requirement` + o casamento em `utils/equipment-matching.ts` (emparelhamento máximo bipartido demanda × slot), consumido por `evaluateRecipeEquipmentFitness` e `evaluateMenuEquipmentFitness`.

Este change não mexe em nenhuma dessas decisões. Ele acrescenta a camada de **estado** por cima.

## As seis regras

### R1 — Ficha técnica é do MODELO; o que é da peça é da UNIDADE

Segue a mesma separação catálogo/instância que o schema já usa em `ingredient` × `recipe_ingredients` e em `model` × `unit`.

Vai para `equipment_model` (vale para toda unidade daquele modelo, em qualquer cozinha):
`energy_source` (`electric` | `gas` | `steam` | `mixed` | `manual`), `voltage` (texto: `127V`, `220V`, `380V trifásico`), `width_cm` / `depth_cm` / `height_cm`, `weight_kg`, `requires_hood`, `water_inlet`, `drain_required`, `manual_url`, `expected_lifespan_years`. (`power_kw` já existe.)

Vai para `equipment_unit` (varia peça a peça): `installed_on`, `warranty_until`, `supplier`. (`asset_tag`, `serial_number`, `acquired_on` já existem.)

**Por quê:** uma cozinha corrigir a potência do iCombi corrige para todas. Se a ficha morasse na unidade, ~130 cozinhas digitariam a mesma ficha 130 vezes e nenhuma estaria certa — é exatamente o problema que `equipment_model` foi criado para resolver.

Nenhum campo novo é obrigatório. Modelo genérico (`is_generic`) continua utilizável com a ficha inteira em branco: a cozinha que só sabe "tem um forno combinado" tem de continuar conseguindo cadastrar.

### R2 — Condição não é campo digitado; é derivada

`equipment_unit.status` **permanece o fato administrativo** e só a Gestão Cozinha o altera. A condição que aparece na tela é calculada:

| Condição | Quando |
|---|---|
| `operational` | `status = 'active'` e nenhuma pane aberta |
| `degraded` | `status = 'active'` e pane aberta com `severity = 'degraded'` (nenhuma inoperante) |
| `down` | pane aberta com `severity = 'inoperative'` **ou** `status = 'maintenance'` |
| `retired` | `status = 'decommissioned'` |

Função pura em `packages/sisub-domain/src/utils/equipment-condition.ts`, testada sem banco. Um lugar só — as quatro telas leem daí.

**Por quê:** um campo `condition` gravado ao lado de `status` seria uma segunda fonte de verdade para o mesmo fato. O gestor marcaria "em manutenção" e a praça continuaria vendo "ok", ou o inverso. Derivar elimina a divergência por construção.

### R3 — Pane inoperante tira a unidade do cálculo de atendimento; degradada não

`loadKitchenUnits` já filtra `status = 'active'` quando `includeInactive` é falso. Passa a filtrar também unidade com pane aberta (`open` ou `in_repair`) de severidade `inoperative`.

Consequência direta: `evaluateRecipeEquipmentFitness` e `evaluateMenuEquipmentFitness` param de contar o forno quebrado, e o alerta do `DayDrawer` reage ao relato da praça.

`degraded` **não** exclui — é sinal, aparece no cartão e nos relatórios, e o planejamento segue contando o equipamento.

Discordância da gestão tem saída explícita: `dismissed`. A pane sai do cálculo, permanece no histórico com autor e justificativa, e nunca é apagada.

**Por quê:** sem esta regra o relato é decoração. A cozinha registra que o forno quebrou e o sistema continua prometendo assado para 900 pessoas. O custo de errar para o outro lado (uma pane mal relatada bloqueia um cardápio) é reversível em um clique por quem tem `kitchen` nível 2; o custo de errar para este lado é uma refeição que não sai.

**Atenção de implementação:** `loadKitchenUnits` é chamada sem guard pelo cálculo de atendimento, inclusive para a *cozinha produtora* quando ela é diferente da pedida (`resolveProducingKitchen`). O filtro de pane tem de valer nos dois caminhos, senão a cozinha central promete o que não tem.

### R4 — Sem âncora não há atraso

`next_due_on` é **derivado**, nunca gravado:

1. último `performed_on` de um log daquele plano naquela unidade `+ interval_days`;
2. sem log: `unit.installed_on ?? unit.acquired_on` `+ interval_days`;
3. sem nenhuma das duas datas: estado **`sem registro`** — não `vencida`.

Três estados distintos no relatório: `em dia`, `vencida` (com dias de atraso, respeitando `tolerance_days`) e `sem registro`.

**Por quê:** com "sem âncora = vencida", no dia da migration 100% do parque nasce vermelho. Um relatório que acusa tudo não é lido — e o que ele deixa de mostrar é justamente a unidade que realmente está atrasada. "Sem registro" é uma informação diferente de "em dia" e de "atrasada", e as três precisam ser distinguíveis à primeira vista.

Função pura em `packages/sisub-domain/src/utils/maintenance-due.ts`.

### R5 — Quem está na praça relata; quem gerencia decide

| Ação | `kitchen-production` nível 1 | `kitchen` nível 2 |
|---|---|---|
| Ver o parque | ✅ (já hoje) | ✅ |
| Abrir pane | ✅ | ✅ |
| Registrar execução de rotina | ✅ | ✅ |
| Criar unidade | ✅ | ✅ |
| Editar unidade (label, slots, ficha patrimonial) | ❌ | ✅ |
| Resolver / descartar pane | ❌ | ✅ |
| Mudar `status` (manutenção, baixa) | ❌ | ✅ |
| Excluir unidade | ❌ | ✅ |
| Criar/editar modelo, papel ou plano | ❌ | ✅ (modelo local) |

`createEquipmentUnit` deixa de ser `requireKitchen(ctx, 2, kitchenId)` e passa a aceitar `kitchen` nível 2 **ou** `kitchen-production` nível 1 no escopo da cozinha. `updateEquipmentUnit` e `deleteEquipmentUnit` **não** mudam.

**Por quê:** exigir que o gestor cadastre garante parque desatualizado — quem sabe o que existe na praça é quem trabalha nela. É o mesmo raciocínio que motivou `is_generic` no modelo: baixar a barreira de cadastro é o que faz o dado existir. O que é destrutivo ou reescreve a versão oficial continua na gestão.

O teste de authz precisa provar a metade negativa: um contexto só com `kitchen-production` nível 1 **falha** em `updateEquipmentUnit`, `deleteEquipmentUnit` e no descarte de pane. Guard sem prova de não-vacuidade é guard que não existe (mesma lição de `equipment.authz.test.ts`).

### R6 — O relatório global agrega por PAPEL

`/analytics/equipment` responde perguntas de capacidade, não de marca:

- quantas cozinhas não têm nenhuma unidade operacional de cada papel;
- onde há pane inoperante aberta e há quanto tempo;
- que rotina está vencida em mais unidades;
- distribuição do parque por papel, com corte secundário por modelo.

Modelo é **filtro**, não eixo — serve para recall de fabricante ("todo iVario Pro 2-S da FAB") e para comparar taxa de pane entre modelos, mas a pergunta de gestão é sobre capacidade instalada.

Somente leitura. O dono do dado é a cozinha; a Análise Global não corrige o parque de ninguém.

## Schema

Três tabelas novas em `kitchen`, RLS ligada **sem policy** — mesma postura das seis irmãs: nenhum cliente toca direto, todo caminho passa por server fn com service key.

### `kitchen.equipment_maintenance_plan`

O QUE fazer, de quanto em quanto tempo.

```
id             uuid pk
role_id        uuid → equipment_role   -- XOR com model_id
model_id       uuid → equipment_model
kitchen_id     bigint → core.kitchen   -- null = plano global (Catálogo Global)
code           text                    -- slug estável do plano global; null em plano local
title          text not null
kind           text not null           -- preventive | inspection | cleaning | calibration | legal
interval_days  integer not null
tolerance_days integer not null default 0
instructions   text
estimated_minutes integer
is_required    boolean not null default true
sort_order     integer not null default 100
created_at / deleted_at
```

XOR papel/modelo, com a mesma constraint de `recipe_equipment_requirement`: "limpeza de coifa" é do **papel** (vale para toda coifa, de qualquer marca); "troca da guarnição da porta" é do **modelo**. Reusa uma intuição que o schema já ensinou.

`interval_days` inteiro em vez de um enum de frequência: a conta de vencimento fica trivial e "a cada 45 dias" continua representável. A UI oferece atalhos (semanal/mensal/trimestral/semestral/anual) que gravam o número.

Plano aplicável a uma unidade = planos globais do papel efetivo ou do modelo da unidade ∪ planos da própria cozinha. Papel *efetivo*, não o do catálogo: unidade com `equipment_unit_role.available = false` para "fritadeira" não deve herdar a rotina de troca de óleo.

### `kitchen.equipment_maintenance_log`

O que FOI feito.

```
id           uuid pk
unit_id      uuid not null → equipment_unit
plan_id      uuid → equipment_maintenance_plan   -- null = corretiva / avulsa
issue_id     uuid → equipment_issue              -- null = não veio de pane
kind         text not null                        -- mesmo domínio do plano + 'corrective'
performed_on date not null
performed_by uuid → auth.users
provider     text not null default 'in_house'     -- in_house | contract | manufacturer
cost         numeric
notes        text
created_at / deleted_at
```

`plan_id` nulo cobre a manutenção que ninguém planejou — que é a maioria. Forçar todo registro a pendurar num plano faria a praça inventar plano para registrar conserto.

`issue_id` é o que fecha o ciclo pane → conserto: o relatório de condição mostra quanto tempo a pane ficou aberta e o que foi feito.

### `kitchen.equipment_issue`

A pane.

```
id              uuid pk
unit_id         uuid not null → equipment_unit
severity        text not null      -- degraded | inoperative
status          text not null default 'open'   -- open | in_repair | resolved | dismissed
category        text not null default 'other'  -- mechanical | electrical | gas | hydraulic | refrigeration | structural | other
description     text not null
reported_by     uuid → auth.users
reported_at     timestamptz not null default now()
resolved_by     uuid → auth.users
resolved_at     timestamptz
resolution_note text
created_at / updated_at / deleted_at
```

Sem `kitchen_id` denormalizado: a cozinha vem da unidade por join. Duas colunas para o mesmo fato divergem, e o índice `equipment_unit_kitchen_idx` já existe.

Sem unique de "uma pane aberta por unidade": duas panes distintas no mesmo forno são dois problemas distintos. Índice parcial em `(unit_id, status)` para as abertas.

`resolved_at`/`resolved_by` servem tanto para `resolved` quanto para `dismissed` — o par (status, resolution_note) diz qual foi.

### Colunas novas nas tabelas existentes

`equipment_model`: os campos de ficha de R1, todos nulos.
`equipment_unit`: `installed_on`, `warranty_until`, `supplier`, todos nulos.

## Telas

### 1. `/global/equipment` — aba **Rotinas** (Catálogo Global, nível 2)

Lista de planos globais, agrupada por papel. Form com título, tipo, intervalo (com atalhos), tolerância e instruções. A ficha técnica de R1 entra no form de modelo que já existe.

### 2. `/kitchen-production/$kitchenId/equipment` — **nova** (Produção Cozinha, nível 1)

"Meus equipamentos". Um cartão por unidade: rótulo, modelo, papéis efetivos, **badge de condição** (R2) e badge de rotina vencida. Ações: `Relatar pane`, `Registrar manutenção`, `Adicionar equipamento`.

O relato de pane é curto de propósito — severidade, categoria, descrição — porque é preenchido de pé, com pressa, provavelmente no celular. Severidade em duas opções com texto claro: *"dá para usar com limitação"* e *"não dá para usar"*.

Estado vazio não diz "nenhum equipamento cadastrado" e para. Diz o que fazer: cadastrar o que existe aqui.

### 3. `/kitchen/$kitchenId/equipment` — abas **Condição** e **Manutenção** (Gestão Cozinha)

**Condição**: panes abertas ordenadas por severidade e tempo em aberto, com ação de resolver/descartar (nível 2) e histórico das últimas resolvidas. Um resumo no topo: quantas unidades operacionais / degradadas / paradas.

**Manutenção**: matriz unidade × plano aplicável, cada célula em um de três estados (`em dia`, `vencida há N dias`, `sem registro`) — R4. Ação de registrar execução direto da célula.

A aba **Parque** existente não muda, além de ganhar o badge de condição no item.

### 4. `/analytics/equipment` — **nova** (Análises Globais, nível 2)

Cobertura por papel (cozinhas com/sem unidade operacional), panes inoperantes abertas por tempo, rotinas mais vencidas, distribuição do parque. Filtros por papel, modelo e cozinha. Sem escrita.

Gráficos seguem o design system do sisub (flat, `rounded-xl` no `<Card>`) e a proibição global de faixa de acento lateral: severidade se distingue por badge/ícone/tint de fundo, nunca por `border-l-4`.

## Testes

- **Puros** (sem banco): `equipment-condition.test.ts` cobre as quatro condições e a precedência (`decommissioned` vence pane; pane inoperante vence `degraded`); `maintenance-due.test.ts` cobre as três âncoras de R4, a tolerância e o caso "sem registro".
- **Authz** (`equipment.authz.test.ts`): a metade positiva e a **negativa** de R5, tool a tool.
- **Integração** (`equipment.operations.test.ts`): pane inoperante remove a unidade do atendimento e `dismissed` a devolve; log fecha a pane; `setupIntegration` das tabelas novas precisa falhar sob `SISUB_INTEGRATION_REQUIRED` em vez de dar early-return silencioso.
- **Treino** (`training.operations.test.ts`): as duas tabelas novas em `RESET_STEPS`, **antes** de `kitchen.equipment_unit`.

## Ordem de aplicação

A migration vai para produção **antes ou junto** do merge. `saveRecipeEdit` chamando `copyRecipeEquipmentRequirements` com a tabela ainda inexistente virou `42P01` em produção uma vez; o mesmo padrão se repete aqui, porque `loadKitchenUnits` passa a ler `equipment_issue` em todo caminho de planejamento.
