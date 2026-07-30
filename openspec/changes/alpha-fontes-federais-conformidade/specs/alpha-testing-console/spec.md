## ADDED Requirements

### Requirement: Console autenticado e não público
O sistema SHALL expor o console do Projeto α em rotas autenticadas do portal, restritas aos perfis com acesso ao alpha, e SHALL NEVER divulgá-las na navegação pública do portal.

#### Scenario: Acesso sem sessão
- **WHEN** um visitante sem sessão acessa uma rota do console
- **THEN** é redirecionado para autenticação e nenhum dado do alpha é carregado

#### Scenario: Ausência na navegação pública
- **WHEN** o menu público do portal é renderizado
- **THEN** nenhuma rota do console aparece

### Requirement: Painel de fontes normativas
O console SHALL listar as fontes do registry com autoridade, versão vigente, data da última verificação e erro corrente, e SHALL permitir disparar a coleta de uma fonte sob demanda.

#### Scenario: Coleta sob demanda
- **WHEN** o usuário dispara a coleta de uma fonte
- **THEN** o painel mostra o andamento e, ao fim, se houve versão nova, quantos itens foram verificados ou qual erro ocorreu

#### Scenario: Fonte com erro
- **WHEN** uma fonte está com `last_error` preenchido
- **THEN** o painel destaca a fonte com a mensagem de erro, sem usar faixa lateral colorida de acento

#### Scenario: Regras defasadas após atualização
- **WHEN** existem regras em `needs_review`
- **THEN** o painel exibe a contagem e permite navegar até elas

### Requirement: Inspetor de modelo AGU
O console SHALL exibir a árvore de seções de um modelo ingerido, com notas explicativas, dispositivos citados e placeholders de cada seção.

#### Scenario: Navegação pela árvore
- **WHEN** o usuário abre um modelo ingerido
- **THEN** vê a hierarquia de seções na ordem do documento, com indicação de obrigatoriedade

#### Scenario: Nota com dispositivo
- **WHEN** o usuário abre uma seção que tem nota explicativa
- **THEN** vê o texto da nota e os dispositivos citados

#### Scenario: Comparação entre versões
- **WHEN** um modelo tem mais de uma versão ingerida
- **THEN** o usuário pode ver quais seções foram adicionadas, removidas ou renomeadas entre as versões

### Requirement: Submissão e conferência da extração
O console SHALL permitir enviar um ETP/TR e conferir a extração lado a lado com o documento original, com destaque do trecho de origem de cada campo.

#### Scenario: Conferência de campo
- **WHEN** o usuário seleciona um campo do JSON extraído
- **THEN** o trecho correspondente do documento é destacado

#### Scenario: Campo ausente
- **WHEN** um campo obrigatório não foi encontrado no documento
- **THEN** ele é exibido explicitamente como ausente

#### Scenario: Reextração
- **WHEN** o usuário dispara nova extração da mesma submissão
- **THEN** a nova extração é exibida e a anterior continua acessível

### Requirement: Relatório de conformidade navegável
O console SHALL apresentar o resultado de uma execução em abas de divergência estrutural, achados de conformidade e dados de execução, com filtro por severidade.

#### Scenario: Achado até o documento
- **WHEN** o usuário abre um achado de conformidade
- **THEN** vê a mensagem, o dispositivo citado, a sugestão e o trecho do documento que motivou o apontamento

#### Scenario: Transparência de cobertura
- **WHEN** o relatório é aberto
- **THEN** exibe quantas regras foram aplicadas, quantas não foram avaliadas, quantos achados foram descartados e quais versões de modelo e normas foram usadas

#### Scenario: Diferenciação visual de severidade
- **WHEN** achados de severidades diferentes são listados
- **THEN** a distinção usa etiqueta e tonalidade de fundo, sem faixa lateral colorida de acento e sem cantos arredondados, conforme o contrato de estilo do portal

### Requirement: Bancada de calibração de regra
O console SHALL permitir executar uma única regra contra um trecho de texto arbitrário e SHALL permitir promover uma regra de `draft` para `active` ou devolvê-la a `draft`.

#### Scenario: Teste isolado de regra
- **WHEN** o usuário executa uma regra contra um trecho colado
- **THEN** vê o veredito, a confiança, os trechos da norma recuperados e se o guard de citação aprovaria o achado

#### Scenario: Promoção de regra semeada
- **WHEN** o usuário promove uma regra `draft` revisada
- **THEN** a regra passa a `active` e passa a ser aplicada nas próximas execuções

#### Scenario: Promoção exige revisão explícita
- **WHEN** regras são semeadas automaticamente a partir de notas do modelo
- **THEN** nenhuma delas se torna `active` sem ação explícita do usuário na bancada
