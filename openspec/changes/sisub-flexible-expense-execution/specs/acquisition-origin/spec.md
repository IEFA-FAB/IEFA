## ADDED Requirements

### Requirement: Contratação de origem de qualquer tipo

O sistema SHALL permitir registrar a contratação que sustenta um empenho, com `kind` entre `registro_precos`, `licitacao`, `dispensa`, `inexigibilidade`, `contrata_mais_brasil`, `suprimento_fundos` e `outra`. Só a unidade e o tipo MUST ser obrigatórios; o que faltar MUST aparecer como pendência da contratação, sem impedir o uso dela em empenho.

#### Scenario: Dispensa registrada com o mínimo

- **WHEN** o chefe do rancho registra uma dispensa só com o tipo
- **THEN** a contratação é gravada e pode ser escolhida num empenho
- **AND** o fluxo "Executar despesa" mostra "Dispensa sem fundamento legal, sem fornecedor e sem vigência"

#### Scenario: Carona em ata de outro órgão

- **WHEN** a unidade registra uma contratação `registro_precos` com papel `nao_participante` e a ARP de outra UASG
- **THEN** a ARP é importada ou cadastrada sem anexo quantitativo
- **AND** os empenhos da carona apontam para os itens dessa ARP

### Requirement: ARP sem anexo quantitativo

A ARP SHALL existir sem anexo quantitativo, importada do Compras.gov.br ou cadastrada à mão. Apagar o anexo MUST NOT apagar a ARP, os itens nem os empenhos.

#### Scenario: API do Compras.gov.br fora do ar

- **WHEN** a busca da ARP falha
- **THEN** o usuário cadastra a ARP e os itens à mão, marcados "não sincronizado"
- **AND** a primeira sincronização bem-sucedida atualiza os itens pelo número, sem duplicar

#### Scenario: Anexo excluído

- **WHEN** um anexo quantitativo com ARP e empenhos é excluído
- **THEN** a ARP fica sem anexo e os empenhos continuam intactos

### Requirement: Nota de empenho com itens

Um empenho SHALL ter um ou mais itens, cada um com valor e, quando houver, item da ARP, item de compra, quantidade e preço unitário. Empenho estimativo ou global MUST ser aceito só com valor.

#### Scenario: Uma NE para três itens da ata

- **WHEN** a NE 2026NE000123 cobre arroz, feijão e óleo da mesma ARP
- **THEN** ela é um empenho com três itens
- **AND** o saldo empenhado de cada item da ARP soma só o seu item

### Requirement: Somatório da dispensa por valor

Ao registrar uma dispensa por valor, o sistema SHALL somar as dispensas do mesmo inciso, unidade gestora, exercício e ramo de atividade (classe do PDM no CATMAT, ou descrição do serviço — IN SEGES/ME 67/2021, art. 4º, § 2º) e comparar com o limite vigente da tabela de limites. Dispensa sem valor MUST NOT contar como zero: o aviso diz que o total é um piso. Acima do limite, o sistema MUST avisar com o total e a composição e MUST pedir justificativa; MUST NOT recusar o registro.

#### Scenario: Terceira dispensa de gêneros no ano

- **WHEN** a soma das dispensas do inciso II na classe 8905 (carnes) no exercício, com a nova, passa do limite vigente (R$ 65.492,11 em 2026)
- **THEN** o aviso mostra o limite, o total, as dispensas que compõem a soma e cita o art. 75, § 1º
- **AND** a contratação só fica completa com a justificativa preenchida

#### Scenario: Ano sem limite cadastrado

- **WHEN** não há limite com vigência no exercício
- **THEN** o cálculo usa o último limite conhecido e mostra a pendência "cadastre o limite vigente"
