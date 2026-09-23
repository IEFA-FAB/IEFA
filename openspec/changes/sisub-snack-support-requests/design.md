## Contexto

Fonte normativa: **Módulo 7 — Composição e fornecimento de refeições de bordo e lanches de apoio no âmbito do COMAER** (SDAB, 27 NOV 2025). Os números de item citados abaixo são os do módulo.

Estado atual do sisub (conferido em 2026-09-22):

| Peça | Onde | Observação |
|---|---|---|
| Exceção = molde de custeio | `kitchen.menu_template` `template_type='exception'` + `menu_template_items` | 0 linhas em produção. `headcount_override` por item; `expected_monthly_occurrences` multiplica na Ata (`templates.ts` `mapTemplateWithCounts`, `ata.ts` `exceptionSelections`) |
| Rotas de exceção | `kitchen/$kitchenId/exceptions/*` e `global/exceptions/*` | Componentes em `components/features/local/planning/Occasion*` |
| Tipos de refeição | `kitchen.meal_type` | Em prod só `café, almoço, jantar, ceia`; previsão e presença têm CHECK `cafe/almoco/janta/ceia` — lanche não cabe ali |
| Nutrição da receita | `useRecipeNutrition` (cliente, por 100 g) | Não há kcal por porção calculado no servidor |
| Comensal → cozinha | `core.user_data.default_mess_hall_id` → `kitchen.mess_halls.kitchen_id` | 602 usuários com refeitório padrão; 0 refeitórios sem cozinha |
| Fluxo de requisição parecido | `procurement.kitchen_ata_draft` (`pending/sent/reviewed`), `inventory.stock_adjustment` (decisão + motivo) | Padrão a espelhar: status + `decided_by/at` + motivo |
| Horário de refeição da cozinha | — | **Não existe.** Afeta a regra de Bordo B de 1–3 h (ver R-B2) |

## Revisão dos requisitos contra a norma

### O que a norma pede e o pedido original não citava

1. **Classe A é base, não alternativa** — B e C são "fornecidos em complemento ao Lanche tipo A" (7.2.1.2.1, 7.2.1.3.1). Um voo de 5 h recebe A **e** B. A calculadora devolve uma lista de classes, não uma.
2. **Tempo de envolvimento ≠ tempo de voo** para a Classe B (7.2.1.2.2): conta pré-voo, briefing, debriefing e pousos intermediários sem rancho. O formulário precisa pedir os dois.
3. **Público muda por classe**: A vai a tripulação **e** passageiros; B **não** se aplica a passageiro de voo pessoal/administrativo/não operacional; C vai à tripulação e, "conforme disponibilidade da OM Apoiadora", a passageiros de voo não operacional (7.2.1.3.1). Logo o pedido precisa do **caráter da missão** (operacional ou não) e das contagens separadas.
4. **Equipamento da aeronave decide a variante**: com copa/minicozinha → refeição; sem → sanduíche; grande refeição (almoço/jantar) exige **forno** instalado (7.2.1.2.6). O Anexo E pede a preferência "lanche ou refeição (marmita)" — a preferência só vale dentro do que o equipamento permite.
5. **Classe C é por dia**: "uma cota completa por pessoa, por dia" (7.2.1.3.9), com faixa calórica por duração (7.2.1.3.8).
6. **Paradas sem rancho** (7.4.13): o lanche cobre o **tempo total do deslocamento**, não só a perna.
7. **Antecedência mínima de 24 h** (7.4.10), **retirada no rancho** pelo requisitante (7.4.12), **devolução** se a missão cair (7.4.11), **cautela** do material de rancho (7.4.19).
8. **Etiqueta obrigatória** (7.4.5): OM produtora, nome da preparação, data de fabricação, validade, valor nutricional e "Próprio para consumo imediato". **Amostra** guardada por 72 h (7.4.6).
9. **Não reaproveitamento** (7.4.4): lanche perecível devolvido não volta ao estoque de pronto — só o material e itens industrializados intactos.
10. **Civis e servidores** só excepcionalmente, envolvidos em missão da FAB e com motivo comprovado (7.5.1) → campo de justificativa quando o pedido inclui não militares.
11. **Revisão trimestral do cardápio** (7.4.18) → padrão com data de última revisão.
12. **Custeio** (7.5.2): economia de alimentação da OM ou recurso próprio da missão → o pedido registra a fonte; o valor é da SSU (Anexo E, item 11).

