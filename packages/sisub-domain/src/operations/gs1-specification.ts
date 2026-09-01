/**
 * Conformidade de um GTIN contra uma especificação de compra (vocabulário GPC).
 *
 * A verificação de verdade é da API da GS1 — este módulo é a PORTA, não o
 * algoritmo. Mesmo desenho de `@iefa/ai-provider`: contrato estável,
 * implementação trocável. Com o verificador local (comparação sobre
 * declaração já em base) tudo que depende disto pode ser construído e testado
 * antes de a integração fechar.
 *
 * O QUE ISTO PROVA: que a DECLARAÇÃO do fornecedor bate com a exigência.
 * Nada sobre o produto físico — quem confirma é a conferência no recebimento.
 * Apresentar o veredito como garantia criaria confiança falsa, e é por isso
 * que `indeterminado` existe como resultado de primeira classe em vez de ser
 * arredondado para "atende".
 */

import { createHash } from "node:crypto"

export const SPECIFICATION_VERDICTS = ["atende", "nao_atende", "indeterminado"] as const
export type SpecificationVerdict = (typeof SPECIFICATION_VERDICTS)[number]

export interface GpcRequirement {
	attributeCode: string
	attributeTitle?: string | null
	/**
	 * CONJUNTO de valores aceitos. Um edital diz "congelado OU resfriado" —
	 * guardar valor único tornaria inexprimível metade dos editais reais.
	 */
	acceptedValueCodes: readonly string[]
}

export interface GpcDeclaration {
	attributeCode: string
	valueCode: string
	valueTitle?: string | null
}

export interface SpecificationDivergence {
	attributeCode: string
	attributeTitle: string | null
	accepted: string[]
	/** null = o fornecedor não declarou nada neste atributo. */
	declared: string | null
	reason: "nao_declarado" | "valor_nao_aceito"
}

export interface SpecificationComparison {
	verdict: SpecificationVerdict
	divergences: SpecificationDivergence[]
}

/**
 * Impressão digital da exigência. Ordena atributos e valores antes de
 * hashear, para que reordenar a mesma exigência não invalide vereditos
 * gravados. Sem isto, mudar a especificação deixaria vereditos velhos com
 * cara de válidos — a mesma classe de erro do snapshot de ATA que não congela
 * o que publicou.
 */
export function specFingerprint(requirements: readonly GpcRequirement[]): string {
	const canonical = requirements
		.map((requirement) => ({
			a: requirement.attributeCode.trim(),
			v: [...new Set(requirement.acceptedValueCodes.map((value) => value.trim()))].sort(),
		}))
		.filter((entry) => entry.a !== "" && entry.v.length > 0)
		.sort((left, right) => (left.a < right.a ? -1 : left.a > right.a ? 1 : 0))

	return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 32)
}

/** Veredito vencido: a exigência mudou desde que ele foi emitido. */
export function isVerdictStale(cachedFingerprint: string | null | undefined, currentFingerprint: string): boolean {
	return cachedFingerprint == null || cachedFingerprint !== currentFingerprint
}

/**
 * Compara declaração × exigência.
 *
 * Precedência: `nao_atende` domina `indeterminado`, que domina `atende`. Um
 * atributo declarado errado é fato; um atributo não declarado é ausência de
 * informação, e os dois não podem colapsar no mesmo resultado — o fornecedor
 * precisa saber se corrige o produto ou completa o cadastro.
 *
 * Exigência vazia devolve `indeterminado`, não `atende`: dizer "atende" quando
 * nada foi especificado é a resposta que mais engana numa tela de fornecedor.
 */
export function compareDeclaration(requirements: readonly GpcRequirement[], declarations: readonly GpcDeclaration[]): SpecificationComparison {
	if (requirements.length === 0) return { verdict: "indeterminado", divergences: [] }

	const declaredByAttribute = new Map<string, GpcDeclaration>()
	for (const declaration of declarations) declaredByAttribute.set(declaration.attributeCode.trim(), declaration)

	const divergences: SpecificationDivergence[] = []
	let missing = false

	for (const requirement of requirements) {
		const accepted = [...new Set(requirement.acceptedValueCodes.map((value) => value.trim()))]
		const declaration = declaredByAttribute.get(requirement.attributeCode.trim())

		if (!declaration) {
			missing = true
			divergences.push({
				attributeCode: requirement.attributeCode,
				attributeTitle: requirement.attributeTitle ?? null,
				accepted,
				declared: null,
				reason: "nao_declarado",
			})
			continue
		}

		if (!accepted.includes(declaration.valueCode.trim())) {
			divergences.push({
				attributeCode: requirement.attributeCode,
				attributeTitle: requirement.attributeTitle ?? null,
				accepted,
				declared: declaration.valueTitle ?? declaration.valueCode,
				reason: "valor_nao_aceito",
			})
		}
	}

	const rejected = divergences.some((divergence) => divergence.reason === "valor_nao_aceito")
	if (rejected) return { verdict: "nao_atende", divergences }
	if (missing) return { verdict: "indeterminado", divergences }
	return { verdict: "atende", divergences: [] }
}

// ─── Porta ───────────────────────────────────────────────────────────────────

export interface VerificationRequest {
	gtin: string
	purchaseItemId: string
	requirements: readonly GpcRequirement[]
}

export interface VerificationResult extends SpecificationComparison {
	gtin: string
	purchaseItemId: string
	/** Quem decidiu: a API da GS1 ou a comparação local sobre declaração em base. */
	source: "gs1_api" | "local"
	specFingerprint: string
	raw?: unknown
}

export interface GtinSpecificationVerifier {
	verify(request: VerificationRequest): Promise<VerificationResult>
}

/** Carrega a declaração GPC conhecida de um GTIN (base local, hoje; GS1, depois). */
export type DeclarationLoader = (gtin: string) => Promise<readonly GpcDeclaration[]>

/**
 * Verificador local — compara contra a declaração já registrada na base.
 *
 * É o modo degradado e o stub de desenvolvimento. Enquanto a integração com a
 * GS1 não fecha, é ele que responde, e o `source: "local"` gravado no veredito
 * é o que permite distinguir depois o que foi conferido de verdade.
 */
export function createLocalVerifier(loadDeclaration: DeclarationLoader): GtinSpecificationVerifier {
	return {
		async verify(request) {
			const declarations = await loadDeclaration(request.gtin)
			const comparison = compareDeclaration(request.requirements, declarations)
			return {
				...comparison,
				gtin: request.gtin,
				purchaseItemId: request.purchaseItemId,
				source: "local",
				specFingerprint: specFingerprint(request.requirements),
			}
		},
	}
}

/** Frase curta para a tela — a mesma para o conferente e para o fornecedor. */
export function describeVerdict(verdict: SpecificationVerdict, divergences: readonly SpecificationDivergence[]): string {
	if (verdict === "atende") return "GTIN atende à especificação declarada."
	if (verdict === "indeterminado") {
		const pending = divergences.filter((divergence) => divergence.reason === "nao_declarado").length
		return pending > 0
			? `Não é possível concluir: ${pending} atributo(s) exigido(s) sem declaração do fornecedor.`
			: "Não é possível concluir: especificação sem exigências declaradas."
	}
	const rejected = divergences.filter((divergence) => divergence.reason === "valor_nao_aceito")
	return `GTIN não atende: ${rejected.map((divergence) => divergence.attributeTitle ?? divergence.attributeCode).join(", ")}.`
}
