## MODIFIED Requirements

### Requirement: Adaptar escolhe as refeições

O usuário SHALL poder escolher quais refeições levar ao copiar um evento de cozinha ou adaptar um
cardápio de apoio com mais de uma refeição. A cópia MUST conter só as refeições escolhidas, com os
grupos (e a contagem) e as preparações delas. Sem escolha explícita, todas as refeições são copiadas.
O modelo global de evento tem uma refeição só, e adaptá-lo leva essa refeição; juntar refeições de
modelos diferentes é a composição do evento da cozinha (`menu-occasion-catalog`). Toda refeição
copiada MUST guardar o modelo de origem.

#### Scenario: Só o coquetel do evento da cozinha

- **WHEN** a cozinha copia o evento dela "Passagem de Comando" marcando só a refeição "Coquetel"
- **THEN** a cópia tem uma refeição, "Coquetel", com os grupos e as preparações dela
- **AND** o jantar do evento copiado não vem

#### Scenario: Adaptar um modelo global de evento

- **WHEN** a cozinha adapta "Padrão B › Coquetel › Evento Coquetel Padrão B"
- **THEN** a cópia tem a refeição do coquetel, sem tela de escolha de refeições
- **AND** a refeição guarda o modelo de origem
