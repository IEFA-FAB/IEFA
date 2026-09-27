## Context

A cadeia de execução da despesa do rancho foi modelada a partir de um caminho só (ver o levantamento
de 2026-09-26 na descrição do PR). Os pontos que decidem este desenho:

- `finance.empenho` é **por item de ARP**: `arp_item_id NOT NULL` com `ON DELETE CASCADE`,
  `quantidade_empenhada NOT NULL`, `valor_unitario NOT NULL` e `UNIQUE (unit_id, numero_empenho)`
  (`20260412_arp_empenho.sql:55-65`). Uma NE com três itens da ata não cabe.
- `procurement_arp.ata_id NOT NULL` (anexo quantitativo) com `CASCADE`; a ARP só nasce de
  `importArpItemsFn` (`arp.fn.ts:216`) e só com a API do Compras.gov.br respondendo.
- `applyDocumentBatchFn` (`reconciliation.fn.ts:142-166`) insere a NE sem `arp_item_id`, ignora o
  erro e marca o lote `applied`; o lote não se reaplica (hash e `claim_import_batch`).
- `supply_order.empenho_id NOT NULL`, e o trigger `supply_order_check_empenho` limita a OF pela
  **quantidade original** do empenho, ignorando reforço e anulação (que são por valor).
- `goods_receipt` só nasce da NF-e (`createReceiptFromNfeFn`); `source` já aceita `delivery_note` e
  `ad_hoc`, mas nenhuma função os cria. Não há como vincular NF-e, OF ou empenho depois.
- `procurement.contract_designation` não tem tela nem server fn: `requireDesignation` sempre lança.
- A dispensa por valor é decidida item a item (`replenishment.fn.ts:241`) com a constante de 2024.

O padrão de pendência já existe e é o que este desenho generaliza: saída sem saldo vira movimento
"a regularizar na contagem"; divergência de conservação ou validade no recebimento vira registro no
lote; pesquisa de preços fora da norma vira não conformidade com o que fazer.

## Goals / Non-Goals

**Goals**
- Todo caminho real de aquisição do rancho tem lugar no sistema, inclusive os que não passam por ata.
- Nenhum documento esquecido trava o trabalho do outro: registra-se o fato, a pendência aparece para
  quem corrige, e a correção posterior religa tudo sem refazer nada.
- As recusas que restam são as que a lei exige, e dizem o que fazer.

**Non-Goals:** ver "Não-objetivos" na proposta.

## Decisions

### D1. Contratação de origem é uma entidade própria

`procurement.acquisition` guarda **de onde vem o direito de gastar**, separado do instrumento e do
documento de despesa:

| coluna | conteúdo |
|---|---|
| `unit_id` | OM compradora |
| `kind` | `registro_precos` · `licitacao` · `dispensa` · `inexigibilidade` · `contrata_mais_brasil` · `suprimento_fundos` · `outra` |
| `srp_role` | só em `registro_precos`: `gerenciador` · `participante` · `nao_participante` (adesão) |
| `instrument` | `ata` · `contrato` · `nota_empenho` (art. 95: a NE substitui o contrato) · `outro` |
| `legal_basis` | texto livre ("Lei 14.133/2021, art. 75, II") |
| `direct_contract_clause` | inciso do art. 75: `I` · `II` · … (só em `dispensa`; alimenta o somatório) |
| `nd` | natureza de despesa até o subitem (ex. `33903007`), como em `finance.empenho.nd` |
| `activity_line` | **ramo de atividade** do somatório: classe de materiais do PDM (CATMAT) ou descrição do serviço (IN SEGES/ME 67/2021, art. 4º, § 2º); sugerida pelos itens, editável |
| `process_nup`, `object`, `supplier_cnpj`, `supplier_name`, `valid_from`, `valid_to`, `estimated_value`, `pncp_control_number`, `notes` | todos anuláveis |

- Valores de domínio em português, como a norma; identificadores em inglês (AGENTS.md).
- **Nasce incompleta.** Só `unit_id` e `kind` são obrigatórios. O que falta vira pendência
  ("contratação sem fundamento legal", "sem vigência"), nunca recusa.
- `procurement_arp.acquisition_id` liga a ARP à sua contratação (`kind = registro_precos`); a ARP
  continua sendo o espelho da ata do Compras.gov.br. O papel da unidade na ata é o `srp_role` da
  contratação, não uma coluna da ARP.
- Alternativa descartada: um `kind` no próprio empenho. O mesmo contrato ou dispensa sustenta vários
  empenhos, e o somatório e a vigência são da contratação, não da NE.

### D2. ARP sem anexo quantitativo

