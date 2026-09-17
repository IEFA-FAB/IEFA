# gtin-gs1-catalog (delta)

## ADDED Requirements

### Requirement: Alias de GTIN aprendido na operação
Associação de GTIN desconhecido feita no recebimento, na saída ou na contagem por `storage` nível 2 SHALL gravar alias (`GTIN → ingredient_item`, fornecedor quando houver, cozinha, autor, status `pending | approved | rejected`) e MUST NOT alterar `ingredient_item.gtin`. Alias `pending` SHALL valer para a cozinha que o criou e para notas do mesmo fornecedor; alias `approved` por `global` nível 2 SHALL valer para todos e MAY promover o GTIN ao catálogo. Alias `rejected` MUST deixar de casar.

#### Scenario: Embalagem nova
- **WHEN** um operador da cozinha A associa o GTIN novo do arroz ao item "Arroz 5 KG"
- **THEN** a cozinha A e as próximas notas do mesmo fornecedor casam por esse GTIN, o GTIN antigo continua casando, e o alias entra na fila de revisão global

#### Scenario: Associação errada rejeitada
- **WHEN** o revisor global rejeita o alias
- **THEN** leituras seguintes do GTIN voltam a aparecer como desconhecidas
