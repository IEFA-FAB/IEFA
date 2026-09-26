## ADDED Requirements

### Requirement: Tabela do anexo para colar no TR

O sistema SHALL oferecer "Copiar tabela" no anexo, gravando na área de transferência uma tabela HTML simples e a versão em texto tabulado. As colunas MUST ser:

- Item, CATMAT, Descrição, Unidade;
- Quantidade estimada, Quantidade máxima, Quantidade mínima a ser cotada;
- Quantidade mínima por ordem de fornecimento, Ciclo de entrega;
- Preço estimado e Valor estimado.

Com orçamento sigiloso marcado no anexo, as colunas de preço e valor MUST ser omitidas.

#### Scenario: Orçamento sigiloso

- **WHEN** o anexo tem orçamento sigiloso e o usuário copia a tabela
- **THEN** a tabela colada não tem "Preço estimado" nem "Valor estimado"

### Requirement: Quantidade mínima a ser cotada

O anexo SHALL ter um percentual de quantidade mínima a ser cotada (Lei 14.133/2021, art. 82, II), com padrão de 100%. A quantidade mínima de cada item MUST ser o teto de `quantidade máxima × percentual ÷ 100`, com o produto arredondado em 6 casas antes do teto para não errar por ponto flutuante, e ser congelada no snapshot na conclusão.

#### Scenario: Cotação parcial admitida

- **WHEN** o percentual é 25% e a quantidade máxima de um item é 1.000 kg
- **THEN** a quantidade mínima a ser cotada do item é 250 kg

#### Scenario: Ponto flutuante não soma uma unidade

- **WHEN** o percentual é 7% e a quantidade máxima é 100
- **THEN** a quantidade mínima a ser cotada é 7, não 8

### Requirement: Memória de cálculo das quantidades

O sistema SHALL gerar, para imprimir ou salvar em PDF, a memória de cálculo das quantidades do anexo (Lei 14.133/2021, art. 18, § 1º, IV). Por item, ela MUST trazer:

- cada parcela: cozinha, cardápio e tipo, preparação, comensais, per capita líquido, rendimento, repetições e quantidade;
- o total no insumo e o fator de conversão;
- a quantidade estimada, o acréscimo, a quantidade máxima, o ciclo e o mínimo por ordem de fornecimento.

#### Scenario: Auditor refaz a conta

- **WHEN** o auditor soma as parcelas de um item e aplica o fator de conversão impresso
- **THEN** obtém a quantidade estimada impressa para o item

#### Scenario: Cardápio mudou depois da conclusão

- **WHEN** o anexo foi concluído e um cardápio usado mudou depois
- **THEN** a memória declara no cabeçalho que a composição atual diverge da concluída
