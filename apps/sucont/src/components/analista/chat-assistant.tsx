import { Bot, Search, Send } from "lucide-react"
import { useState } from "react"
import { getOrganizacao } from "#/lib/analista/organizacao"

interface MangerialData {
	totalRiskValue: number
	topUgs: { ug: string; count: number; value: number }[]
	topRacs: { name: string; value: number }[]
	totalIssues: number
	conferentes: { name: string; count: number; ugs: string[] }[]
}

interface EstrategicoData {
	totalRiskValue: number
	topOds: { name: string; count: number; value: number; percent: number }[]
	topOrgaosSuperiores: {
		name: string
		count: number
		value: number
		percent: number
	}[]
	topContas: { conta: string; count: number; value: number; descricao: string }[]
	totalIssues: number
}

interface DecisaoData {
	pareto: {
		totalUgs: number
		twentyPercentCount: number
		paretoPercent: number
		topTwentyUgs: Array<{ ug: string; nome: string; count: number }>
	}
	priorities: Array<{ ug: string; nome: string; count: number; value: number }>
	criticalLevels: {
		ods: string
		superior: string
		ugCount: string
		ugValue: string
	}
}

interface ChatAssistantProps {
	managerialData: MangerialData | null
	estrategicoData: EstrategicoData | null
	decisaoData: DecisaoData | null
}

const formatCurrency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)