### Tabela de regras (o que a calculadora implementa)

| Id | Família | Condição | Resultado | Item |
|---|---|---|---|---|
| R-A | Bordo | Toda missão aérea | Classe A para tripulação + pax, 1 porção de água e café/chá por pessoa | 7.2.1.1, 7.2.1.9 |
| R-B1 | Bordo | envolvimento > 3 h e < 6 h | + Classe B | 7.2.1.2.2 |
| R-B2 | Bordo | voo entre 1 h e 3 h **e** o horário inviabiliza uma refeição do rancho | + Classe B | 7.2.1.2.2 |
| R-B3 | Bordo | Classe B | Só tripulação + militares em serviço de missão **operacional**; passageiro de voo não operacional fica fora | 7.2.1.2.1 |
| R-C1 | Bordo | voo ≥ 6 h (longo curso) | + Classe C, 1 cota por pessoa por dia = `ceil(duração / 24 h)` | 7.2.1.3.2, 7.2.1.3.9 |
| R-C2 | Bordo | Classe C | Faixa: até 15 h → 600–1.200 kcal; acima → 1.200–2.000 kcal | 7.2.1.3.8 |
| R-C3 | Bordo | Classe C, voo não operacional | pax **opcionais**, a critério da OM apoiadora (a cozinha decide no aceite) | 7.2.1.3.1 |
| R-V1 | Bordo | sem copa/minicozinha | Variante `lanche` (sanduíche) apenas | 7.2.1.2.3 |
| R-V2 | Bordo | refeição grande (almoço/jantar) | exige forno instalado; sem forno → `lanche` | 7.2.1.2.6 |
| R-T0 | Apoio | deslocamento ≤ 2 h | nenhum lanche devido | 7.2.2.1.2 |
| R-T1 | Apoio | > 2 h e < 4 h | Classe A (1 sanduíche + 1 bebida por pessoa) | 7.2.2.1.2, 7.2.2.1.8 |
| R-T2 | Apoio | ≥ 4 h e ≤ 8 h | Classe B (1 refeição **ou** lanche reforçado por pessoa) | 7.2.2.2.2, 7.2.2.2.8 |
| R-T3 | Apoio | > 8 h | Classe B + reforço: o sistema sugere 1 unidade adicional (A ou B) por bloco adicional de 4 h, **editável** | 7.2.2.2.8 |
| R-P | Ambas | paradas sem apoio de rancho | a duração considerada é a do deslocamento total | 7.4.13 |

A calculadora é **sugestão com justificativa**, não trava: o requisitante pode divergir, e divergir exige texto. A cozinha vê a sugestão e o que foi pedido lado a lado.

### Inconsistências da norma — decisões tomadas

| # | Texto | Problema | Decisão (default adotado) |
|---|---|---|---|
| N1 | Apoio A "> 2 h e < 4 h"; Apoio B "> 4 h e < 8 h" | 4 h e 8 h exatas ficam sem classe | 4 h exatas → B (a atividade já cobre metade da jornada); 8 h exatas → B sem reforço |
| N2 | Bordo C 7.2.1.3.8 a) "até 6 h" | Contradiz o emprego (C é ≥ 6 h) | Faixa a) ignorada; 6–15 h → 600–1.200 |
| N3 | Anexo E item 9: "terrestres deixar em branco" | Mas 7.2.2 classifica o apoio em A/B | Sistema calcula a classe terrestre mesmo assim; no documento impresso o campo 9 fica em branco para terrestre, a classe aparece à parte |
| N4 | Anexo E B = "> 3 h e < 6 h" de **voo**; 7.2.1.2.2 = de **envolvimento** | Fontes divergem | Vale o corpo da norma (envolvimento). O formulário pede os dois tempos |
| N5 | Numeração 7.2.1.3.4/7.2.1.3.5/1.2.2.1.7 dentro do Apoio A | Erro de numeração | Citações da tela usam o título da seção, não o número |
| N7 | Bordo B exige envolvimento **< 6 h**; Bordo C exige **voo** ≥ 6 h | Voo de 5 h com envolvimento de 7 h fica sem classe | Aplica a Classe B (a necessidade é no mínimo a de B), com a regra `N7` na justificativa |
| N6 | R-B2 "horário inviabiliza refeição" | Sem horário de refeição cadastrado por cozinha | Janelas padrão 06:00–08:00, 11:00–13:30, 18:00–20:00, configuráveis por cozinha numa fase futura (Q2) |

