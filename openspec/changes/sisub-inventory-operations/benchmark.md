# Benchmark: controle de estoque (2026-09-17)

Pesquisa feita para o change `sisub-inventory-operations`. Itens marcados *(não verificado)* não têm
documentação pública conferida. Fontes ao final.

## Comparativo por requisito

| Requisito | Food service (MarketMan, Apicbase, CrunchTime, xtraCHEF, Galley, R365) | ERP/WMS (Odoo, SAP, TOTVS Protheus, Omie) | Setor público (SIADS, SILOMS, SIGELOG) | sisub hoje → proposto |
|---|---|---|---|---|
| NF-e "a caminho" | Não existe (mercado EUA); pedido de compra e OCR de fatura | **Omie** Agente de NF-e (SEFAZ AN → "Faturado pelo fornecedor"); **SAP** DRC Inbound (`EDOC_BR_MNG_DISTDFE`); **Protheus** Importador XML → pré-nota | SIADS: digitação manual da nota | Upload manual → chave do DANFE + DF-e condicionado (D1) |
| Conferência na entrega | CrunchTime Reconciler lendo volumes; xtraCHEF "Action Needed" | SAP MIGO 101 contra pedido + MIRO/GR-IR; Protheus pré-nota → MATA103 com amarração produto×fornecedor; Omie "importar como / ignorar" | SIADS doc. 215 contra empenho com saldo | Leitor só destaca → conferência por leitura com ×N e aceitar conforme faturado (D5) |
| Item sem GTIN | Código interno | Odoo código interno; Protheus SA5 produto×fornecedor | CATMAT | Mapa fornecedor existe → confirmação manual registrada |
| Inventário | Apicbase: contagens parciais somadas, **sobrescreve** saldo; Galley **Menu-Based Cycle Count**; CrunchTime offline, folhas por ordem do depósito | SAP MI01 (bloqueia) → MI04 → MI11 recontagem → MI07; Protheus MATA270 → MATA340; Odoo Physical Inventory | IN SEDAP 205/88: anual, rotativo, eventual; SIADS RMA | Contagem simples → tipos IN 205, cega, referência temporal, recontagem configurável (D15) |
| Baixa para produção | Consumo teórico por venda × contagem | SAP 261 contra ordem (sugerido pela BOM, editável); Odoo componentes da MO editáveis | SIADS requisição → autorização → atendimento → estorno | Pós-DONE por tarefa → requisição do dia, 3 modos, motivo no fechamento (D11) |
| Vencimento/FEFO | CrunchTime listas *use-first*; Galley "about to expire" | **Odoo** 4 datas por lote (expiration, best before, removal, alert) + FEFO; SAP SLED com validade mínima no MIGO | SIADS: lote, sem FEFO documentado | Card fixo 30 d, FEFO consome vencido → faixas por classe, ações, aviso no planejamento (D10/D16) |
| Ajuste com motivo | Apicbase `waste_category`; xtraCHEF Waste com motivo, nota, foto | Odoo Scrap (local virtual); SAP 551/553/555 | Saídas e estornos; perda segue processo administrativo | Texto livre sem tela → documento com motivo tipado, quarentena, evidência, alçada (D13) |
| Leitura GS1 (lote/validade no código) | *(não verificado)* | **Odoo** nomenclatura GS1 (AI 01/10/17/30/37) | — | GTIN simples → parser AI + etiqueta interna de lote (D12/D17) |

## Ideias copiadas e onde entraram

1. Máquina de estados da nota (Omie + art. 140) → D3.
2. Um coletor de NSU por raiz de CNPJ com cursor e pausa pós-137 → D1.
3. Pré-nota com amarração fornecedor+código → insumo que aprende → já existia (`supplier_product_map`), mantido.
4. Conferência por leitura aceitando cEAN e cEANTrib, contador esperado × lido → D5.
5. Parser GS1 que preenche lote e validade (Odoo) → D5/D17.
6. Datas de alerta por lote e FEFO na saída sugerida, editável → D10/D11/D16.
7. Ajuste como documento com motivo tipado e foto (Apicbase, xtraCHEF, Odoo Scrap) → D13.
8. Inventário com recontagem e lançamento da diferença como movimento próprio (SAP) — **sem** o bloqueio do MI01 → D15.
9. Contagem rotativa guiada pelo cardápio (Galley) → escopo `menu_cycle` (D15).
10. Contagem offline por várias pessoas (CrunchTime) → D15, restrito à contagem.
11. Consumo teórico sem planejamento obrigatório (MarketMan, Apicbase) → saída livre sem variância quando não há plano (D11).

## Armadilhas registradas

- **Consumo indevido SEFAZ (cStat 656)**: bloqueio de 1 h por raiz; consultar de novo antes de 1 h após
  137 ou fora da sequência de NSU; reconsultar no bloqueio zera o relógio; dois sistemas no mesmo CNPJ.
- **Resumo sem itens**: sem ciência 210210 não há XML; a ciência é evento assinado pelo órgão.
- **Janela de 90 dias** do DF-e: coletor parado perde nota; `consChNFe` recupera por chave.
- **Raiz de CNPJ**: um certificado vê todas as filiais — corte por unidade tem que ser no sisub.
- **GTIN válido e errado**: DV correto com GTIN de outra embalagem; "SEM GTIN" é legítimo em hortifrúti e carne.
- **cEAN ≠ cEANTrib / uCom ≠ uTrib**: caixa × unidade dá erro de 12×; peso variável exige tolerância.
- **Leitor em modo teclado**: separador GS perdido, layout ABNT2 troca caractere, Enter submete formulário.
- **Contagem que soma em vez de sobrescrever** (alerta explícito do Apicbase).
- **Recebimento ≠ aceitação** (IN 205/88, Lei 14.133 art. 140): entrada no estoque não liquida sozinha.
- **Duplicidade com SIADS/SILOMS** se a OM já escritura lá.

## Fontes

- NF-e/SEFAZ: NT 2014.002 (nfe.fazenda.gov.br) · blog.nstecnologia.com.br/regras-de-consumo-indevido-para-dfe ·
  ajuda.omie.com.br (consumo indevido NSU; Agente de NF-e; recebimento) · atendimento.tecnospeed.com.br/hc/pt-br/articles/10794811536791 ·
  moc.sped.fazenda.pr.gov.br/RecepcaoEventoManifestacao.html · github.com/nfephp-org/sped-nfe/blob/master/docs/metodos/DistDFe.md
- GTIN/unidades: blog.gs1br.org/cean-invalido · NT 2021.003 · webmania.com.br (uCom × uTrib)
- Leitores: packagingdigest.com (FNC1 × GS) · Honeywell ScanWedge (GS substitution) · github.com/PeterBrockfeld/BarcodeParser
- Odoo 19: GS1 nomenclature, FEFO, expiration dates, scrap (odoo.com/documentation)
- SAP: community.sap.com (DRC manifestação) · KBA 2374911 · TOTVS: Importador XML (mastersiga)
- Food service: support.apicbase.com (counting, barcode waste) · developers.apicbase.com (waste events) ·
  support.toasttab.com (xtraCHEF waste, invoice exceptions) · crunchtime.com/inventory-management ·
  support.galleysolutions.com (cycle counts) · marketman.com · help.restaurant365.net
- Setor público: siads.fazenda.gov.br/tutorial · IN SEDAP 205/1988 (gov.br/compras) · Lei 14.133 art. 140 ·
  portaldatransparencia.gov.br (notas fiscais) · repositorio.esg.br/handle/123456789/1744 (SILOMS)
