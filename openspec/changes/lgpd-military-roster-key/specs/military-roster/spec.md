## ADDED Requirements

### Requirement: CPF não é chave nem leitura de app

O CPF MUST NOT ser chave primária nem estrangeira de nenhuma tabela. Código de app MUST NOT ler o CPF nem o nome completo do espelho fora da allowlist da regra estática, e a allowlist MUST dar o motivo de cada entrada. O perfil do próprio titular SHALL mostrar o CPF mascarado.

#### Scenario: Perfil do comensal

- **WHEN** o comensal abre o próprio perfil
- **THEN** ele vê posto, nome de guerra e o CPF mascarado

#### Scenario: Leitura nova do CPF

- **WHEN** um PR acrescenta `select("nrCpf")` num app fora da allowlist
- **THEN** o gate de opengrep reprova com a instrução de ler `core.military_identity`

### Requirement: Identificação pelo SARAM sem trancar quem chegou depois

Os apps SHALL identificar a pessoa pelo SARAM por `core.military_identity`. Um SARAM ainda ausente do espelho MUST continuar gravável na conta do usuário; ele aparece sem posto até a próxima carga.

#### Scenario: Militar recém-chegado

- **WHEN** o militar grava o SARAM antes de a carga trazê-lo
- **THEN** a gravação é aceita e o nome de exibição cai no e-mail até a carga
