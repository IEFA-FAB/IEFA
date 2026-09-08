# equipment-fleet-report

## ADDED Requirements

### Requirement: Relatório de condição da cozinha
A Gestão Cozinha SHALL dispor, em `/kitchen/$kitchenId/equipment`, de uma visão de **Condição** com: contagem de unidades por condição derivada (`operational`, `degraded`, `down`, `retired`), lista das panes abertas ordenadas por severidade e tempo em aberto, e histórico das panes encerradas com autor e desfecho. Leitura SHALL exigir `kitchen` nível 1; ações de resolver/descartar, nível 2.

#### Scenario: Pane aberta há mais tempo primeiro
- **WHEN** existem duas panes inoperantes abertas, uma de ontem e uma de duas semanas atrás
- **THEN** a de duas semanas aparece primeiro, com o tempo em aberto explícito

#### Scenario: Sem panes
- **WHEN** a cozinha não tem nenhuma pane aberta
- **THEN** a visão mostra o resumo por condição e um estado vazio que diz isso, sem sugerir erro

### Requirement: Relatório de manutenção da cozinha
A Gestão Cozinha SHALL dispor de uma visão de **Manutenção** com a matriz unidade × plano aplicável, cada célula em exatamente um de três estados — `em dia`, `vencida há N dias`, `sem registro` — conforme o cálculo derivado de vencimento. Os três estados MUST ser visualmente distinguíveis entre si; `sem registro` MUST NOT ser apresentado como vencido.

#### Scenario: Registro a partir da célula
- **WHEN** o gestor clica numa célula vencida
- **THEN** pode registrar a execução daquele plano naquela unidade, e a célula passa a `em dia`

### Requirement: Relatório de frota na Análise Global
O sistema SHALL expor `/analytics/equipment`, exigindo `analytics` nível 2, agregando o parque de **todas** as cozinhas **por papel**: cozinhas com e sem unidade operacional de cada papel, panes inoperantes abertas por tempo em aberto, planos com mais unidades vencidas e distribuição do parque. Modelo e cozinha SHALL ser filtros, não eixos primários. A tela MUST ser somente leitura.

#### Scenario: Cobertura por papel
- **WHEN** o gestor global abre o relatório
- **THEN** vê, para cada papel, quantas cozinhas têm ao menos uma unidade operacional e quantas não têm

#### Scenario: Unidade com pane não conta como cobertura
- **WHEN** a única unidade de forno combinado de uma cozinha tem pane inoperante aberta
- **THEN** aquela cozinha é contada como **sem** cobertura daquele papel

#### Scenario: Recall de fabricante
- **WHEN** o gestor filtra por um modelo específico
- **THEN** vê todas as unidades daquele modelo na FAB, com cozinha e condição

#### Scenario: Tentativa de escrita
- **WHEN** o relatório é aberto por um usuário com `analytics` nível 3
- **THEN** nenhuma ação de edição do parque é oferecida — a correção do dado é da cozinha

### Requirement: Apresentação sem faixa de acento lateral
As telas deste change MUST distinguir severidade e condição por badge, ícone ou tint de fundo, e MUST NOT usar borda lateral colorida acima de 1px (`border-l-*` / `border-r-*` como acento) em cartão, item de lista ou alerta, conforme a proibição global do repositório.

#### Scenario: Cartão de unidade parada
- **WHEN** uma unidade está `down`
- **THEN** o cartão a distingue por badge e tint de fundo, sem barra colorida lateral
