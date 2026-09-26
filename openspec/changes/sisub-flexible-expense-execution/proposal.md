## Why

O sisub só aceita um caminho para a despesa do rancho: anexo quantitativo feito no sistema → ARP importada do Compras.gov.br pendurada nele → empenho de um item da ARP → ordem de fornecimento → recebimento a partir da NF-e importada → liquidação → pagamento. A realidade tem mais caminhos, e hoje cada um deles vira caderno:

- ata anterior ao sistema, ou de outro órgão (participante, carona), sem anexo quantitativo feito aqui;
- empenho sem ata: dispensa (art. 75), inexigibilidade (art. 74), Contrata+Brasil, contrato de fornecimento contínuo, suprimento de fundos;
- nota de empenho com vários itens (o banco aceita um item por NE);
- a NE já emitida no SIAFI mas ainda não importada; a entrega que chegou antes da NF-e; a NS importada antes da NE.

O banco recusa esses casos. Pior: o import de NE do SIAFI falha **em silêncio** — insere sem item de ARP, morre na constraint e marca o lote como aplicado —, e não existe tela para designar fiscal, então nenhum recebimento é efetivável sem SQL manual.

O rancho é rápido: a falta de um trabalho deve impedir o mínimo do outro. Quem esqueceu de importar algo não pode travar quem está recebendo a carne. O sistema **registra o fato** e aponta a **pendência** para quem corrige depois; ele só recusa quando o próprio ato seria irregular (pagar mais do que o liquidado, liquidar entrega recusada).

## What Changes

- **Contratação de origem** (`procurement.acquisition`): todo empenho pode apontar para a contratação que o sustenta, de qualquer tipo — registro de preços (como gerenciador, participante ou não participante/carona), licitação com contrato, dispensa (com o inciso do art. 75), inexigibilidade, Contrata+Brasil, suprimento de fundos, outra — com fundamento legal, NUP, fornecedor, objeto, vigência e natureza de despesa. Contratação pode nascer incompleta e ser completada depois.
- **ARP sem anexo**: a ARP se desprende do anexo quantitativo (vínculo opcional), pode ser cadastrada à mão quando a API não responde ou a ata é de outro órgão, e registra o papel da unidade na ata.
- **Nota de empenho com itens** (`finance.empenho_item`): a NE é o documento; cada item aponta, se houver, para o item da ARP ou para o item de compra. NE global/estimativa só com valor é aceita.
- **Registro rápido e reconciliação**: onde falta um documento (NE não importada), o usuário registra o mínimo (número, valor, favorecido) no próprio lugar; o import do SIAFI completa o registro pelo número em vez de duplicar.
- **Import do SIAFI sem perda**: NE sem vínculo entra como empenho "sem contratação de origem" (pendência); NS e OB cujo pai ainda não chegou ficam estacionadas e se religam sozinhas quando ele chega. Erro de gravação reprova o lote em vez de marcá-lo aplicado.
- **OF aguardando empenho**, **recebimento sem NF-e** (guia de remessa ou avulso), **vincular depois** (NF-e, OF, empenho ao recebimento; NE à OF).
- **Designação de fiscal e gestor** com tela e atalho "designar agora" no recebimento.
- **Dispensa por valor com somatório** no exercício por unidade e ramo de atividade (art. 75, §1º), com os limites em tabela atualizável; ultrapassar vira aviso com justificativa, não recusa.
- **Pendências da execução**: fluxo "Executar despesa" na Gestão Unidade e pendências no Estoque, derivadas dos dados, cada uma com ação.
- **Cascata segura**: apagar anexo quantitativo não apaga ARP nem empenho.

## Capabilities

### New Capabilities
- `acquisition-origin`: contratação de origem de qualquer tipo; ARP sem anexo; NE com itens; somatório da dispensa.
- `expense-chain-pending`: registro rápido, vincular depois, import sem perda, pendências da execução e o que continua imprescindível.
- `execution-day`: execução do dia na cozinha sem depender do planejamento de outro papel (preparação incluída pelo turno, ficha provisória, saída tardia, fechamento automático do dia).

### Modified Capabilities
- Nenhuma em `openspec/specs/`. Complementa `guided-flows` (proposta `sisub-procurement-planning-flows`) com o fluxo "Executar despesa".

## Impact

**Apps:** `sisub` (Gestão Unidade: contratações, ARP, empenhos, liquidações, pagamentos, SIAFI, conciliação, fluxos; Estoque: OF, NF-e, recebimento, designação; Produção e Gestão Cozinha). `api`: nenhum.

**Packages:** `@iefa/sisub-domain` (regras puras de pendência, somatório da dispensa, reset de treino), `@iefa/database` (migrations e tipos).

**Banco:**
- tabelas novas: `procurement.acquisition` (com `unit_id`, declarada antes no guard de reset), `finance.empenho_item`, `procurement.direct_contract_limit`, `finance.credit_note` (com `unit_id`, declarada antes), `finance.empenho_rp`, `finance.liquidacao_deducao`;
- `finance.empenho`: `arp_item_id`, `quantidade_empenhada` e `valor_unitario` anuláveis; `acquisition_id`; `link_status`;
- `procurement.procurement_arp`: `ata_id` anulável com `ON DELETE SET NULL`, `acquisition_id`, `unit_role`, `source`;
- `finance.empenho.arp_item_id`: `ON DELETE RESTRICT` no lugar de `CASCADE`;
- `procurement.supply_order.empenho_id` anulável (OF aguardando empenho); limite da OF pelo **valor vigente** do empenho;
- `finance.liquidacao.empenho_id` e `finance.pagamento.liquidacao_id` continuam obrigatórios; a NS/OB sem pai fica em `siafi_integration.import_row` estacionada.
- Tudo só do servidor (`service_role`), sem entrada nas allowlists de cliente.

## Não-objetivos

- Integrar com o SIAFI ou o Compras.gov.br para **gravar**. O sisub registra e confere; os atos continuam lá.
- Contratos administrativos completos (aditivos, reajuste, repactuação, garantias). A contratação guarda o que a execução do rancho precisa.
- Etapa de alimentação (valor per capita, indenização): fica registrada como lacuna no catálogo até a norma do COMAER ser conferida.
- Renomear as tabelas `ata*`/`procurement_*` existentes. Tabela nova já nasce com o nome certo.
