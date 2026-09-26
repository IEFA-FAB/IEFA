## ADDED Requirements

### Requirement: Relatório de pesquisa de preços (IN SEGES/ME 65/2021, art. 3º)

O sistema SHALL gerar, por anexo, o relatório de pesquisa de preços com os elementos do art. 3º da IN 65/2021:

- descrição do objeto;
- agentes responsáveis;
- caracterização das fontes;
- série de preços coletados;
- método estatístico;
- justificativas da metodologia e dos descartes;
- memória de cálculo do valor estimado por item.

A série completa MUST sair num CSV anexo, cujo SHA-256 vem impresso no relatório.

#### Scenario: Série conferível

- **WHEN** o auditor baixa o CSV da série pelo relatório e calcula o SHA-256
- **THEN** o valor bate com o impresso
- **AND** ao aplicar o método declarado às amostras válidas de um item, ele obtém o preço estimado impresso

### Requirement: Rastreabilidade de cada amostra

Cada amostra gravada SHALL guardar:

- a identificação da compra de origem (id da compra e do item, UASG);
- a data;
- o preço original, a unidade de fornecimento e a capacidade;
- o preço convertido para a unidade do item, com o texto da conversão;
- a classificação: válida, descartada por IQR ou inconsistente;
- o fornecedor (CNPJ e nome), quando a fonte informar.

A pesquisa MUST guardar o usuário que a fez.

#### Scenario: Conversão impressa

- **WHEN** uma amostra de "FR 750 ML" a R$ 4,17 entra numa pesquisa em LT
- **THEN** a série traz "FR 750 ML = 0,75 LT" e o preço convertido de R$ 5,56

### Requirement: Checklist de conformidade

O relatório SHALL listar, por item, as verificações com base legal e severidade:

| Verificação | Severidade |
|---|---|
| Item sem pesquisa, ou com preço diferente do da pesquisa | bloqueante |
| Preço acima da mediana (art. 6º, § 6º) | bloqueante |
| Menos de 3 preços ou fontes, com justificativa e aprovação (art. 6º, § 5º) | aviso |
| Unidade inferida | aviso |
| Variação alta, CV acima de 25%, para análise crítica (art. 6º, § 4º) | aviso |
| Pesquisa com mais de 180 dias | aviso |

#### Scenario: Preço de catálogo sem pesquisa

- **WHEN** um item do anexo tem preço vindo do catálogo e nenhuma pesquisa registrada com esse valor
- **THEN** o relatório marca o item como bloqueante: "preço sem pesquisa registrada"

### Requirement: Roteiro de auditoria por amostragem

O relatório SHALL trazer um roteiro de conferência:

- os itens da curva A (que somam 80% do valor estimado) são conferidos por inteiro;
- dos demais, uma amostra de 10%, com mínimo de 5 itens, sorteada com semente derivada do SHA-256 da série, para que qualquer pessoa reproduza o sorteio.

#### Scenario: Sorteio reproduzível

- **WHEN** dois auditores geram o roteiro da mesma versão do anexo
- **THEN** os dois recebem a mesma lista de itens sorteados