- `procurement_arp.ata_id` anulável, `ON DELETE SET NULL`; `acquisition_id` (`ON DELETE SET NULL`);
  `source` (`compras_gov` · `manual`).
- Cadastro manual da ARP e dos itens (número, UASG gerenciadora, vigência, item, fornecedor, valor,
  quantidade), marcado "não sincronizado" até a primeira sincronização bem-sucedida.
- Importar do Compras.gov.br **sem** anexo passa a ser possível; o casamento com o anexo pelo CATMAT
  acontece quando houver anexo, e pode ser feito depois.
- O upsert por `(unit_id, numero_ata, uasg_gerenciadora)` deixa de trocar o anexo em silêncio: se a
  ARP já tem outro anexo, a importação avisa e mantém o vínculo existente.

### D3. Nota de empenho com itens

- `finance.empenho` passa a ser a NE (documento): número, data, valor total, favorecido, ND, PTRES,
  fonte, UG, tipo (`ordinario` · `estimativo` · `global`), `acquisition_id`.
- `finance.empenho_item`: `empenho_id`, `arp_item_id` (anulável), `purchase_item_id` (anulável),
  `description`, `quantity` (anulável), `unit`, `unit_price` (anulável), `value`.
- Colunas antigas do empenho (`arp_item_id`, `quantidade_empenhada`, `valor_unitario`) ficam
  anuláveis nesta fase (expand) e são preenchidas pelo item único quando houver só um, para o código
  existente continuar lendo; saem num contract posterior.
- `arp_item.quantidade_empenhada` **continua** sendo o retrato oficial do Compras.gov.br (inclui o
  consumo de outros órgãos e das caronas), e só a sincronização o escreve. O comprometimento local é
  a soma dos `empenho_item` da ARP, calculada na leitura; os dois aparecem lado a lado.
- **Todo leitor** que hoje agrupa por `finance.empenho.arp_item_id` (ex. `aggregateLocalCommitments`)
  passa a ler `empenho_item`; as colunas antigas só existem para a `main` durante a transição.
- `finance.empenho.arp_item_id` e `empenho_item.arp_item_id`: `ON DELETE RESTRICT`. Apagar anexo,
  ARP ou item de ARP nunca apaga empenho.

### D4. Registro rápido e reconciliação pelo número

- Onde a tela precisa de um empenho que ainda não está no sistema (OF, recebimento, liquidação), o
  usuário registra o mínimo no próprio lugar: número da NE, data, valor, favorecido. O registro fica
  `origem = 'manual'`. "Sem contratação de origem" é **derivado** (`acquisition_id` nulo e nenhum item
  com ARP), não uma coluna.
- O import de NE do SIAFI **completa** a NE existente com o mesmo `(unit_id, numero_empenho)` —
  classificação (ND, PTRES, fonte, UG) e favorecido — em vez de recusá-la ou duplicar. O **valor não
  é sobrescrito**: `valor_total` é imutável (reforço e anulação são eventos), e a divergência entre o
  registrado e o SIAFI vira pendência de conciliação (`reconciliation_decision`).
- NE importada sem contratação conhecida entra sem vínculo: é pendência "vincular a contratação de
  origem", e é usável na OF e na liquidação.
- NS cuja NE ainda não está no sistema, e OB cuja NS ainda não está, ficam **estacionadas** na
  `import_row` (`parse_status = 'waiting_parent'`). Cada aplicação de lote tenta religar as
  estacionadas da unidade antes de terminar. Erro de gravação de qualquer linha deixa o lote
  `failed` com a mensagem, nunca `applied`. A religação também roda quando a NE ou a NS nasce por
  registro rápido ou manual: é uma função única chamada pelos dois caminhos.

### D5. OF, recebimento e vínculos posteriores

- `supply_order.empenho_id` anulável: OF **aguardando empenho** pode ser montada e enviada (a
  emergência acontece); fica pendência de gravidade alta "OF enviada sem empenho — regularize
  (Lei 4.320, art. 60)". O limite da OF passa a ser o **valor vigente** do empenho
  (`v_empenho_vigente`), não a quantidade original, e o trigger recusa empenho anulado. O valor de
  cada linha da OF é `ordered_qty × preço`, com o preço da própria linha, do item do empenho ou do
  item da ARP, nesta ordem. Linha sem preço nos três é conferida pela quantidade do item do empenho,
  se houver, e senão vira pendência "OF sem preço".
- Recebimento sem NF-e: origens `delivery_note` (guia de remessa, nota semanal do pão) e `ad_hoc`,
  com itens informados na conferência. A NF-e se vincula depois e casa os itens.