## Decisões de desenho

### D1 — Padrão de lanche é uma Exceção classificada, não tabela nova

A Exceção já é "refeição previsível e recorrente — lanches de bordo, cafés de reunião" (`OCCASION_MENU_COPY`) e já alimenta a Ata. Criar `snack_standard` à parte duplicaria o catálogo e deixaria o custeio da Ata cego para o que de fato se pede. Colunas novas em `kitchen.menu_template`, todas nulas por padrão:

- `snack_family text` — `bordo | apoio` (CHECK); não nulo ⇒ é padrão de lanche. CHECK: só com `template_type = 'exception'`.
- `snack_class text` — `A | B | C` (CHECK; `C` só com `bordo`).
- `snack_variant text` — `lanche | refeicao`.
- `requires_galley boolean`, `requires_oven boolean` (default false).
- `reviewed_at date` — revisão trimestral (7.4.18).
- `orderable boolean default false` — a cozinha decide o que aparece para pedido.

**Semântica de quantidade no padrão**: `headcount_override` do item passa a ser **porções por kit** quando o template é padrão de lanche, e `expected_monthly_occurrences` = **kits previstos por mês**. A multiplicação da Ata (`Σ porções × ocorrências × vigência`) continua correta sem tocar `ata.ts`. A tela troca os rótulos ("Porções por kit", "Kits por mês") quando `snack_family` está preenchido.

Padrão global (`kitchen_id` nulo, catálogo SDAB) pode existir como molde para fork, mas **só padrão da cozinha** é pedível — o pedido é atendido por uma cozinha concreta.

### D2 — kcal por kit no servidor

Hoje a nutrição é calculada no cliente, por 100 g. O padrão precisa de kcal **por porção** para conferir a faixa da classe. Extrair o cálculo do hook para função pura em `@iefa/sisub-domain` (`utils/recipe-nutrition.ts`) e compor: `kcal_kit = Σ kcal_porção(receita) × porções`. Cobertura incompleta (insumo sem nutriente) é reportada, não zerada — "0 kcal" mentiria.

### D3 — Modelo do pedido

`kitchen.snack_request`:

| Coluna | Tipo | Origem |
|---|---|---|
| `id` | uuid | |
| `kitchen_id` | FK `kitchen.kitchen` | cozinha apoiadora escolhida |
| `requested_by` | FK usuário | **sessão**, nunca input |
| `requester_unit_label` | text | Setor/OM requisitante (texto) |
| `mission_kind` | `aerea | terrestre` | |
| `vehicle_type`, `vehicle_registration`, `vehicle_om` | text | Anexo E 1 |
| `mission_description` | text | Anexo E 2 |
| `departure_at` | timestamptz | Anexo E 3 |
| `origin`, `destination`, `stops` | text | Anexo E 4 |
| `flight_minutes` / `involvement_minutes` | int | Anexo E 5 + 7.2.1.2.2 |
| `stops_without_mess` | bool | 7.4.13 |
| `mission_order_number` | text | Anexo E 6 — obrigatório em missão aérea |
| `is_operational` | bool | 7.2.1.2.1 |
| `has_galley`, `has_oven` | bool | 7.2.1.2.3/6 |
| `crew_count`, `pax_count` | int ≥ 0 | Anexo E 7 |
| `includes_non_military`, `non_military_reason` | bool, text | 7.5.1 |
| `preference` | `lanche | refeicao` | Anexo E 10 |
| `pickup_at` | timestamptz | Anexo E "Data da retirada" |
| `pickup_responsible` | text | idem |
| `late_reason` | text | < 24 h (7.4.10) |
| `funding_source` | `economia_om | recurso_missao` | 7.5.2 |
| `calculator_snapshot` | jsonb | entrada + saída da calculadora na hora do envio |
| `divergence_reason` | text | quando o pedido difere da sugestão |
| `status` | ver D4 | |
| `unit_value` | numeric | Anexo E 11, preenchido pela SSU |
| `decided_by`, `decided_at`, `decision_reason` | | aceite/recusa |
| `created_at`, `updated_at` | | |

