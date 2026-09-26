## 1. Declaração e migrations

- [ ] 1.1 [sisub] Declarar `procurement.acquisition` e `finance.credit_note` em `RESET_EXCLUSIONS` (PR próprio, antes das migrations)
- [ ] 1.2 [database] `20260926214000_acquisition_origin`: `acquisition`, `direct_contract_limit` (semeada, a conferir), `empenho_item`; ARP com `ata_id` anulável `SET NULL`, `acquisition_id`, `unit_role`, `source`; empenho com `acquisition_id`, `link_status`, colunas antigas anuláveis, FKs `RESTRICT`; OF com `empenho_id` anulável e limite pelo valor vigente
- [ ] 1.3 [database] `20260926215000_receiving_links`: recebimento sem NF-e, vínculos posteriores, `import_row.parse_status = 'waiting_parent'`, CHECK de `contract_designation.source_reference`
- [ ] 1.4 [database] `20260926216000_finance_compliance`: `credit_note`, `empenho_rp`, `liquidacao_deducao`
- [ ] 1.5 [database] Aplicar (`db:push --dry-run`, push) e regerar `generated.ts` e Drizzle; `audit:rls` verde

## 2. Contratação de origem, ARP e NE (Gestão Unidade)

- [ ] 2.1 [sisub-domain] Regras puras: completude da contratação, somatório da dispensa, conferência NE × ARP (preço, saldo, vigência) com testes
- [ ] 2.2 [sisub] Tela de contratações (lista, criar, completar) com o aviso do somatório
- [ ] 2.3 [sisub] ARP sem anexo: importar do Compras.gov.br sem anexo e cadastro manual; aviso ao reimportar ARP de outro anexo
- [ ] 2.4 [sisub] NE com itens: criar NE por contratação (com ou sem ARP), registro rápido; `anularEmpenhoFn` passa pelo evento de anulação e pelo piso
- [ ] 2.5 [sisub] Import do SIAFI: NE sem vínculo entra pendente, completa NE existente pelo número, NS/OB estacionadas religadas, lote falho em erro
- [ ] 2.6 [sisub] OF aguardando empenho; limite pelo valor vigente
- [ ] 2.7 [sisub] Reposição usa o somatório da dispensa e o limite da tabela

## 3. Estoque: recebimento e designação

- [ ] 3.1 [sisub] Recebimento `delivery_note` e `ad_hoc`; vincular NF-e, OF e empenho depois
- [ ] 3.2 [sisub] Designações (Gestão Unidade) e "Designar agora" no recebimento; provisório sem designação com pendência
- [ ] 3.3 [sisub] Efetivação do estoque com SEFAZ indisponível: entra no estoque, liquidação continua exigindo a consulta

## 4. Pendências

- [ ] 4.1 [sisub-domain] `fetchExpenseExecutionStatus(unitId)` e `fetchReceivingPendingStatus(kitchenId)`
- [ ] 4.2 [sisub] Fluxo "Executar despesa" e pendências no painel "a caminho"

## 5. Execução financeira conforme

- [ ] 5.1 [sisub] Nota de crédito (NC) com PI e UGR; verificação de crédito filtrada por ND/PTRES/fonte e ligada ao registro da NE (aviso)
- [ ] 5.2 [sisub] Inscrição em restos a pagar por valor e tipo; deduções da NS e pagamento pelo líquido
- [ ] 5.3 [sisub] Liquidação: teto pelo valor recebido quando há recebimento; sem recebimento vira pendência

## 6. Execução do dia (cozinha)

- [ ] 6.1 [sisub] Itens de `specs/execution-day` (PR próprio)

## 7. Fechamento

- [ ] 7.1 [sisub] Catálogo de edge cases (`gestao-unidade.md`, `estoque.md`, `producao-cozinha.md`) com cada caso e a cobertura
- [ ] 7.2 [sisub] Integração no banco real dos caminhos novos; promover `acquisition` e `credit_note` a `RESET_STEPS`
- [ ] 7.3 [root] `bun run check`, `bun run lint --concurrency=2`, `bun run test --concurrency=2`