export function ChatAssistant({ managerialData, estrategicoData, decisaoData }: ChatAssistantProps) {
	const [query, setQuery] = useState("")
	const [answer, setAnswer] = useState<string | null>(null)

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault()
		if (!query.trim() || !managerialData || !estrategicoData) return

		const lowerQuery = query.toLowerCase()
		let response = ""

		if (lowerQuery.includes("ods") && (lowerQuery.includes("mais inconsistências") || lowerQuery.includes("maior risco"))) {
			const topOds = estrategicoData.topOds[0]
			response = `O ODS com maior risco contábil (mais inconsistências) é o **${topOds.name}**, com ${topOds.count} inconsistências (${topOds.percent.toFixed(1)}% do total).`
		} else if (lowerQuery.includes("órgão superior") && (lowerQuery.includes("concentra mais") || lowerQuery.includes("mais inconsistências"))) {
			const topOrgao = estrategicoData.topOrgaosSuperiores[0]
			response = `O Órgão Superior que concentra mais inconsistências é o **${topOrgao.name}**, com ${topOrgao.count} ocorrências (${topOrgao.percent.toFixed(1)}% do total).`
		} else if (lowerQuery.includes("ug") && lowerQuery.includes("maior risco")) {
			const topUg = managerialData.topUgs[0]
			const org = getOrganizacao(topUg.ug)
			response = `A UG que apresenta o maior risco contábil (número de inconsistências) é a **UG ${topUg.ug} (${org.nome})**, com ${topUg.count} inconsistências.`
		} else if (lowerQuery.includes("ug") && lowerQuery.includes("maior saldo irregular")) {
			const topUgValue = [...managerialData.topUgs].sort((a, b) => b.value - a.value)[0]
			const org = getOrganizacao(topUgValue.ug)
			response = `A UG com o maior saldo irregular é a **UG ${topUgValue.ug} (${org.nome})**, totalizando ${formatCurrency(topUgValue.value)}.`
		} else if (lowerQuery.includes("10 ugs") || (lowerQuery.includes("ugs") && lowerQuery.includes("mais críticas"))) {
			const top10 = managerialData.topUgs.slice(0, 10)
			response = `As 10 UGs mais críticas do COMAER (por volume de inconsistências) são:\n\n${top10
				.map((ug, i) => {
					const org = getOrganizacao(ug.ug)
					return `${i + 1}º UG ${ug.ug} (${org.nome}) — ${ug.count} inconsistências`
				})
				.join("\n")}`
		} else if (lowerQuery.includes("20%") && lowerQuery.includes("concentram")) {
			if (decisaoData) {
				response = `De acordo com a análise de Pareto, **20% das UGs** analisadas concentram **${decisaoData.pareto.paretoPercent.toFixed(1)}%** de todas as inconsistências contábeis.`
			} else {
				response =
					"A análise de Pareto indica que uma parcela reduzida de UGs concentra a maioria das inconsistências. Carregue mais dados para um percentual exato."
			}
		} else if (lowerQuery.includes("primeiro") || lowerQuery.includes("prioridade") || lowerQuery.includes("tratar")) {
			if (decisaoData) {
				const top3 = decisaoData.priorities.slice(0, 3)
				response = `As inconsistências que devem ser tratadas com prioridade imediata (considerando volume, valor e impacto) são das seguintes UGs:\n\n${top3
					.map((ug, i) => `${i + 1}º UG ${ug.ug} (${ug.nome}) — ${ug.count} inconsistências — ${formatCurrency(ug.value)}`)
					.join("\n")}`
			} else {
				response = "As prioridades de atuação devem focar em UGs com maior volume de inconsistências e maior impacto financeiro."
			}
		} else if (lowerQuery.includes("mapa de risco") || lowerQuery.includes("panorama")) {
			response = `O Mapa de Risco Contábil mostra a distribuição das inconsistências por ODS:\n\n${estrategicoData.topOds
				.map((o) => `${o.name} — ${o.count} inconsistências — ${formatCurrency(o.value)} — ${o.percent.toFixed(1)}%`)
				.join("\n")}`
		} else if (lowerQuery.includes("questão rac") && (lowerQuery.includes("mais recorrente") || lowerQuery.includes("mais frequente"))) {
			const topRac = managerialData.topRacs[0]
			response = `A questão RAC mais recorrente é a **${topRac.name}**, com ${topRac.value} ocorrências.`
		} else if (lowerQuery.includes("120999") || lowerQuery.includes("stn") || lowerQuery.includes("diferenciado")) {
			response =
				"A **UG 120999 (MAER - DIF. CAMBIAL)**, subordinada à **SEFA / SEFA**, é o Órgão Central de Contabilidade (STN). O tratamento é diferenciado por ser exclusivo para lançamentos da Secretaria do Tesouro Nacional."
		} else if (lowerQuery.includes("setorial") || lowerQuery.includes("autoridade")) {
			response =
				"As Setoriais Contábeis do COMAER (SEFA) são a autoridade máxima em normas e fiscalização contábil. São elas:\n- UG 120002 (DIREF), subordinada ao SEFA / SEFA\n- UG 120701 (DIREF/SUCONT), subordinada ao SEFA / SEFA\n- UG 120702 (DIREF/SUCONV), subordinada ao SEFA / SEFA\n- UG 121002 (DIREF - FAer), subordinada ao SEFA / SEFA"
		} else {
			response =
				'Desculpe, não consegui interpretar essa pergunta. Como Oráculo SUCONT, posso ajudá-lo com:\n- "Qual ODS possui maior risco contábil?"\n- "Qual Órgão Superior concentra mais inconsistências?"\n- "Qual UG apresenta maior risco contábil?"\n- "Quais são as 10 UGs mais críticas do COMAER?"\n- "20% das UGs concentram quantos % das inconsistências?"\n- "Quais inconsistências devem ser tratadas primeiro?"'
		}

		setAnswer(response)
	}

	return (
		<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mt-8">
			<h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center">
				<Bot className="w-5 h-5 mr-2 text-blue-600" />
				Oráculo SUCONT
			</h3>
			<p className="text-sm text-slate-600 mb-4">Assistente técnico e estratégico especializado em Contabilidade Pública Federal (COMAER).</p>

			<form onSubmit={handleSearch} className="flex gap-2">
				<div className="relative flex-1">
					<Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
					<input
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Ex: Qual ODS tem mais inconsistências?"
						className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
					/>
				</div>
				<button type="submit" className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl flex items-center transition-colors">
					<Send className="w-4 h-4 mr-2" />
					Perguntar
				</button>
			</form>

			{answer && (
				<div className="mt-6 bg-slate-50 p-4 rounded-xl border border-slate-200 animate-in fade-in">
					<div className="flex items-start gap-3">
						<div className="p-2 bg-slate-100 rounded-lg shrink-0 mt-1">
							<Bot className="w-4 h-4 text-slate-600" />
						</div>
						<div className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">
							{answer.split("**").map((part, i) =>
								i % 2 === 1 ? (
									<strong key={i} className="text-slate-900">
										{part}
									</strong>
								) : (
									part
								)
							)}
						</div>
					</div>
				</div>
			)}

			<div className="mt-4 flex flex-wrap gap-2">
				<span className="text-xs text-slate-300 font-medium mr-1 py-1">Sugestões:</span>
				<button
					type="button"
					onClick={() => setQuery("Qual ODS tem mais inconsistências?")}
					className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-md transition-colors"
				>
					Qual ODS tem mais inconsistências?
				</button>
				<button
					type="button"
					onClick={() => setQuery("Quais são as 10 UGs com mais inconsistências?")}
					className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-md transition-colors"
				>
					Top 10 UGs
				</button>
				<button
					type="button"
					onClick={() => setQuery("Qual questão RAC é mais recorrente?")}
					className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-md transition-colors"
				>
					Questão RAC mais recorrente
				</button>
			</div>
		</div>
	)
}