`kitchen.snack_request_line`: `request_id`, `standard_id` (FK `menu_template`, precisa ser padrão pedível **da mesma cozinha** — trigger), `audience` (`crew | pax`), `quantity > 0`, `standard_snapshot jsonb` (nome, classe, itens e kcal no envio — o padrão pode ser editado depois).

`kitchen.snack_request_event`: `request_id`, `from_status`, `to_status`, `actor_id` (sessão), `note`, `details`, `created_at`. Apenas inserção: trigger recusa UPDATE e DELETE direto; a cascata de FK (reset de treino) passa por `pg_trigger_depth() > 1`.

`kitchen.snack_request_material`: `request_id`, `item` (`garrafa_termica | caixa_termica | hotbox | cooler | outro`), `description`, `quantity`, `issued_at`, `returned_at`, `returned_quantity`. É a cautela de 7.4.19.

As quatro tabelas: RLS ligada, sem policy de cliente, só `service_role`. Nenhuma função SQL exposta. A transição de status é uma transação Drizzle na operation (`transition()` em `operations/snack-requests.ts`): `select … for update` na linha do pedido, conferência da máquina de estados, patch e evento na mesma transação — aceite e recusa simultâneos resultam em uma transição e um `SNACK_INVALID_TRANSITION`. (A primeira versão deste design previa uma função SQL; a transação na operation dá a mesma garantia sem abrir superfície RPC e mantém a materialização na produção no mesmo lugar.)

### D4 — Máquina de estados

```
            ┌────────── cancel (requisitante, ou cozinha) ──────────┐
            │                                                       ▼
submitted ─accept→ accepted ─start→ in_production ─ready→ ready ─pickup→ delivered ─close→ closed
    │                                                                  │
    └─reject→ rejected                               cancel após ready ┴→ cancelled (material_pending → devolução)
```

- `submitted → accepted | rejected`: cozinha, `kitchen:2`. Recusa exige motivo. Aceite exige `unit_value` e pode ajustar quantidades de pax opcional (R-C3) — ajuste vira evento.
- `accepted → in_production → ready`: `kitchen:2` **ou** `kitchen-production:1` (`requireKitchenFloorWrite`, já existe). `ready` exige checklist de amostra registrada (7.4.6).
- `ready → delivered`: registra retirada e emite a cautela.
- `delivered → closed`: todo material da cautela devolvido.
- `cancel`: requisitante enquanto `submitted | accepted`; cozinha em qualquer estado não terminal. Cancelar depois de `in_production` exige motivo e marca "devolução pendente" (7.4.11); perecível devolvido **não** volta ao estoque (7.4.4) — a tela diz isso.
- O requisitante não edita o pedido enviado: mudança = cancelar e pedir de novo (enquanto `submitted`/`accepted`), ou a cozinha ajusta as quantidades no aceite, com evento.

### D5 — Autorização

