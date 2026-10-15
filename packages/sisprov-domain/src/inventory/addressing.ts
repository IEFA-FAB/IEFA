/**
 * Níveis de estoque e endereçamento (`openspec/changes/sisprov-foundation`, D17 e D18): as mesmas
 * regras que o banco aplica, para a tela não oferecer o que ele recusa e para os schemas das
 * server functions recusarem antes de ir ao banco.
 *
 * O banco continua sendo a trava (`stock_location_supply_guard`, `storage_position_guard`,
 * `handling_unit_guard`, `inventory.is_valid_gs1_key`); aqui é o espelho, coberto por teste.
 *
 * Sem React nem Drizzle: vai para o bundle do cliente e para o servidor.
 */

import { z } from "zod"

// ─── Níveis ──────────────────────────────────────────────────────────────────

export const STOCK_LEVELS = [1, 2, 3] as const
export type StockLevel = (typeof STOCK_LEVELS)[number]

export const STOCK_LEVEL_LABELS: Record<StockLevel, string> = {
	1: "Nível 1 · Depósito central",
	2: "Nível 2 · Distribuidor regional",
	3: "Nível 3 · Consumo e distribuição final",
}

/** O abastecedor é de nível ESTRITAMENTE menor; o nível 1 não tem abastecedor. */
export function isValidSupplierLevel(supplierLevel: StockLevel, level: StockLevel): boolean {
	return level !== 1 && supplierLevel < level
}

// ─── Posições ────────────────────────────────────────────────────────────────

export const POSITION_KINDS = ["building", "sector", "rack", "shelf", "bin"] as const
export type PositionKind = (typeof POSITION_KINDS)[number]

export const POSITION_KIND_LABELS: Record<PositionKind, string> = {
	building: "Depósito",
	sector: "Setor",
	rack: "Estante",
	shelf: "Prateleira",
	bin: "Escaninho",
}

/** Profundidade do tipo: espelha `inventory.position_kind_rank`. */
export function positionKindRank(kind: PositionKind): number {
	return POSITION_KINDS.indexOf(kind) + 1
}

/** Só prateleira e escaninho guardam estoque. */
export function isStorageKind(kind: PositionKind): boolean {
	return kind === "shelf" || kind === "bin"
}

/** A filha é de tipo mais fundo que a mãe; a raiz pode ser de qualquer tipo. */
export function isValidNesting(parentKind: PositionKind | null, childKind: PositionKind): boolean {
	return parentKind === null || positionKindRank(parentKind) < positionKindRank(childKind)
}

/** Tipos que a tela oferece para uma posição nova dentro de `parentKind` (ou na raiz). */
export function allowedChildKinds(parentKind: PositionKind | null): PositionKind[] {
	return POSITION_KINDS.filter((kind) => isValidNesting(parentKind, kind))
}

/** Segmento do endereço: letras e dígitos, até 12 (o CHECK de `storage_position.code`). */
export const POSITION_CODE_PATTERN = /^[A-Za-z0-9]{1,12}$/

/** Endereço completo: o da mãe, hífen, o segmento. Espelha o trigger. */
export function buildAddress(parentAddress: string | null, code: string): string {
	return parentAddress ? `${parentAddress}-${code}` : code
}

export type PositionRow = {
	id: number
	parentId: number | null
	kind: PositionKind
	code: string
	address: string
	pickingSequence: number | null
}

export type PositionNode<T extends PositionRow = PositionRow> = T & { depth: number }

/**
 * A árvore achatada na ordem de leitura (mãe antes das filhas, irmãs por ordem de separação e
 * endereço), com a profundidade para a indentação. Posição cuja mãe não veio na lista (filtrada,
 * desativada) entra como raiz, para não sumir da tela.
 */
