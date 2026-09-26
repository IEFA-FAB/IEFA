## ADDED Requirements

### Requirement: Preparação incluída pelo turno no dia

Quem opera a produção (`kitchen-production:1`) SHALL poder incluir uma preparação no cardápio do dia de hoje, com motivo. O planejamento de outras datas e dos modelos MUST continuar exclusivo de `kitchen:2`. A inclusão MUST gerar a tarefa de produção e MUST aparecer como pendência de revisão para a nutricionista.

#### Scenario: Faltou o peixe e entrou frango

- **WHEN** o chefe do turno inclui "Frango grelhado" no almoço de hoje com o motivo "peixe não entregue"
- **THEN** a tarefa aparece no quadro do turno
- **AND** a Gestão Cozinha mostra "1 preparação incluída no turno a revisar"

#### Scenario: Data futura continua do planejamento

- **WHEN** o turno tenta incluir uma preparação para amanhã
- **THEN** a inclusão é recusada com "Planejar outras datas é da Gestão Cozinha"

### Requirement: Preparação provisória

O turno SHALL poder criar, no mesmo gesto, uma preparação provisória da cozinha só com o nome. Ela MUST funcionar no dia e MUST NOT entrar em modelo de cardápio nem em anexo quantitativo até a ficha técnica ser completada.

### Requirement: O dia não fica aberto

Saída de estoque com data real anterior SHALL ser aceita com motivo enquanto a competência não estiver fechada. Requisição do dia não fechada MUST ser fechada automaticamente como `closed_unexplained`, gerando pendência de justificativa, e MUST NOT travar a aprovação da contagem.
