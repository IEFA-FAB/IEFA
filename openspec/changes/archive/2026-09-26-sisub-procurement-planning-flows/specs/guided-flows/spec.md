## ADDED Requirements

### Requirement: Fluxos por módulo

O sistema SHALL oferecer, em cada módulo que tiver fluxo, um item de navegação "Fluxos" com a lista dos roteiros daquele módulo. Um fluxo MUST aparecer só para quem tem permissão no módulo dele; nenhum fluxo reúne telas de módulos diferentes. A Gestão Unidade MUST oferecer "Planejar contratação" e a Gestão Cozinha MUST oferecer "Prever demanda para compra".

#### Scenario: Nutricionista não vê o fluxo da unidade

- **WHEN** um usuário com `kitchen:2` e sem `unit` abre a navegação
- **THEN** ele vê "Fluxos" na Gestão Cozinha com "Prever demanda para compra"
- **AND** não vê "Planejar contratação"

### Requirement: Etapas com status derivado dos dados

Cada etapa de um fluxo SHALL ter título, objetivo em uma frase, status (`done`, `attention`, `blocked`, `todo`), lista de pendências e uma ação principal que leva à tela existente que resolve a etapa. O status MUST ser calculado dos dados a cada leitura; não existe marcação manual de etapa concluída.

#### Scenario: Etapa conclui sozinha quando o dado aparece

- **WHEN** a cozinha da OM ainda não tem cardápio semanal
- **THEN** a etapa "Cardápios das cozinhas" do fluxo da unidade fica `blocked` com a pendência "Cozinha X sem cardápio semanal"
- **WHEN** a nutricionista cadastra um cardápio semanal com itens
- **THEN** na próxima leitura a etapa deixa de estar bloqueada, sem ação do chefe do rancho

#### Scenario: Voltar ao fluxo

- **WHEN** o usuário segue a ação de uma etapa
- **THEN** a tela de destino abre com um atalho "Voltar ao fluxo"

### Requirement: Severidade e dono da pendência

Toda pendência SHALL ter severidade (`blocking`, `warning`, `info`), mensagem e, quando o próprio usuário pode resolvê-la, uma ação. Pendência que depende de outro módulo MUST ser apresentada sem link para o módulo alheio, dizendo quem resolve.

#### Scenario: Pendência da cozinha vista pela unidade

- **WHEN** a cozinha Y não enviou previsão de demanda
- **THEN** o fluxo da unidade mostra o aviso "Cozinha Y não enviou a previsão de demanda — quem envia é a nutricionista, no fluxo da cozinha"
- **AND** a pendência não tem link para a Gestão Cozinha

#### Scenario: Calendário da unidade visto pela cozinha

- **WHEN** a OM da cozinha tem a contratação "Carnes" prevista para março e março está dentro da antecedência configurada
- **THEN** o fluxo da cozinha mostra "A unidade planeja a contratação Carnes para março: envie a previsão de demanda"