export function flattenPositionTree<T extends PositionRow>(rows: readonly T[]): PositionNode<T>[] {
	const ids = new Set(rows.map((row) => row.id))
	const children = new Map<number | null, T[]>()
	for (const row of rows) {
		const parent = row.parentId !== null && ids.has(row.parentId) ? row.parentId : null
		const list = children.get(parent) ?? []
		list.push(row)
		children.set(parent, list)
	}
	const order = (a: T, b: T) =>
		(a.pickingSequence ?? Number.MAX_SAFE_INTEGER) - (b.pickingSequence ?? Number.MAX_SAFE_INTEGER) || a.address.localeCompare(b.address, "pt-BR")
	const out: PositionNode<T>[] = []
	const visit = (parent: number | null, depth: number) => {
		for (const row of [...(children.get(parent) ?? [])].sort(order)) {
			out.push({ ...row, depth })
			visit(row.id, depth + 1)
		}
	}
	visit(null, 0)
	return out
}

// ─── Chaves GS1 ──────────────────────────────────────────────────────────────

/**
 * Chave GS1 numérica com dígito verificador de módulo 10 (pesos 3 e 1 da direita para a esquerda,
 * sem o verificador). Espelha `inventory.is_valid_gs1_key`.
 */
export function isValidGs1Key(code: string): boolean {
	if (!/^[0-9]{8,18}$/.test(code)) return false
	const digits = code.split("").map(Number)
	const check = digits.pop() as number
	let sum = 0
	for (let i = 0; i < digits.length; i++) {
		const digit = digits[digits.length - 1 - i] as number
		sum += digit * (i % 2 === 0 ? 3 : 1)
	}
	return (10 - (sum % 10)) % 10 === check
}

/** SSCC: 18 dígitos GS1 (caixa, volume). */
export function isValidSscc(code: string): boolean {
	return code.length === 18 && isValidGs1Key(code)
}

/** GLN: 13 dígitos GS1 (local de estoque). */
export function isValidGln(code: string): boolean {
	return code.length === 13 && isValidGs1Key(code)
}

/** GIAI (pallet): 4 a 30 caracteres do conjunto que o CHECK aceita. */
export const GIAI_PATTERN = /^[0-9A-Za-z./:-]{4,30}$/

// ─── Schemas das server functions ────────────────────────────────────────────

export const stockLocationSettingsSchema = z
	.object({
		name: z.string().trim().min(1).max(120),
		level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
		suppliedByLocationId: z.number().int().positive().nullable(),
		receivesDirect: z.boolean(),
		usesPositions: z.boolean(),
		gln: z
			.string()
			.trim()
			.nullable()
			.transform((value) => (value ? value : null))
			.refine((value) => value === null || isValidGln(value), "GLN inválido: 13 dígitos com o dígito verificador GS1"),
	})
	.refine((value) => value.level !== 1 || value.suppliedByLocationId === null, {
		message: "O depósito central (nível 1) não tem abastecedor",
		path: ["suppliedByLocationId"],
	})

export const positionInputSchema = z
	.object({
		locationId: z.number().int().positive(),
		parentId: z.number().int().positive().nullable(),
		kind: z.enum(POSITION_KINDS),
		code: z.string().trim().regex(POSITION_CODE_PATTERN, "Código: letras e dígitos, até 12"),
		aisle: z.number().int().positive().nullable(),
		rackType: z.string().trim().max(60).nullable(),
		pickingSequence: z.number().int().min(0).nullable(),
	})
	.refine((value) => value.kind === "rack" || (value.aisle === null && !value.rackType), {
		message: "Corredor e tipo valem só para estante",
		path: ["aisle"],
	})

export const handlingUnitInputSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("pallet"),
		locationId: z.number().int().positive(),
		code: z.string().trim().regex(GIAI_PATTERN, "GIAI: 4 a 30 caracteres (letras, dígitos, . / : -)"),
		positionId: z.number().int().positive().nullable(),
		weightKg: z.number().positive().nullable(),
	}),
	z.object({
		kind: z.literal("box"),
		locationId: z.number().int().positive(),
		code: z.string().trim().refine(isValidSscc, "SSCC inválido: 18 dígitos com o dígito verificador GS1"),
		lotId: z.uuid(),
		palletId: z.uuid().nullable(),
		positionId: z.number().int().positive().nullable(),
		quantity: z.number().positive().nullable(),
		weightKg: z.number().positive().nullable(),
		boxCategory: z.string().trim().max(40).nullable(),
	}),
])

export const pickingLinesSchema = z
	.array(z.object({ itemId: z.uuid(), quantity: z.number().positive() }))
	.min(1, "Informe ao menos um item")
	.max(200)
