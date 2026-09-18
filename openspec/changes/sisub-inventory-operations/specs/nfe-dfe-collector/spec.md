# nfe-dfe-collector (delta)

> Condicionada à decisão Q1 do design. Se a decisão for negativa, esta capability é removida do change antes do archive.

## ADDED Requirements

### Requirement: Coletor único por raiz de CNPJ
Quando habilitado, o sistema SHALL executar o coletor `NFeDistribuicaoDFe` como tarefa agendada separada dos serviços públicos, com no máximo uma execução ativa por raiz de CNPJ garantida por lease com expiração no banco e avanço do `ultNSU` por compare-and-set. O certificado MUST ser lido de cofre de segredos e MUST NOT ser gravado em disco nem no banco; a conexão MUST validar a cadeia ICP-Brasil.

#### Scenario: Duas instâncias no deploy
- **WHEN** duas tarefas do coletor iniciam ao mesmo tempo para a mesma raiz
- **THEN** só uma obtém o lease e a outra termina sem consultar a SEFAZ

### Requirement: Regras de consumo da SEFAZ
O coletor SHALL consultar em sequência de NSU, SHALL aguardar no mínimo 60 minutos após resposta `cStat 137`, MUST parar e registrar alerta ao receber `cStat 656` sem nova consulta por 60 minutos, e SHALL alertar quando o cursor ficar mais de 30 dias sem avançar.

#### Scenario: Consumo indevido
- **WHEN** a SEFAZ responde `cStat 656`
- **THEN** o coletor registra o bloqueio, não consulta pelos próximos 60 minutos e o painel administrativo mostra o alerta

#### Scenario: Nenhum documento novo
- **WHEN** a SEFAZ responde `cStat 137`
- **THEN** a próxima consulta daquela raiz só ocorre após 60 minutos

### Requirement: Distribuição e manifestação
O coletor SHALL registrar `resNFe` como nota `announced` e `procNFe` como `available` (sujeita à verificação de coerência e à consulta de situação), distribuindo por unidade pelo destinatário; SHALL emitir `210210` automaticamente para notas de unidades cadastradas quando configurado; e SHALL aplicar eventos de cancelamento distribuídos à nota. As manifestações `210200`, `210220` e `210240` SHALL ser oferecidas ao operador (definitivo, nota não reconhecida, recusa total), nunca emitidas sem ação humana, com alerta quando o prazo de 180 dias da autorização estiver a menos de 15 dias.

#### Scenario: Nota emitida antes da entrega
- **WHEN** o fornecedor emite NF-e contra o CNPJ da unidade às 08:00
- **THEN** após a execução seguinte a nota aparece em "A caminho" como anunciada, e com itens após a ciência

#### Scenario: Recusa total
- **WHEN** o recebimento de uma nota é recusado por inteiro
- **THEN** o sistema oferece emitir `210240` e mostra o prazo restante
