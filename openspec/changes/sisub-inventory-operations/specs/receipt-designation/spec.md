# receipt-designation (delta)

## ADDED Requirements

### Requirement: Designação de gestor, fiscais e comissão
O sistema SHALL registrar designações por empenho, contrato/ARP ou, para recebimento sem contrato, por unidade: pessoa, papel (`manager`, `technical_inspector`, `administrative_inspector`, `sectoral_inspector`, `committee_member`, e substitutos), fonte (`ato` — boletim ou portaria; `empenho` — o próprio empenho nomeia o responsável; `permanente` — ato permanente da unidade para recebimento de gêneros), identificação da fonte e vigência. Designação SHALL ser cadastrada por `unit` nível 3 e MUST NOT ser apagada, apenas encerrada.

#### Scenario: Cadastro de fiscal
- **WHEN** o gestor de unidade registra o Sgt Silva como fiscal técnico do empenho 2026NE000123 pelo BI nº 45
- **THEN** a designação fica vigente e aparece no painel do empenho

#### Scenario: Designação pelo empenho
- **WHEN** o empenho já nomeia o responsável pelo recebimento e o gestor registra a designação com fonte `empenho`
- **THEN** a designação vale para os recebimentos daquele empenho, sem exigir boletim separado

#### Scenario: Encerramento
- **WHEN** a designação é encerrada por troca de fiscal
- **THEN** ela deixa de valer a partir da data informada e os recebimentos anteriores mantêm a referência

### Requirement: Recebimento exige designação vigente
Registrar recebimento provisório SHALL exigir que o ator tenha designação vigente de fiscal (ou substituto) para o empenho/contrato do recebimento, ou para a unidade quando não houver empenho; efetivar o definitivo SHALL exigir designação vigente de gestor ou membro de comissão. A verificação MUST ocorrer no servidor, além do PBAC `storage`, e a designação usada SHALL ser gravada no recebimento e impressa no termo.

#### Scenario: Almoxarife sem designação
- **WHEN** um operador com `storage` nível 3 sem designação tenta efetivar o definitivo
- **THEN** o sistema recusa informando que é necessária designação de gestor ou comissão

#### Scenario: Termo com designação
- **WHEN** o gestor designado efetiva o definitivo
- **THEN** o termo mostra nome, papel e ato de designação

### Requirement: Comissão no inventário formal
Contagem do tipo `annual` ou `responsibility_transfer` SHALL exigir comissão designada para a unidade, e sua aprovação SHALL ser feita por membro dessa comissão, sem exceção de segregação.

#### Scenario: Inventário anual sem comissão
- **WHEN** alguém tenta abrir inventário anual numa unidade sem comissão vigente
- **THEN** o sistema recusa indicando o cadastro da comissão
