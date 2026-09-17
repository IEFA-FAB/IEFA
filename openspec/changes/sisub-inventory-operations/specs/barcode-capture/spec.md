# barcode-capture (delta)

## ADDED Requirements

### Requirement: Campo de leitura focado como caminho principal
Toda tela de leitura (conferência, saída, contagem, ajuste, etiquetas) SHALL exibir um campo de leitura visível que recebe o foco ao abrir a tela e depois de cada leitura processada. O Enter ou Tab terminador de uma leitura MUST NOT submeter formulário nem mover o foco para outro campo.

#### Scenario: Leituras seguidas
- **WHEN** o operador lê três códigos em sequência sem tocar no mouse
- **THEN** as três leituras são processadas e o foco permanece no campo de leitura

### Requirement: Captura global calibrada
Quando o foco não estiver em campo editável, a tela SHALL reconhecer como leitura uma rajada de teclas cujo intervalo e comprimento mínimo seguem a calibração da estação, terminada pelo terminador configurado ou por timeout sem novas teclas. A captura global MUST ficar desligada enquanto o foco estiver em campo editável, e os caracteres de uma rajada reconhecida MUST NOT ser inseridos em nenhum campo.

#### Scenario: Leitura com foco num botão
- **WHEN** o foco está no botão "Aceitar conforme faturado" e o operador lê um EAN-13
- **THEN** a leitura é processada e o botão não é acionado

#### Scenario: Leitor sem sufixo
- **WHEN** o leitor da estação não envia Enter e a calibração registrou término por timeout
- **THEN** a leitura é processada após o intervalo configurado sem nova tecla

### Requirement: Calibração do leitor
O sistema SHALL oferecer a tela "Testar leitor" que mostra texto bruto, intervalo medido entre teclas, código interpretado e identificadores GS1 extraídos, e SHALL persistir o perfil calibrado (intervalo máximo, comprimento mínimo, terminador, prefixo, sufixo e substituto do separador GS) **por usuário e cozinha no banco**. O perfil MUST NOT ser gravado em armazenamento do navegador: chave nova ali exige versão nova da Política de Cookies.

#### Scenario: Calibração de leitor lento
- **WHEN** o operador lê um código de teste com um leitor que emite teclas a 60 ms
- **THEN** a tela propõe intervalo máximo acima do medido e salva o perfil ao confirmar

#### Scenario: Perfil segue o operador
- **WHEN** o mesmo operador abre a conferência em outra máquina da cozinha
- **THEN** o perfil calibrado por ele naquela cozinha é aplicado

#### Scenario: Layout de teclado corrompendo GS1
- **WHEN** a leitura de teste de uma etiqueta GS1-128 mostra o lote grudado na validade
- **THEN** a tela indica que o separador GS não chegou e orienta configurar o substituto

### Requirement: Leitura por câmera
O sistema SHALL permitir leitura de EAN-8, EAN-13, UPC-A, UPC-E, ITF-14, CODE-128 (incluindo GS1-128 e o código misto do DANFE) e DataMatrix pela câmera, com `BarcodeDetector` quando disponível e biblioteca carregada sob demanda caso contrário. A câmera MUST NOT ser pedida sem ação explícita do operador.

#### Scenario: Celular sem BarcodeDetector
- **WHEN** o operador abre a leitura por câmera num navegador sem `BarcodeDetector`
- **THEN** o leitor alternativo é carregado nesse momento e a leitura produz o mesmo resultado

### Requirement: Interpretação da leitura
Toda leitura SHALL ser interpretada por função pura de `@iefa/sisub-domain` que devolve um de: `gtin` (GTIN-8/12/13/14 com dígito verificador válido, normalizado a 14 dígitos); `gs1` (identificadores de aplicação, no mínimo 01, 02, 10, 15, 17, 30, 37 e 310n–315n, com datas AAMMDD convertidas, dia `00` como último dia do mês, e peso com a casa decimal do `n`); `lot_label` (etiqueta interna de lote do sisub); `nfe_access_key` (44 caracteres, posições 7–20 alfanuméricas, DV módulo 11 com valor ASCII − 48); ou `unknown` com motivo.

#### Scenario: Etiqueta GS1 com lote e validade
- **WHEN** a leitura é `]C101078912345678951726033110L4521`
- **THEN** o resultado é `gs1` com GTIN `07891234567895`, validade 2026-03-31 e lote `L4521`

#### Scenario: Peso variável
- **WHEN** a leitura GS1 contém `3102001250`
- **THEN** o resultado traz peso líquido de 12,50 KG

#### Scenario: Chave de acesso com CNPJ alfanumérico
- **WHEN** a leitura é uma chave de 44 caracteres com letras nas posições do CNPJ e DV válido
- **THEN** o resultado é `nfe_access_key` com UF, AAMM de emissão, CNPJ do emitente, modelo, série e número

#### Scenario: GTIN com dígito errado
- **WHEN** a leitura é um EAN-13 com dígito verificador inválido
- **THEN** o resultado é `unknown` com motivo "dígito verificador inválido" e nenhuma ação de negócio é disparada
