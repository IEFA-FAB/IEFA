# Spec Delta

## Purpose

Define como os campos de entrada do hub SUCONT (texto, seleção, busca, área de texto) se comportam
para quem opera o sistema: foco, densidade, ícone e ação dentro do campo, somente leitura, erro e
legibilidade, iguais em todas as ferramentas do hub.

## ADDED Requirements

### Requirement: Foco visível pelo teclado
Todo campo de entrada do sucont SHALL mostrar indicação de foco quando recebe foco pelo teclado,
inclusive quando está embutido num contêiner que desenha a borda do campo.

#### Scenario: Campo isolado recebe foco por Tab
- **WHEN** o usuário navega com Tab até um campo de texto ou seleção
- **THEN** o campo exibe o anel de foco do tema

#### Scenario: Campo embutido num grupo com ícone ou botão
- **WHEN** o foco de teclado entra no campo de busca do cabeçalho do hub ou no campo de mensagem do assistente
- **THEN** o contorno do grupo inteiro exibe o anel de foco do tema

### Requirement: Uma única cor de foco
O realce de foco dos campos SHALL usar a mesma cor em todas as ferramentas do hub, e o anel SHALL
aparecer só na navegação por teclado, não no clique do mouse.

#### Scenario: Foco por clique
- **WHEN** o usuário clica num campo de qualquer ferramenta
- **THEN** o campo não exibe anel de foco de cor própria da ferramenta

#### Scenario: Duas ferramentas lado a lado
- **WHEN** o usuário foca um campo no auditor e outro no analista de saldo alongado
- **THEN** os dois exibem a mesma cor de realce

### Requirement: Densidade alinhada na mesma faixa
Campos na mesma linha de controles SHALL ter a mesma altura, seja qual for o tipo (texto, data,
seleção, busca com seleção).

#### Scenario: Faixa de controles da mensagem
- **WHEN** a tela mostra lado a lado nº da mensagem, data de envio, tipo e prazo
- **THEN** os quatro campos têm a mesma altura

#### Scenario: Toolbar compacta de gráfico
- **WHEN** uma toolbar de gráfico ou ranking usa controles compactos
- **THEN** todos os controles dela usam a mesma altura compacta

### Requirement: Mesmo grupo de campos, mesma aparência
O mesmo conjunto de dados de entrada (nº da mensagem, data de envio, tipo, prazo) SHALL ter a mesma
aparência e o mesmo tipo de entrada em todas as telas que o pedem.

#### Scenario: Prazo como data
- **WHEN** o usuário informa o prazo da mensagem em qualquer modal ou painel
- **THEN** o campo aceita a data pelo seletor de data, não por texto `DD/MM/AAAA`

### Requirement: Valor legível e distinto do placeholder
O valor digitado ou selecionado SHALL ter o contraste do texto principal, distinto do placeholder.

#### Scenario: Seleção feita
- **WHEN** o usuário escolhe uma opção num seletor compacto
- **THEN** o valor aparece com a cor do texto principal, e o placeholder segue apagado

### Requirement: Campo somente leitura reconhecível
Campo cujo valor o sistema atribui e o usuário não edita SHALL ser reconhecível como somente leitura
e SHALL continuar selecionável e copiável.

#### Scenario: Nº atribuído pelo sistema
- **WHEN** o modal mostra o número de mensagem já atribuído
- **THEN** o campo aparece como somente leitura, não aceita edição e permite selecionar e copiar o valor

### Requirement: Erro anunciado
Campo com valor inválido SHALL ser marcado como inválido para tecnologia assistiva e SHALL exibir o
destaque de erro do tema.

#### Scenario: E-mail inválido no login
- **WHEN** o usuário sai do campo de e-mail do login com um endereço inválido
- **THEN** o campo é anunciado como inválido pelo leitor de tela e exibe a borda de erro

### Requirement: Legível no mobile sem zoom
Em telas estreitas, o texto dos campos SHALL ter tamanho que não dispare o zoom automático do
navegador móvel ao focar.

#### Scenario: Focar campo no celular
- **WHEN** o usuário foca um campo de texto num celular
- **THEN** a página não dá zoom automático

### Requirement: Mesma aparência nos dois temas
A diferença visual de um campo em relação ao fundo SHALL se manter tanto no tema claro quanto no
escuro.

#### Scenario: Trocar para o tema escuro
- **WHEN** o usuário troca o tema para escuro com um formulário aberto
- **THEN** os campos seguem distinguíveis do fundo, sem fundo que exista só num dos temas

### Requirement: Ícone e ação dentro do campo
Busca, senha e mensagem SHALL oferecer o ícone ou a ação dentro do contorno do campo, com área de
clique própria e sem sobrepor o texto digitado.

#### Scenario: Senha com mostrar ou ocultar
- **WHEN** o usuário digita uma senha longa e aciona "mostrar senha"
- **THEN** o botão fica dentro do campo, o texto não passa por baixo do botão e o foco segue no campo

#### Scenario: Busca com lupa
- **WHEN** o usuário digita na busca de uma tabela
- **THEN** a lupa fica dentro do campo e o texto começa depois dela
