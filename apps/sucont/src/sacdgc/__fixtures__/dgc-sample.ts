/**
 * Recorte mínimo dos quatro painéis do DGC, com os cabeçalhos EXATOS do export do
 * Tesouro Gerencial — inclusive o espaço duplo do Painel 3 e a coluna sem nome
 * entre o código e a descrição da NDD, que é o que desloca o índice das colunas.
 *
 * UGs presentes: 120002 e 120700 (as duas da DIREF), 120004 (Base Aérea) e 120006 (GAP).
 */

export const PAINEL_1 = `"Painel 1 - UG Beneficiada";"Painel 1 - SISTEMA ESTRUTURANTE";"Painel 1 - Ano de Lançamento";"Painel 1 - Mês de Lançamento";"Painel 1 - Fatores de Custos - Novo DGC";"Painel 1 - DetaCusto DH - R$"
"120002";"SISMAB (02.YY.ZZ)";"2026";"JULHO";"Diárias (XX.YY.00)";"26.868,46"
"120002";"SISUB (23.YY.ZZ)";"2026";"JULHO";"Estoque (XX.YY.95)";"4.306,50"
"120700";"SISCOMAER (36.YY.ZZ)";"2026";"JULHO";"Pessoal (XX.YY.89 ou XX.YY.92)";"812.004,11"
"120004";"SISDABRA (01.YY.ZZ)";"2026";"JULHO";"Pessoal (XX.YY.89 ou XX.YY.92)";"140.488,88"
"120004";"SISMAB (02.YY.ZZ)";"2026";"JULHO";"Serviços e Bens de Consumo Imediato (XX.YY.00)";"14.715.664,37"
"120006";"SISADM (31.YY.ZZ)";"2026";"JULHO";"Serviços e Bens de Consumo Imediato (XX.YY.00)";"1.355,00"
`

const PAINEL_2 = `"Painel 2 - UG Beneficiada ACC";"Painel 2 - GRUPO POR SISTEMAS - ESTATÍSTICOS";"Painel 2 - Ano Referência ACC";"Painel 2 - Mês Base Referência ACC";"Painel 2 - DetaCusto DH - R$"
"120004";"SISDABRA";"2026";"JULHO";"18"
"120004";"PESSOAL A REGURALIZAR";"2026";"JULHO";"8"
"120006";"SISADM";"2026";"JULHO";"42"
"120700";"SISCONTAER";"2026";"JULHO";"11"
`

const PAINEL_3 = `"Painel 3  - UG Beneficiada";"Painel 3  - Natureza Despesa Detalhada";;"Painel 3  - Ano Referência";"Painel 3 - Mês de Referência";"Painel 3  - GRUPO POR SISTEMAS";"Painel 3  - DetaCusto DH - R$"
"120002";"33903007";"GENEROS DE ALIMENTACAO";"2026";"JULHO";"SISUB (23.YY.ZZ)";"4.306,50"
"120004";"33903943";"SERVICOS DE ENERGIA ELETRICA";"2026";"JULHO";"SISMAB (02.YY.ZZ)";"54.958,26"
"120006";"33903944";"SERVICOS DE AGUA, ESGOTO E RESIDUOS SOLIDOS";"2026";"JULHO";"SISADM (31.YY.ZZ)";"252.373,76"
`

/**
 * A primeira coluna é a UG EMITENTE (quem pagou) e a quarta é a BENEFICIADA (de
 * quem é o custo). A segunda linha é o caso que denuncia índice fixo: o GAP 120006
 * emitiu, mas o custo é da 120132.
 */
const PAINEL_4 = `"Painel 4 - UG Emitente Código";"Painel 4 - UG Emitente Nome";"Painel 4 - ITEM DE CUSTO";"Painel 4 - UG Beneficiada Código";"Painel 4 - UG Beneficiada Nome";"Painel 4 - Natureza Despesa Detalhada Código";"Painel 4 - Natureza Despesa Detalhada Nome";"Painel 4 - Mês Referência";"DetaCusto DH - R$"
"120006";"GRUPAMENTO DE APOIO DE BRASILIA";"ÁGUA E ESGOTO";"120006";"GRUPAMENTO DE APOIO DE BRASILIA";"33903944";"SERVICOS DE AGUA, ESGOTO E RESIDUOS SOLIDOS";"JUL/2026";"252.373,76"
"120006";"GRUPAMENTO DE APOIO DE BRASILIA";"ENERGIA ELÉTRICA";"120132";"DIRETORIA DE ENSINO";"33903943";"SERVICOS DE ENERGIA ELETRICA";"JUL/2026";"3.696,67"
`

export const PANEL_SOURCES = [
	{ name: "PAINEL 1 - DGC Sistemas - ANALISE.csv", text: PAINEL_1 },
	{ name: "PAINEL 2 - Estatístico Pessoal - ANALISE.csv", text: PAINEL_2 },
	{ name: "PAINEL 3 - BENS E SERVIÇOS POR NDD - ANÁLISE.csv", text: PAINEL_3 },
	{ name: "PAINEL 4 - Para regularidade, dispersão e economicidade - ANALISE.csv", text: PAINEL_4 },
]
