## Why

"Sistema bem feito não precisa de manual nem de curso." Hoje o planejamento da contratação de gêneros do rancho só dá certo para quem já sabe a ordem das coisas:

1. a nutricionista monta os cardápios (semanais, eventos e apoios) na Gestão Cozinha e envia a previsão pela aba "Suprimentos";
2. o chefe do rancho, na Gestão Unidade, descobre sozinho se as cozinhas enviaram, abre o wizard do anexo quantitativo, calcula, pesquisa preço e exporta um CSV.

Nada junta as pendências. O envio da cozinha nunca fecha: o status `reviewed` não é gravado por ninguém. E o anexo não sabe que as unidades compram por **segmento**: carnes num pregão, estocáveis em outro, bebidas em outro, um por mês, para as atas não vencerem juntas.

A saída também não serve ao destino real. O quantitativo alimenta o ETP (estimativa das quantidades, com memória de cálculo: Lei 14.133/2021, art. 18, § 1º, IV) e o TR, em cujo editor o anexo é **colado** como tabela. A pesquisa de preços precisa virar o documento do art. 3º da IN SEGES/ME 65/2021, com série de preços, método, justificativas e memória de cálculo. No rancho isso é uma contratação de milhões, com centenas de itens.

Por fim, o vocabulário do sistema diverge da lei em pontos que confundem o processo: "ata" para o anexo, "publicar" o anexo interno, "margem" para o acréscimo de quantidade.

## What Changes

- **Fluxos por módulo.** Cada módulo tem um "Fluxos" com roteiros guiados. Cada etapa tem pendências calculadas dos dados, cada pendência tem uma ação que a resolve, e a etapa leva à tela que já existe.
  - Gestão Unidade: **Planejar contratação**.
  - Gestão Cozinha: **Prever demanda para compra**.
  - Pendência que depende de outro módulo aparece para os dois lados, sem link cruzado.
- **Segmentação das contratações.** A unidade monta as próprias contratações (ex.: "Carnes" = pasta Proteínas + Frios/Embutidos + Ovos; "Estocáveis"), por regra de pasta do catálogo ou de item de compra, cada uma com o mês previsto no calendário de contratação, a vigência padrão e o identificador do PCA.
  - Item sem contratação aparece como pendência.
  - Item disputado por duas contratações bloqueia, porque o órgão não pode participar de duas atas com o mesmo objeto (art. 82, VIII).
- **Anexo por contratação.** O anexo quantitativo passa a ser de uma contratação: o cálculo filtra os itens do segmento, e a vigência vem dele. Planejar X produções e comprar só o segmento Y é o caso de uso central.
- **Previsão de demanda com retorno.**
  - A aba "Suprimentos" vira **"Previsão de demanda"**.
  - Ao importar a previsão num anexo, ela passa a "Recebida pela unidade" e registra cada anexo em que entrou, e a nutricionista vê isso.
  - A previsão continua disponível para os anexos das outras contratações.
- **Documentos para o processo.** Todos saem da mesma versão do anexo e se conferem entre si:
  - **tabela do anexo para colar no TR:** HTML na área de transferência, sem colunas de preço quando o orçamento é sigiloso;
  - **CSV** do anexo;
  - **memória de cálculo das quantidades** (PDF pela impressão do navegador);
  - **relatório de pesquisa de preços** conforme o art. 3º da IN 65/2021 (PDF), com a série completa em CSV, checklist de conformidade e roteiro de auditoria por amostragem;
  - cada relatório é uma **emissão registrada** (data, autor, SHA-256 e pesquisas usadas), reproduzível depois mesmo que o preço do anexo mude.
- **Pesquisa de preços auditável:**
  - o agente responsável e o fornecedor (CNPJ e nome) passam a ser gravados;
  - o preço convertido e o fator de cada amostra são gravados;
  - item com preço sem pesquisa de mesmo valor é pendência bloqueante no relatório.
- **Quantidade mínima a ser cotada** (art. 82, II) entra no anexo, com percentual padrão por anexo.
- **Terminologia alinhada à Lei 14.133/2021:**
  - "Concluir" no lugar de "Publicar" o anexo;
  - "Acréscimo sobre a estimada" no lugar de "Margem";
  - "Quantidade estimada" no lugar de "Qtd Alvo";
  - "Quantidade mínima por ordem de fornecimento";
  - "Preço de catálogo" no lugar de "Preço de Referência";
  - "Itens do anexo quantitativo" no lugar de "Itens da Ata".

## Capabilities

### New Capabilities
- `guided-flows`: fluxos por módulo, pendências derivadas de dados, severidades e ações.
- `procurement-segmentation`: contratações montadas pela unidade, regras, resolução de item, conflitos, calendário.
- `procurement-documents`: tabela para o TR, CSV, memória de cálculo das quantidades, orçamento sigiloso.
- `price-research-audit`: relatório da IN 65/2021, rastreabilidade por amostra, checklist e amostragem.
- `procurement-terminology`: vocabulário do sisub alinhado à Lei 14.133/2021 e aos decretos de SRP e PCA.

### Modified Capabilities
- Nenhuma capability em `openspec/specs/` é alterada. As regras do snapshot (`archive/2026-09-08-freeze-ata-snapshot-on-publish`) continuam valendo: o anexo congela a composição ao sair do rascunho, e o preço segue vivo, lastreado por pesquisa (PR #455).

## Impact

**Apps afetados:** `sisub`, em rotas da Gestão Unidade e da Gestão Cozinha, NavItems, breadcrumbs, server fns e impressão. `sisub-mcp`: nenhum.

**Packages:** `@iefa/sisub-domain` (segmentação, status dos fluxos, dossiê de pesquisa, schemas) e `@iefa/database` (migration e tipos).

**Banco (uma migration, schema `procurement`):**
- tabelas novas `procurement_segment` (com `unit_id`), `procurement_segment_rule`, `kitchen_ata_draft_import` e `price_research_emission`;
- colunas novas:
  - em `procurement_list`: `segment_id`, `is_budget_confidential`, `min_quote_percent`;
  - em `procurement_list_snapshot_component`: `min_quote_quantity`;
  - em `kitchen_ata_draft`: `reviewed_at`, `reviewed_by`;
  - em `procurement_pesquisa_preco`: `created_by`;
  - em `procurement_pesquisa_preco_amostra`: `converted_price`, `content_in_unit`, `conversion`;
  - em `compras_amostra`: `ni_fornecedor`, `nome_fornecedor`;
- tudo só do servidor (`service_role`), sem entrada na `CLIENT_TABLE_ALLOWLIST`;
- `procurement_segment` entra no contrato de reset de treino, declarada antes da migration.

## Não-objetivos

- Gerar o ETP ou o TR inteiros. O sisub entrega os insumos (tabela, memória, pesquisa); a redação continua no Compras.gov.br.
- Integrar com o PGC/PCA para ler ou gravar a contratação. O identificador do PCA é digitado.
- Notificação ativa (e-mail ou push) entre cozinha e unidade. A pendência aparece no fluxo de cada lado.
- Pesquisa de preços por outros parâmetros do art. 5º (cotação direta, NF-e, sítios). O relatório já reserva a caracterização por parâmetro; hoje a única fonte é o Compras.gov.br.
- Renomear tabelas e colunas `ata*` no banco. É dívida registrada; a UI deixa de dizer "ata" para o anexo.
- Fluxo transversal entre módulos: cada usuário só vê os fluxos dos módulos a que tem acesso.
