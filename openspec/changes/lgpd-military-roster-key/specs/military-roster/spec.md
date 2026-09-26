## ADDED Requirements

### Requirement: Identificação militar pelo SARAM

Os apps SHALL identificar a pessoa do efetivo pelo SARAM (`nrOrdem`), que MUST ser único e não nulo. O CPF MUST NOT ser chave de nenhuma tabela nem ser lido por nenhum app, exceto mascarado no perfil do próprio titular.

#### Scenario: Perfil do comensal

- **WHEN** o comensal abre o próprio perfil
- **THEN** ele vê posto, nome de guerra e o CPF mascarado
- **AND** nenhum outro usuário vê o CPF dele em tela nenhuma

#### Scenario: Leitura por outro app

- **WHEN** o sucont ou o rumaer precisa do posto e do nome de guerra de alguém
- **THEN** a leitura é pela view de identificação, pelo SARAM, sem o CPF