- **Pedir e ver os próprios pedidos**: `diner:1` (todo usuário). `requested_by` sempre de `ctx.userId`; leitura por outro usuário é negada (espelha `forecast.fn.ts` / IDOR de `fetchUserPermissionsFn`).
- **Fila da cozinha**: `kitchen:1` leitura, `kitchen:2` decisão, `requireKitchenFloorWrite` para andamento. `kitchenId` do pedido lido **da linha**, nunca do input (lição do #158/#322).
- O guard da linha (`standard_id` pedível e da mesma cozinha) vive no banco (trigger) **e** na operation — o banco fecha o furo se outra via escrever.
- Nenhuma dessas tabelas é de acesso (`access_control`), então não entra no regime de função auditada; o histórico é o `snack_request_event`.
- Registrar as server fns novas no `assurance-registry.ts` (todas `"none"`: não é operação financeira nem de acesso).

**Risco aceito**: qualquer comensal pode pedir lanche para N pessoas. A barreira é o aceite da cozinha + ordem de missão obrigatória em missão aérea + o nome de quem pediu na fila. Se isso não bastar, restringir o pedido a um módulo/nível próprio é uma mudança de guard só (Q1).

### D6 — Telas

**Comensal** (`diner`, nav "Pedido de Lanche", ícone `Plane`):
- `/diner/snack-requests` — meus pedidos, status, cancelar.
- `/diner/snack-requests/new` — 3 passos na mesma página: (1) missão (Anexo E 1–8, cozinha apoiadora com default do refeitório padrão); (2) **calculadora** ao vivo: classes devidas, público, kcal, com a regra citada em cada linha e o alerta de antecedência; (3) padrões pedíveis da cozinha filtrados pela sugestão (família/classe/variante/equipamento) com quantidades pré-preenchidas pela dotação, editáveis. Resumo + envio.
- Detalhe do pedido com a linha do tempo de eventos e a versão imprimível do **Anexo E**.

**Gestão Cozinha** (`kitchen`, nav "Lanches de Bordo/Apoio"):
- `/kitchen/$kitchenId/snack-requests` — fila por data de retirada, filtros por status; badge de "fora do prazo", "diverge da sugestão", "pax opcional".
- `/kitchen/$kitchenId/snack-requests/$requestId` — decisão, valor, andamento, amostra, retirada, cautela, devolução.
- `/kitchen/$kitchenId/snack-requests/production?date=` — consolidado do dia: kits por padrão → porções por preparação (ficha técnica) → materiais; impressão de etiquetas (1 por kit ou por preparação) com os campos de 7.4.5; lista de amostras a coletar.
- Na tela de Exceções: bloco "Padrão de lanche" (família/classe/variante/equipamento/revisado em/pedível) + kcal por kit com a faixa da classe.

Design system: sisub (flat, `STYLE_CONTRACT.md`), Base UI, sem faixa lateral colorida para status.

### D7 — Validade da etiqueta

A norma exige validade na etiqueta mas não a define. Default: data de fabricação + **24 h** para perecível pronto, editável por padrão (`shelf_life_hours` no padrão — coluna extra em `menu_template`, nula = 24). Confirmar com a nutricionista (Q4).

### D8 — Pedido aceito entra no quadro de produção, discriminado (Q3)

- Tipo de refeição **de sistema** `kitchen.meal_type.system_key = 'snack_request'` ("Lanches de Bordo/Apoio", global, `sort_order` 90), criado pela migration. `fetchMealTypes` o exclui (não aparece nos seletores de cardápio semanal/evento nem no planejamento) e update/delete/restore não casam com ele.
- No aceite (mesma transação da transição): `daily_menu` desse tipo na **data civil de Brasília da retirada** (insert `on conflict do nothing` + select, por causa do índice único parcial), um `menu_item` por (linha × preparação do snapshot do padrão) com `planned_portion_quantity = kits × porções por kit`, `origin_template_id = padrão`, `origin_template_type = 'exception'` e **`origin_snack_request_id`** (coluna nova), e a `production_task` PENDING de cada item.
- O quadro (`fetchProductionBoard`) devolve `snack_request` em cada item de lanche (missão, destino, retirada, status, padrão) — é a discriminação por pedido.
- Recusa não toca o quadro (nada foi materializado). Cancelamento em `accepted`/`in_production`/`ready` faz soft-delete dos itens do pedido; depois de `delivered` os itens ficam (a produção aconteceu).
- O status do pedido (`in_production`/`ready`) é da cozinha e não é derivado das tarefas; o detalhe mostra `production {total, done, in_progress}` para conferir.
- No editor de padrão, a seção de itens usa o tipo de sistema (`fetchSnackMealType`), mais qualquer tipo que já tenha item no template.

## Riscos

- **Reinterpretar `headcount_override` como porções por kit** pode confundir quem lê a Ata. Mitigação: rótulo diferente na tela e comentário no `ata.ts` explicando que a conta é a mesma.
- **Calculadora vira "a norma" para o usuário** — se a regra estiver errada, erra em escala. Mitigação: testes de fronteira para cada linha da tabela de regras e de cada decisão N1–N6; a tela cita o item da norma para quem conferir.
- **Horário de refeição padrão (N6)** pode não bater com a cozinha: R-B2 só *sugere*, e o requisitante vê a janela usada.

## Decisões do mantenedor (2026-09-22)

- **Q1** — todo comensal pode pedir (`diner:1`); a barreira é o aceite da cozinha.
- **Q2** — janelas de refeição fixas (N6) ficam; horário por cozinha não entra agora.
- **Q3** — o pedido aceito **entra no quadro de produção, discriminado**. Ver D8.
- **Q4** — validade padrão de 24 h; etiqueta com kcal por kit.
- **Q5** — material do Anexo E derivado das pessoas e editável.