- `linkReceiptDocuments`: vincular NF-e, OF e empenho a um recebimento já feito, com as mesmas
  regras de unidade e cozinha; o vínculo não reabre a efetivação nem mexe no estoque.

### D6. Designação

- Tela de designação (Gestão Unidade, `unit:2`) de fiscal, gestor e comissão por contratação, ARP ou
  empenho (`contract_designation.acquisition_id` novo), com o ato (`source` + `source_reference`
  obrigatório quando `source = 'ato'`) e vigência. `arp_id`, `empenho_id` e `acquisition_id` com
  `ON DELETE RESTRICT`: a designação é prova do ato (o reset de treino a apaga antes).
- Lei 14.133, art. 140, II (compras): o **provisório** é do responsável pelo acompanhamento e
  fiscalização (alínea a) e o **definitivo**, de servidor ou comissão designada (alínea b). Os dois
  continuam exigindo designação vigente.
- O que **não** trava é a chegada da mercadoria: quem tem `storage:2` registra a **conferência
  física** (itens, lotes, temperatura, validade) sem designação; o fiscal confirma o provisório
  depois sobre o que já foi conferido. Faltando designação, quem tem `unit:2` vê "Designar agora"
  no próprio recebimento; quem não tem vê quem designa e onde, e a pendência "conferência sem fiscal
  designado" aparece para a unidade.

### D7. Somatório da dispensa por valor

- `procurement.direct_contract_limit(inciso, valid_from, value, source_act)`: o limite vigente vem da
  tabela, não do código. Semeada com os valores atualizados pelo Decreto 11.871/2023 (vigência 2024)
  e pelo Decreto 12.343/2024 (vigência 2025), **a conferir** no PR; ano sem linha vira pendência
  "cadastre o limite vigente" e o cálculo usa o último conhecido.
- Limites de 2026 pelo Decreto 12.807/2025 (inciso I: R$ 130.984,20; inciso II: R$ 65.492,11);
  semeados também 2024 (Decreto 11.871/2023) e 2025 (Decreto 12.343/2024), a conferir no PR.
- Somatório (art. 75, § 1º; IN 67/2021, art. 4º, § 1º): contratações `dispensa` do inciso, da mesma
  **unidade gestora**, no mesmo exercício e no mesmo **ramo de atividade** (`activity_line`: classe
  do PDM no CATMAT para bens, descrição do serviço para serviços — IN 67/2021, art. 4º, § 2º), mais
  a nova. O valor de cada dispensa é o maior entre a soma das NEs vinculadas e o `estimated_value`.
  Dispensa sem valor nenhum **não conta como zero**: vira pendência "dispensa sem valor — somatório
  incompleto" e o aviso diz que o total é um piso. Acima do limite: aviso com o total e a composição,
  e justificativa gravada na contratação. Não recusa: o sisub registra a dispensa já feita.
- A reposição (`replenishment.ts`) passa a consultar o somatório em vez do valor do item, e
  "supermercado virtual" deixa de ser sugerido por urgência operacional sozinha.

### D8. O que continua imprescindível

| Recusa | Por quê |
|---|---|
| Pagar acima do liquidado; liquidar acima do vigente do empenho | Lei 4.320, arts. 62-64 |
| Liquidar recebimento recusado ou não efetivado | Lei 4.320, art. 63, § 2º, III |
| Liquidar com NF-e cancelada ou sem consulta de situação recente | a nota é o comprovante do art. 63 |
| Anular empenho abaixo do já liquidado | o que foi liquidado não se desfaz por anulação |
| Recebimento provisório ou definitivo sem designação vigente (a conferência física não trava) | Lei 14.133, art. 140, II, a e b |
| Efetivar duas vezes; lotes que não somam a quantidade conferida | integridade do estoque |
| Movimento em competência fechada | fechamento mensal |

Tudo o mais que hoje recusa por falta de dado de outro papel vira pendência.

### D9. Pendências da execução

- Operação de domínio `fetchExpenseExecutionStatus(unitId)` e `fetchReceivingPendingStatus(kitchenId)`,
  no molde de `fetchProcurementPlanningStatus` (D1/D2 de `sisub-procurement-planning-flows`).
- Pendências e severidades:

| Pendência | Severidade | Ação |
|---|---|---|
| NE sem contratação de origem | warning | vincular |
| Contratação incompleta (sem fundamento, vigência, fornecedor) | warning | completar |
| Dispensa acima do somatório sem justificativa | warning | justificar |
| NE de SRP com preço diferente do registrado, acima do saldo ou fora da vigência da ARP | warning | justificar ou corrigir |
| OF enviada sem empenho | blocking (só para a etapa, não para a OF) | registrar/vincular a NE |
| Recebimento sem NF-e / sem OF / sem empenho | warning | vincular |
| Recebimento provisório sem fiscal designado | warning | designar |
| NS ou OB estacionada à espera do pai | warning | importar o que falta |
| Limite de dispensa do ano não cadastrado | info | cadastrar |

