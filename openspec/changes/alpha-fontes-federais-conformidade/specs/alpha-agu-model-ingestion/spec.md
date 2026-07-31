## ADDED Requirements

### Requirement: Descoberta dos modelos da Lei 14.133/21 na AGU
O sistema SHALL percorrer as categorias de modelos da Lei 14.133/21 publicadas pela AGU, extrair os arquivos `.docx` listados e derivar o rótulo de versão do sufixo de mês/ano do nome do arquivo.

#### Scenario: Categoria com modelos listados
- **WHEN** o adapter percorre uma categoria de modelos
- **THEN** retorna um item por arquivo `.docx` com URL absoluta, título e `version_label` derivado do sufixo (por exemplo `mai-26`)

#### Scenario: Arquivo sem sufixo de versão reconhecível
- **WHEN** um `.docx` listado não tem sufixo de mês/ano no nome
- **THEN** o `version_label` recebe o hash curto do conteúdo e o item é ingerido normalmente

#### Scenario: Estrutura da página mudou
- **WHEN** uma categoria retorna zero arquivos `.docx` ou menos que o mínimo esperado configurado
- **THEN** a fonte registra erro em `last_error` e a ingestão daquela categoria é abortada sem supersede de nenhuma versão vigente

### Requirement: Extração da árvore de seções do modelo
O sistema SHALL converter cada modelo `.docx` em uma árvore de `structure_node`, com caminho hierárquico, ordinal, nível e título normalizado para casamento.

#### Scenario: Modelo com hierarquia de títulos
- **WHEN** um modelo com seções e subseções é parseado
- **THEN** cada seção vira um `structure_node` com `path` refletindo a hierarquia e `ordinal` refletindo a ordem de aparição no documento

#### Scenario: Título normalizado para casamento
- **WHEN** uma seção tem título `"3. DA JUSTIFICATIVA DA CONTRATAÇÃO"`
- **THEN** `title_norm` é gravado sem numeração, sem acento, em minúsculas (`"da justificativa da contratacao"`)

#### Scenario: Parágrafo sem heading identificável
- **WHEN** um bloco de texto aparece sem título de seção acima dele
- **THEN** o conteúdo é anexado ao `body` do último nó aberto, sem abortar o parse

### Requirement: Exclusão do acervo de modelos revogados
O sistema SHALL ignorar as categorias de arquivo histórico da AGU e SHALL registrar quantos arquivos foram ignorados por esse motivo.

#### Scenario: Modelo em categoria de arquivo histórico
- **WHEN** a descoberta encontra um `.docx` sob a categoria de modelos antigos
- **THEN** o arquivo não vira item de ingestão e é contabilizado como excluído no relatório

#### Scenario: Comparação nunca usa modelo revogado
- **WHEN** a comparação estrutural seleciona o modelo aplicável
- **THEN** nenhum modelo proveniente de categoria de arquivo histórico é candidato

### Requirement: Extração de notas explicativas com dispositivos citados
O sistema SHALL identificar as notas explicativas dos modelos da AGU — registradas como comentários ancorados ao parágrafo —, associá-las ao nó de seção correspondente e extrair as referências legais citadas.

#### Scenario: Comentário que não é nota explicativa
- **WHEN** um comentário do documento não é identificado como nota explicativa (por exemplo, orientação geral de uso do modelo)
- **THEN** ele não é persistido como nota nem gera regra

#### Scenario: Nota citando dispositivo
- **WHEN** uma nota explicativa contém `"conforme art. 6º, XXIII, 'a', da Lei nº 14.133/21"`
- **THEN** é criada uma `explanatory_note` ligada ao nó, com `cited_refs` contendo a norma e o dispositivo estruturados

#### Scenario: Nota sem citação legal
- **WHEN** uma nota explicativa não cita nenhum dispositivo
- **THEN** a nota é persistida com `cited_refs` vazio

#### Scenario: Modelo sem notas
- **WHEN** um modelo não contém nenhum quadro de nota
- **THEN** a ingestão conclui com sucesso e nenhuma nota é criada

### Requirement: Semeadura de regras a partir das notas
O sistema SHALL criar uma `checklist_rule` com `origin = 'agu_note'` e `status = 'draft'` para cada nota explicativa que cite ao menos um dispositivo, e SHALL NEVER criar regra já ativa a partir de extração automática.

#### Scenario: Regra semeada nasce em rascunho
- **WHEN** uma nota com citação legal é ingerida
- **THEN** a regra criada tem `status = 'draft'` e não é aplicada em nenhuma execução de verificação

#### Scenario: Reingestão não duplica regra
- **WHEN** uma nova versão do modelo repete a mesma nota, já semeada e revisada
- **THEN** nenhuma regra duplicada é criada e a regra existente mantém seu status

### Requirement: Extração de placeholders de preenchimento
O sistema SHALL registrar os campos de preenchimento do modelo (marcadores entre colchetes ou equivalentes) como `placeholder` ligado ao nó da seção.

#### Scenario: Marcador de preenchimento
- **WHEN** uma seção do modelo contém `[INSERIR O OBJETO DA CONTRATAÇÃO]`
- **THEN** um `placeholder` é criado com o token e ligado ao nó daquela seção

#### Scenario: Placeholder não vira regra
- **WHEN** placeholders são extraídos
- **THEN** nenhuma `checklist_rule` é criada a partir deles
