/**
 * @module sacdgc/checklist
 * As 20 perguntas do Checklist AEC (Análise da Execução de Custos).
 *
 * Fonte única: o prompt monta a lista a partir daqui e o normalizador da resposta
 * confere contra ela. Com duas cópias, o modelo reescrevia o enunciado e a tela
 * mostrava um texto que a SUCONT não escreveu.
 *
 * "SIM" é sempre a resposta que indica apontamento — as perguntas são investigativas
 * ("Existe custo em Sistema sem elo com a Unidade?"), então SIM significa achado.
 */

export interface ChecklistQuestion {
	id: number
	pergunta: string
	/** Observação que entra só no prompt, não na tela. */
	nota?: string
}

export const CHECKLIST_QUESTIONS: ChecklistQuestion[] = [
	{ id: 1, pergunta: "Existe custo registrado em Sistema que não possui elo com a Unidade?" },
	{ id: 2, pergunta: "Existe Sistema com custo de pessoal, mas sem depreciação/amortização?" },
	{ id: 3, pergunta: "Existe Sistema com depreciação/amortização, mas sem custo de pessoal?" },
	{
		id: 4,
		pergunta: "Existe militar no Subcentro 98.00.92 (Efetivo sem Setor)?",
		nota: 'O quantitativo sai EXCLUSIVAMENTE da linha "PESSOAL A REGULARIZAR" do Painel 2, coluna "DetaCusto DH - R$" (que no Painel 2 é quantidade de militares). Reporte o número exato; não some nem estime.',
	},
	{
		id: 5,
		pergunta: "O sistema/setor informado é diferente daquele que efetivamente consumiu o bem ou serviço, sem que tenha sido realizado o rateio correspondente?",
	},
	{ id: 6, pergunta: "Houve ausência de lançamento da fatura no mês? (Energia Elétrica)" },
	{ id: 7, pergunta: "Houve lançamento duplicado no mês? (Energia Elétrica)" },
	{ id: 8, pergunta: "Existem indícios de que o rateio contábil NÃO condiz com o consumo da UG? (Energia Elétrica)" },
	{ id: 9, pergunta: "Houve ausência de lançamento da fatura no mês? (Limpeza e Conservação)" },
	{ id: 10, pergunta: "Houve lançamento duplicado no mês? (Limpeza e Conservação)" },
	{ id: 11, pergunta: "Existem indícios de que o rateio contábil NÃO condiz com o consumo da UG? (Limpeza e Conservação)" },
	{ id: 12, pergunta: "Houve ausência de lançamento da fatura no mês? (Água e Esgoto)" },
	{ id: 13, pergunta: "Houve lançamento duplicado no mês? (Água e Esgoto)" },
	{ id: 14, pergunta: "Existem indícios de que o rateio contábil NÃO condiz com o consumo da UG? (Água e Esgoto)" },
	{ id: 15, pergunta: "Houve ausência de lançamento da fatura no mês? (Tecnologia da Informação)" },
	{ id: 16, pergunta: "Houve lançamento duplicado no mês? (Tecnologia da Informação)" },
	{ id: 17, pergunta: "Existem indícios de que o rateio contábil NÃO condiz com o consumo da UG? (Tecnologia da Informação)" },
	{ id: 18, pergunta: "Houve ausência de lançamento da fatura no mês? (Telefonia)" },
	{ id: 19, pergunta: "Houve lançamento duplicado no mês? (Telefonia)" },
	{ id: 20, pergunta: "Existem indícios de que o rateio contábil NÃO condiz com o consumo da UG? (Telefonia)" },
]

export const CHECKLIST_BY_ID = new Map(CHECKLIST_QUESTIONS.map((q) => [q.id, q]))
