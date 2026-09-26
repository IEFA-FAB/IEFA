## ADDED Requirements

### Requirement: Vocabulário da tela alinhado à Lei 14.133/2021

Os textos de interface e de exportação do planejamento da contratação SHALL usar os termos da Lei 14.133/2021, do Decreto 11.462/2023 (SRP) e do Decreto 10.947/2022 (PCA) quando o conceito for o mesmo. SHALL NOT usar termo da norma para outro conceito:

- "ata" para o anexo quantitativo;
- "publicar" para concluir o anexo interno;
- "margem" para o acréscimo de quantidade;
- "grupo" ou "lote" para a segmentação das contratações.

#### Scenario: Concluir o anexo

- **WHEN** o chefe do rancho finaliza o anexo quantitativo
- **THEN** o botão e o status dizem "Concluir" e "Concluído", nunca "Publicar"

#### Scenario: Acréscimo de quantidade

- **WHEN** o anexo mostra a folga da quantidade máxima sobre a estimada
- **THEN** a coluna se chama "Acréscimo sobre a estimada (%)" e a justificativa se chama "Justificativa da quantidade máxima"

### Requirement: Previsão de demanda na Gestão Cozinha

A aba "Suprimentos" SHALL se chamar "Previsão de demanda". O envio da nutricionista SHALL ter o ciclo `pending → sent → reviewed`. O `reviewed` MUST ser gravado na primeira importação da previsão num anexo, com a data e o usuário. Cada importação MUST ser registrada com o anexo, e a previsão MUST continuar disponível para os anexos das outras contratações.

#### Scenario: Nutricionista vê o retorno

- **WHEN** a unidade importa a previsão enviada pela cozinha no anexo "Carnes 2027"
- **THEN** a cozinha vê a previsão como "Recebida pela unidade", com a data e o nome do anexo

#### Scenario: A mesma previsão em duas contratações

- **WHEN** a previsão já entrou no anexo "Carnes 2027" e o chefe do rancho abre o wizard do anexo "Estocáveis 2027"
- **THEN** o wizard oferece a mesma previsão para importar e informa que ela já entrou em "Carnes 2027"