- Fluxo "Executar despesa" em `/unit/$unitId/flows/expense-execution`; no Estoque, as pendências de
  recebimento aparecem no painel "a caminho", que já existe.

### D10. Execução do dia na cozinha

Ver `specs/execution-day/spec.md`. Resumo: o turno inclui preparação no cardápio **de hoje** (com
motivo, pendente de revisão da nutricionista), cria preparação provisória só com o nome, registra o
substituto que entrou, lança saída tardia com data real e motivo, e o dia se fecha sozinho com
pendência de justificativa. Planejamento de datas futuras e modelos continua exclusivo de `kitchen:2`.

### D11. Execução financeira conforme (migration `20260926216000`)

- **Crédito por classificação.** O comprometimento local de uma linha de `budget_credit` soma só
  os empenhos da mesma UG, ND (por prefixo: linha no elemento, NE no subelemento), PTRES, fonte e
  exercício, pelo valor VIGENTE; NE anterior ao snapshot entra só pelos eventos posteriores. NE
  sem ND não é atribuível. A conferência ao registrar a NE é aviso (Lei 4.320, art. 59), exposta
  como `checkBudgetForEmpenhoFn` / `useBudgetCheckForEmpenho`.
- **"Dotação" numa UG executora.** A coluna `budget_credit.dotacao` fica (renomear quebraria a
  `main`); a tela rotula "Crédito recebido" (o crédito descentralizado por NC) e a coluna de saldo
  "Disponível (SIAFI)", que é o crédito disponível do MCASP (recebido − empenhado).
- **NC** (`finance.credit_note`): documento, não saldo. Anulação/devolução é outra NC
  (`kind = 'anulacao'`). PI e UGR entram em `budget_credit` fora da chave única (o upsert da
  `main` usa a chave antiga).
- **RP em parcelas** (`finance.empenho_rp_inscription`): processado = liquidado − pago (pago
  inclui a retenção recolhida); não processado = vigente − liquidado. `empenho.rp_inscrito`,
  `rp_tipo` e `rp_exercicio` são espelho no expand; o evento `rp_inscricao` continua, um por
  parcela. Contract: ler só da tabela nova e remover as três colunas.
- **Retenções** (`finance.liquidacao_deduction`): a OB paga o líquido; o trigger do pagamento
  compara com bruto − deduções (sem dedução, mesma mensagem de antes). Dedução não passa
  bruto − pago. `v_empenho_saldo.valor_pago` soma a retenção recolhida.
- **NS ≤ recebido** quando há recebimento (trigger `liquidacao_within_receipt`); item sem custo
  usa o total da NF-e; sem NF-e, aceita com pendência.
- **`anulacao_total`** substitui `cancelamento` para a anulação total da NE (cancelamento é termo
  de RP, Decreto 93.872/1986). Expand: CHECK aceita os dois, view e piso leem os dois. Contract:
  `update … set tipo = 'anulacao_total' where tipo = 'cancelamento'` depois que todo escritor
  gravar o nome novo.

## Risks / Trade-offs

- **Expand/contract no empenho.** Durante a transição, empenho tem as colunas antigas e os itens. O
  risco é ler um e gravar outro; mitigação: uma função de leitura de itens no domínio, e o trigger
  que mantém as colunas antigas iguais ao item único.
- **Mais pendências do que o usuário resolve.** Mitigação: severidade, agrupamento por contratação e
  a ação no próprio item.
- **Limite de dispensa a conferir.** A tabela torna o valor visível e corrigível sem deploy.

## Migration Plan

1. PR de declaração no guard de reset (`procurement.acquisition`, `finance.credit_note`).
2. Migrations aditivas e compatíveis com a `main` (colunas anuláveis, FKs trocadas, tabelas novas,
   triggers substituídos aceitando o comportamento antigo), aplicadas com `db:push --dry-run` antes.
3. Tipos regerados (`db:types`, `db:drizzle:pull`) no mesmo PR do recurso.
4. Contract (remover as colunas antigas do empenho) num PR posterior, depois de um ciclo: o código
   passa a ler e gravar só `empenho_item` (PR do cutover), e depois do deploy dele
   `20260927030000_empenho_header_columns_contract` dropa as colunas e o espelho. O
   `empenho_ensure_item` fica, só com o valor: o registro rápido e o import do SIAFI ainda gravam a
   NE só com o cabeçalho.
