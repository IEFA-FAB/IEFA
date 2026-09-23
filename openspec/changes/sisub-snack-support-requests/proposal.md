## Why

O Módulo 7 do Manual Eletrônico do SISUB (SDAB, atualização de 27 NOV 2025) regula o fornecimento de **Lanche de Bordo** (missão aérea, classes A/B/C) e **Lanche de Apoio** (missão terrestre, classes A/B). Hoje o sisub só conhece o lanche como **molde de custeio**: a "Exceção" (`kitchen.menu_template`, `template_type = 'exception'`) existe para a Ata multiplicar `pax × ocorrências/mês × vigência`. Não há onde:

- o **setor requisitante** preencher a requisição do **Anexo E** (aeronave/viatura, missão, horário, trecho, duração, ordem de missão, tripulação, pax, material);
- a classe do lanche ser **derivada das regras da norma** (duração de voo × tempo de envolvimento × copa/forno × caráter operacional), em vez de ser escolhida no chute por quem pede;
- a **Seção de Subsistência** receber, aceitar, produzir e entregar o pedido, com etiqueta (7.4.5), guarda de amostra de 72 h (7.4.6), cautela de material (7.4.19) e devolução em caso de cancelamento (7.4.11).

A requisição hoje circula em papel/WhatsApp e não deixa rastro de quem pediu, quanto, com qual justificativa — e o custo dela (7.5.2) sai da economia de alimentação da OM sem registro no ERP.

Em produção existem **zero** exceções cadastradas (conferido em 2026-09-22), então reclassificar o artefato agora não tem dado a migrar.

## What Changes

- **Padrões de lanche** — a Exceção ganha classificação normativa opcional: família (`bordo` | `apoio`), classe (`A` | `B` | `C`) e variante (`lanche` | `refeicao`), mais requisitos de equipamento (copa, forno) e a faixa calórica da classe. O mesmo registro continua alimentando a Ata; o que muda é que ele passa a ser também o **item de catálogo** que o comensal pode pedir. O valor calórico por kit é calculado das preparações (a tabela nutricional das receitas já existe) e **conferido contra a faixa da classe**, com aviso — não bloqueio. Revisão trimestral (7.4.18) vira data de revisão com alerta de vencida.
- **Calculadora de classe** (função pura em `@iefa/sisub-domain`) — a partir dos parâmetros da missão, devolve a(s) classe(s) devida(s), a dotação por público (tripulação × passageiros) e a faixa calórica, com o **porquê** de cada decisão legível na tela (citando o item da norma).
- **Pedido de apoio no módulo Comensal** — `/diner/snack-requests` (meus pedidos) e `/diner/snack-requests/new`: formulário do Anexo E + calculadora + escolha dos padrões cadastrados pela cozinha apoiadora + quantidades. Antecedência mínima de 24 h (7.4.10) é verificada; abaixo dela o pedido exige justificativa e sai marcado como fora do prazo.
- **Requisições na Gestão Cozinha** — `/kitchen/$kitchenId/snack-requests`: fila por data de retirada e status, aceite/recusa com motivo, valor do lanche (campo "preenchido pela SSU" do Anexo E), andamento de produção, entrega e devolução de material.
- **Apoio à produção** — consolidado do dia (kits por padrão → porções por preparação → materiais), impressão de **etiqueta** conforme 7.4.5, checklist de **amostra de 72 h** e **cautela** do material de apoio.
- **Quadro de produção** — o pedido aceito entra no quadro da Produção Cozinha sob o tipo de refeição de sistema "Lanches de Bordo/Apoio", com cada item marcado pelo pedido de origem (decisão Q3, design D8).
- **Banco** — tabelas novas em `kitchen`: `snack_request`, `snack_request_line`, `snack_request_event` (histórico apenas-inserção) e `snack_request_material` (cautela); colunas novas em `kitchen.menu_template`.

## Capabilities

### New Capabilities
- `snack-standards`: classificação normativa da Exceção como padrão de lanche; kcal por kit; revisão trimestral; quais padrões ficam visíveis para pedido.
- `snack-class-calculator`: regras do Módulo 7 como função pura e testada; limites de fronteira; explicação por regra.
- `snack-requests`: requisição do Anexo E pelo comensal; ciclo de vida; antecedência; cancelamento; autorização.
- `snack-production-support`: fila da cozinha, consolidado de produção, etiqueta, amostra, cautela.

### Modified Capabilities
- `menu-exception-flow`: a Exceção passa a aceitar a classificação de padrão de lanche. As regras existentes (exceção sempre com cozinha, allowlist por `template_type`) não mudam.

## Impact

**Apps afetados**: `sisub` (rotas no `diner` e no `kitchen`, NavItems, breadcrumbs, server fns). `sisub-mcp`: nenhum na primeira entrega (ver Não-objetivos).

**Packages**: `@iefa/sisub-domain` (calculadora, schemas, operations, guards), `@iefa/database` (migration + tipos).

**Banco**: 4 tabelas novas, 8 colunas em `kitchen.menu_template`, `kitchen.meal_type.system_key` (+ o tipo de sistema semeado) e `kitchen.menu_items.origin_snack_request_id`. Todas só do servidor (`service_role`) — nenhuma entra na `CLIENT_TABLE_ALLOWLIST`, sem Realtime. As tabelas novas entram no contrato de reset de treino (`training.operations.test.ts`).

**LGPD**: o pedido guarda o **usuário requisitante** (já tratado) e o nome do **responsável pela retirada** (texto livre, dado pessoal novo, mesma finalidade). Não guarda a lista nominal de tripulantes/passageiros — só as contagens. Nenhum cookie ou destinatário novo.

## Não-objetivos

- **Não** substituir a cadeia de aprovação da OM requisitante (chefe do setor, ordem de missão). O sistema registra o número da ordem de missão; não a valida contra sistema externo.
- **Não** baixar estoque pelo pedido. A saída de estoque continua pelo fluxo de requisição de saída existente (`inventory.stock_issue_request`, origem `ad_hoc`), que já prevê "apoio".
- **Não** implementar a pesquisa de satisfação de fev/jun/nov (7.4.15) nem o canal de reclamação de 48 h (7.4.7). O `forms` cobre a primeira; a segunda fica para uma entrega própria.
- **Não** calcular custo automático do lanche. O valor é informado pela SSU (Anexo E, item 11); custo derivado de preço de insumo fica para depois.
- **Não** expor o pedido por tool de chat/MCP nesta entrega.
- **Não** cadastrar a lista nominal de tripulação/passageiros (minimização — só contagens).
