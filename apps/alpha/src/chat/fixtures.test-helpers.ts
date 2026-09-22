/** Fixtures compartilhadas pelos testes do chat. Não é teste: o sufixo não casa com `*.test.ts`. */

import type { DocumentSource, FindingSource } from "./sources.ts"

export function makeDocument(overrides: Partial<DocumentSource> = {}): DocumentSource {
	const nodes = [
		{ path: "1", level: 1, title: "OBJETO", body: "Aquisição de forno combinado para o rancho do IAE." },
		{ path: "2", level: 1, title: "JUSTIFICATIVA", body: "O forno atual está fora de uso desde março." },
		{ path: "2.1", level: 2, title: "Necessidade", body: "Atender 1.200 refeições por dia." },
		{ path: "3", level: 1, title: "GARANTIA", body: "A garantia será de 12 meses, contados do recebimento definitivo." },
	]
	const text = nodes.map((node) => `${node.path} ${node.title}\n${node.body}`).join("\n")
	return { label: "D1", name: "TR forno.docx", text, nodes, ...overrides }
}

export function makeFinding(overrides: Partial<FindingSource> = {}): FindingSource {
	return {
		label: "A1",
		id: "finding-1",
		severity: "GRAVE",
		category: "CONTEUDO",
		status: "INCONFORME",
		section_path: "3",
		message: "O prazo de garantia não indica a forma de acionamento.",
		legal_ref: [{ norma: "Lei 14.133/2021", dispositivo: "art. 40" }],
		suggestion: "Incluir o procedimento de acionamento da garantia.",
		triage: null,
		triage_note: null,
		...overrides,
	}
}
