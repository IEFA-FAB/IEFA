## ADDED Requirements

### Requirement: Perfil de dados fixos por usuário

O sistema SHALL guardar, por usuário, os dados que se repetem em todo documento: OM (nome, sigla, setor, endereço, telefone, e-mail institucional), signatário (nome, posto, quadro, cargo), localidade padrão e prefixo do NUP. O perfil SHALL ser privado ao seu dono.

#### Scenario: Documento novo nasce preenchido

- **WHEN** um usuário com perfil salvo inicia um documento novo
- **THEN** OM, signatário e localidade já vêm preenchidos, e o restante fica em branco

#### Scenario: Perfil é de quem o criou

- **WHEN** um usuário tenta ler ou alterar o perfil de outro
- **THEN** a operação é negada, independentemente do identificador enviado

#### Scenario: Sem perfil

- **WHEN** um usuário sem perfil inicia um documento
- **THEN** a ferramenta funciona normalmente, com os campos em branco, e nada é inventado

### Requirement: O perfil não guarda contador vivo

O perfil NÃO SHALL armazenar nem sugerir o número sequencial do setor.

#### Scenario: Sequencial fica com o usuário

- **WHEN** um documento novo é criado a partir do perfil
- **THEN** o campo de sequencial vem vazio, e o documento sai como "s/nº" até o usuário informá-lo

### Requirement: O perfil não autoriza a IA a inventar identidade

A IA SHALL continuar sem propor numeração, NUP, OM, localidade, data ou signatário. O perfil preenche esses campos; a ausência de perfil vira pergunta, nunca palpite.

#### Scenario: Campo de identidade ausente e sem perfil

- **WHEN** o usuário não tem perfil e pede à IA para completar o documento
- **THEN** a IA pergunta pelos dados da OM e do signatário em vez de preenchê-los
