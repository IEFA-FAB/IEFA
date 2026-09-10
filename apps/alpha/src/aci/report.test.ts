import { describe, expect, it } from "bun:test"
import { type FinalReport, type ReportFinding, renderReportMarkdown, sortFindings } from "./report.ts"

const finding = (overrides: Partial<ReportFinding>): ReportFinding => ({
	id: "f1",
	category: "CONTEUDO",
	status: "INCONFORME",
	severity: "GRAVE",
	section_path: "3",
	message: "Falta justificativa do parcelamento.",
	legal_ref: [{ norma: "Lei 14.133/2021", dispositivo: "Art. 40, § 3º" }],
	suggestion: "Incluir a justificativa.",
	evidence_span: { text: "O objeto será\n   contratado em lote único." },
	confidence: 0.82,
	triage: null,
	triage_note: null,
	...overrides,
})

const base: FinalReport = {
	run: {
		id: "run-1",
		status: "succeeded",
		rules_applied: 6,
		rules_not_assessed: 1,
		discarded_findings: 2,
		started_at: "2026-09-10T12:00:00Z",
		finished_at: "2026-09-10T12:03:00Z",
	},
	submission: { id: "s1", filename: "TR-limpeza.docx", doc_kind: "TR", modalidade: null, objeto: "SERVICOS", created_at: "2026-09-10T11:00:00Z" },
	extraction: { id: "e1", model: "openai.gpt-oss-120b-1:0", created_at: "2026-09-10T11:30:00Z" },
	model_document: { id: "d1", title: "TR Serviços sem dedicação exclusiva", document_type: "MODELO_AGU", version_label: "abr-26" },
	law_documents: [{ id: "d2", title: "Lei nº 14.133, de 1º de abril de 2021", document_type: "LEI", version_label: null }],
	findings: [],
	reviews: [],
}

describe("renderReportMarkdown", () => {
	it("declara parecer não emitido em vez de omitir a linha", () => {
		const md = renderReportMarkdown(base)
		expect(md).toContain("Parecer: **não emitido**")
	})

	it("achado sem triagem NÃO some do relatório", () => {
		// Relatório que omite o que o analista não olhou apresenta análise parcial como completa.
		const md = renderReportMarkdown({ ...base, findings: [finding({ id: "f1", triage: null })] })
		expect(md).toContain("## Achados sem triagem (1)")
		expect(md).toContain("## Achados acatados (0)")
	})

	it("separa acatados de descartados e leva o motivo do descarte", () => {
		const md = renderReportMarkdown({
			...base,
			findings: [finding({ id: "f1", triage: "acatado" }), finding({ id: "f2", triage: "descartado", triage_note: "Justificativa está no ETP anexo." })],
			reviews: [
				{ id: "rv1", decision: "aprovado_com_ressalvas", notes: "Corrigir antes da publicação.", reviewer_id: "u9", created_at: "2026-09-10T13:00:00Z" },
			],
		})
		expect(md).toContain("Parecer: **Aprovado com ressalvas**")
		expect(md).toContain("Corrigir antes da publicação.")
		expect(md).toContain("## Achados acatados (1)")
		expect(md).toContain("## Achados descartados pelo analista (1)")
		expect(md).toContain("Motivo do descarte: Justificativa está no ETP anexo.")
		expect(md).not.toContain("## Achados sem triagem")
	})

	it("sempre declara a cobertura e as referências usadas", () => {
		const md = renderReportMarkdown(base)
		expect(md).toContain("- Regras aplicadas: 6")
		expect(md).toContain("- Regras não avaliadas: 1")
		expect(md).toContain("- Achados descartados pelo guard de citação: 2")
		expect(md).toContain("- Modelo AGU: TR Serviços sem dedicação exclusiva (abr-26)")
		expect(md).toContain("- LEI: Lei nº 14.133, de 1º de abril de 2021")
	})

	it("diz quando não houve modelo aplicável", () => {
		const md = renderReportMarkdown({ ...base, model_document: null })
		expect(md).toContain("nenhum modelo aplicável")
	})

	it("achata a evidência numa citação de uma linha", () => {
		const md = renderReportMarkdown({ ...base, findings: [finding({ triage: "acatado" })] })
		expect(md).toContain("> O objeto será contratado em lote único.")
		expect(md).toContain("Fundamento: Art. 40, § 3º — Lei 14.133/2021")
	})

	it("lista o histórico só quando há mais de um parecer", () => {
		const one = renderReportMarkdown({
			...base,
			reviews: [{ id: "rv1", decision: "reprovado", notes: null, reviewer_id: "u9", created_at: "2026-09-10T13:00:00Z" }],
		})
		expect(one).not.toContain("## Histórico de pareceres")

		const two = renderReportMarkdown({
			...base,
			reviews: [
				{ id: "rv2", decision: "aprovado", notes: null, reviewer_id: "u9", created_at: "2026-09-11T13:00:00Z" },
				{ id: "rv1", decision: "reprovado", notes: "faltava a garantia", reviewer_id: "u9", created_at: "2026-09-10T13:00:00Z" },
			],
		})
		expect(two).toContain("## Histórico de pareceres")
		expect(two).toContain("Reprovado: faltava a garantia")
	})
})

describe("sortFindings", () => {
	it("severidade primeiro, seção depois", () => {
		const sorted = sortFindings([
			finding({ id: "a", severity: "MEDIA", section_path: "1" }),
			finding({ id: "b", severity: "BLOQUEANTE", section_path: "9" }),
			finding({ id: "c", severity: "BLOQUEANTE", section_path: "2" }),
		])
		expect(sorted.map((item) => item.id)).toEqual(["c", "b", "a"])
	})
})
