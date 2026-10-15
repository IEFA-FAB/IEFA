## Why

O SISPROV (Sistema de Provisões) é o sistema que nasceu para o estoque. A frente do Projeto SIA (Convênio 001/IEFA/2025, IEFA × FCMF) que o originou é o fardamento gratuito: partir do efetivo previsto, aplicar o enxoval e a curva de tamanhos, descontar o estoque da rede e gerar a ordem de fornecimento. Mas o estoque não é do fardamento. A alimentação do sisub também tem estoque, e hoje ele está modelado como se fosse o único: todo item é ingrediente ou preparação congelada, todo local é uma cozinha.

Decisão do mantenedor em 13/10/2026: **o SISPROV é dono de todo e qualquer estoque**, e o estoque do sisub é uma classe dele (alimentação). No fundo é um sistema só; para o usuário, cada um vê o recorte do seu domínio, e quem é da cozinha continua vendo só alimentação, na tela do sisub. O estoque continua no schema `inventory`.

O momento é agora: o ledger está vazio em produção (piloto travado), então generalizar custa DDL e código, sem migração de dado contábil.

O legado (fab-provisao, 2013 a 2015) nunca entrou em produção e não está no ar. Serve de fonte de requisitos, não de decisão: depósito, almoxarifado e distribuição, que lá eram módulos à parte, aqui são locais e movimentos do mesmo ledger.

## What Changes

- **O estoque passa a ser multiclasse**, numa migration (`inventory_multiclass`):
  - local de estoque explícito (`inventory.stock_location`: OM, nível 1/2/3 com abastecedor, recebe direto, GLN, cozinha opcional, classes que guarda), um por cozinha no backfill;
  - endereçamento opcional por local: posições em árvore (depósito, setor, estante, prateleira, escaninho), lote endereçado com pendência de endereçamento, pallet (GIAI) e caixa (SSCC), movimentação entre posições com log, contagem por posição e lista de separação FEFO;
  - item pelo núcleo: `item_id` → `core.item` no lugar de `ingredient_id`/`frozen_preparation_id`; a preparação congelada vira subtipo de `core.item`;
  - classe de suprimento = `core.item.catalog_scope`, com o valor novo `fardamento`, e trava de classe por local;
  - OF por local (`procurement.supply_order.location_id`);
  - funções e views do `inventory` recriadas sobre o eixo (local, item);
  - reset de treino pelo local.
- **O código do estoque muda de dono:** a lógica pura vai de `@iefa/sisub-domain` para `@iefa/sisprov-domain/inventory`. As telas `/storage/$kitchenId` do sisub ficam onde estão, como a lente de alimentação, operando o local da cozinha.
- **O módulo `storage` vira o módulo de estoque do SISPROV**, para toda classe, escopado por cozinha, OM (com hierarquia de apoio) ou global. Sai o `sisprov-supply` do primeiro desenho. Ficam `sisprov-planning` (elo na OM) e `sisprov-admin` (SDAB).
- **Sem schema `sisprov` vazio:** o perfil do fardamento ganha schema próprio com a primeira tabela, no change do catálogo.
- **App novo `apps/sisprov`** (TanStack Start + Nitro, React 19), com o design system do sisub e `STYLE_CONTRACT.md` próprio. Nasce com login, hub por permissão, Planejamento, Estoque (lista de locais alcançáveis) e Administração (acessos), rotas legais e aviso de ciência.
- **Package novo `packages/sisprov-domain`:** módulos, guards (inclusive `requireStockLocation`) e o estoque.
- **Documentos legais:** o SISPROV entra nos Termos, na Privacidade e no inventário de cookies, em versão nova (linha nova, nunca `UPDATE`). Texto proposto; o mantenedor decide.
- **Deploy e infra:** entrada no `apps.manifest.json` (o release lê o manifesto; app novo não edita o `deploy.yml`) e stack `infra/sisprov`.
- **Documentação de sistema:** página do SISPROV, seção dos módulos em `pbac/modulos.mdx`, catálogo de edge cases, linhas em `AGENTS.md`, `README.md`, `PRODUCT.md` e `LGPD.md`.

## Capabilities

### New Capabilities
- `stock-ownership`: o SISPROV como dono do estoque de toda classe; local de estoque; classe por item e trava por local; lentes por app.
- `stock-addressing`: níveis e árvore de abastecimento; endereçamento, unidades de movimentação, movimentação entre posições, contagem por posição e lista de separação.
- `sisprov-foundation`: o app, o package de domínio, o deploy e a cobertura legal do SISPROV.
- `sisprov-access`: `storage` como módulo de estoque do SISPROV, `sisprov-planning` e `sisprov-admin`, escopados por OM com hierarquia de apoio; concessão auditada.
- `sisprov-item-identity`: o item de fardamento como `core.item` de classe `fardamento`.
- `sisprov-glossary`: um nome por conceito do fardamento em todas as camadas.

### Modified Capabilities
- `stock-ledger`: a chave do ledger passa de (cozinha, ingrediente XOR preparação) para (local, item).
- `goods-receipt`: a OF é por local de estoque, não por cozinha.
- `stock-replenishment-mrp`: a política de estoque é por local × item.

## Impact

- **Banco:** migration `inventory_multiclass` (estrutura de todas as tabelas do `inventory`, `procurement.supply_order`, `kitchen.frozen_preparation` como subtipo, `core.item.catalog_scope`, funções e views), migration `legal_documents_sisprov`. **Espera o mantenedor** (migration, documento legal).
- **Sisub:** server functions de estoque, rotas `/storage/$kitchenId` (resolvem cozinha → local), `training` (reset pelo local), guard de treino; `sisub-domain` perde a lógica pura do estoque para o `sisprov-domain`.
- **Packages:** `sisprov-domain` (novo), `pbac` (comentário do `storage`, dois módulos `sisprov-*`), `database` (tipos regenerados), `legal-kit` (`APP_NAMES`).
- **Gates e infra:** `apps.manifest.json` e artefatos gerados, `infra/sisprov/**`, `knip.json`. Espera o mantenedor (`infra/**`).
- **Produção:** janela curta entre o apply e o deploy em que o estoque do sisub não abre (D10 do design). O ledger está vazio.
- **LGPD:** o app trata e-mail institucional e SARAM (`core.military_identity`); dado antropométrico só chega no change do cadastro, com RIPD próprio.

## Não-objetivos

- Telas de operação do fardamento (receber, distribuir, contar), catálogo, grupos de demanda, ficha de tamanhos, curva, integração SIGPES: changes próprios, nesta ordem.
- Mover as telas de estoque da cozinha para o app SISPROV: a cozinha continua no sisub (decisão de 13/10/2026).
- Embalagem de item fora da alimentação: entra com o catálogo.
- Portaria, conferência por volume na doca, impressão de etiqueta e otimização de rota de separação: o dado já existe; as telas vêm com o recebimento do depósito.
- Integração de NF do SIA: fora da v1, com gate à SDAB.
- Portar código do legado.
- IA, chat de módulo e MCP: não há caso de uso escrito.
- Ratificar a decisão de plataforma pela Direção: registrada aqui como decisão do responsável técnico e do mantenedor.
