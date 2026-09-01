/**
 * Acondicionamento e conservação exigidos pela especificação de compra.
 *
 * O vocabulário vive aqui, não espalhado em `check` do banco e string de UI:
 * a migration 20260901120100 declara os mesmos valores em CHECK constraints, e
 * `conditioning.test.ts` prova que as duas listas não divergiram.
 *
 * Por que no item de compra e não no insumo: a mesma carne comprada a vácuo e
 * comprada congelada é o mesmo alimento e duas compras diferentes. Muda o que
 * o fornecedor pode entregar, muda o aceite e muda onde a unidade guarda —
 * pendurar no gênero obrigaria a duplicar o insumo para registrar embalagem.
 */

export const CONSERVATION_CLASSES = ["seco", "resfriado", "congelado", "climatizado", "nao_aplicavel"] as const
export type ConservationClass = (typeof CONSERVATION_CLASSES)[number]

export const PACKAGE_TYPES = [
	"lata",
	"vidro",
	"pet",
	"saco_rafia",
	"saco_plastico",
	"vacuo",
	"bandeja",
	"tetra_pak",
	"caixa_papelao",
	"a_granel",
	"outro",
] as const
export type PackageType = (typeof PACKAGE_TYPES)[number]

export const TRANSPORT_REQUIREMENTS = ["ambiente", "refrigerado", "congelado"] as const
export type TransportRequirement = (typeof TRANSPORT_REQUIREMENTS)[number]

/** Classes que exigem controle de temperatura — as que fazem a medição no recebimento importar. */
export const TEMPERATURE_CONTROLLED: readonly ConservationClass[] = ["resfriado", "congelado", "climatizado"]

export const CONSERVATION_LABELS: Record<ConservationClass, string> = {
	seco: "Seco",
	resfriado: "Resfriado",
	congelado: "Congelado",
	climatizado: "Climatizado",
	nao_aplicavel: "Não se aplica",
}

export const PACKAGE_TYPE_LABELS: Record<PackageType, string> = {
	lata: "Lata",
	vidro: "Vidro",
	pet: "PET",
	saco_rafia: "Saco de ráfia",
	saco_plastico: "Saco plástico",
	vacuo: "Vácuo",
	bandeja: "Bandeja",
	tetra_pak: "Tetra Pak",
	caixa_papelao: "Caixa de papelão",
	a_granel: "A granel",
	outro: "Outro",
}

export const TRANSPORT_LABELS: Record<TransportRequirement, string> = {
	ambiente: "Temperatura ambiente",
	refrigerado: "Refrigerado",
	congelado: "Congelado (frigorífico)",
}

export function isConservationClass(value: unknown): value is ConservationClass {
	return typeof value === "string" && (CONSERVATION_CLASSES as readonly string[]).includes(value)
}

export function isPackageType(value: unknown): value is PackageType {
	return typeof value === "string" && (PACKAGE_TYPES as readonly string[]).includes(value)
}

// ─── Extração a partir do texto herdado ──────────────────────────────────────

/**
 * Estado de conservação escrito na descrição CATMAT.
 *
 * O CATMAT já traz isso em 299 dos 1.960 itens de compra, no formato
 * `... ESTADO DE CONSERVAÇÃO: CONGELADO(A)`. Só o rótulo explícito conta.
 *
 * "IN NATURA" NÃO é classificado de propósito, e são 295 itens: in natura diz
 * que o alimento não sofreu processamento e não diz nada sobre temperatura —
 * alface in natura é resfriada, cebola in natura é seca. Chutar produziria
 * centenas de linhas com classe errada e cara de conferida, que é pior que
 * centenas de linhas vazias numa fila de revisão.
 */
export function parseConservationFromCatmat(description: string | null | undefined): ConservationClass | null {
	if (!description) return null
	const match = /estado\s+de\s+conserva[çc][ãa]o\s*:\s*([^,;]+)/i.exec(description)
	if (!match) return null

	const state = stripDiacritics(match[1]).toLowerCase()
	if (/congelad/.test(state)) return "congelado"
	if (/resfriad|refrigerad/.test(state)) return "resfriado"
	if (/seco|seca|desidratad|desidratada/.test(state)) return "seco"
	return null
}

/**
 * Teto de temperatura escrito em texto livre de entrega.
 *
 * O único padrão presente no dado é "temperatura -12 ºC ou inferior", nas seis
 * linhas de `delivery_conditioning` preenchidas. Reconhece o sinal negativo,
 * vírgula decimal e as variantes de grau; qualquer outra redação devolve null
 * e vai para revisão, em vez de virar regex especulativa.
 */
export function parseTemperatureCeiling(text: string | null | undefined): number | null {
	if (!text) return null
	const match = /(-\s*\d+(?:[.,]\d+)?)\s*(?:º|°|graus?)?\s*C\b/i.exec(text)
	if (!match) return null
	const value = Number(match[1].replace(/\s+/g, "").replace(",", "."))
	return Number.isFinite(value) ? value : null
}

/** Exige transporte frigorificado? Lê a menção explícita, não a classe. */
export function requiresRefrigeratedTransport(text: string | null | undefined): boolean {
	if (!text) return false
	return /frigorific|refrigerad|congelad/i.test(stripDiacritics(text))
}

// ─── Veredito da temperatura medida no recebimento ───────────────────────────

export const TEMPERATURE_VERDICTS = ["nao_medido", "sem_faixa", "dentro", "acima", "abaixo"] as const
export type TemperatureVerdict = (typeof TEMPERATURE_VERDICTS)[number]

export interface TemperatureRange {
	/** Piso aceito, em °C. null = sem piso ("-12 ou inferior" é max sem min). */
	minC: number | null
	/** Teto aceito, em °C. */
	maxC: number | null
}

/**
 * Compara a temperatura aferida com a faixa exigida.
 *
 * `nao_medido` e `sem_faixa` são resultados distintos e nenhum dos dois é
 * reprovação: não medir (cozinha sem termômetro) é diferente de não haver o
 * que comparar (especificação sem faixa declarada). Tratar os dois como
 * "ok" esconderia a lacuna; tratar como "fora" travaria o recebimento por
 * falta de cadastro.
 */
export function temperatureVerdict(measuredC: number | null | undefined, range: TemperatureRange): TemperatureVerdict {
	if (measuredC == null || !Number.isFinite(measuredC)) return "nao_medido"
	if (range.minC == null && range.maxC == null) return "sem_faixa"
	if (range.maxC != null && measuredC > range.maxC) return "acima"
	if (range.minC != null && measuredC < range.minC) return "abaixo"
	return "dentro"
}

/** O veredito reprova a entrega? `nao_medido` e `sem_faixa` não reprovam — não há prova de nada. */
export function isTemperatureOutOfRange(verdict: TemperatureVerdict): boolean {
	return verdict === "acima" || verdict === "abaixo"
}

export interface ConditioningSpec {
	conservationClass: ConservationClass | null
	storageTempMinC: number | null
	storageTempMaxC: number | null
	minShelfLifeDaysOnDelivery: number | null
	packageType: PackageType | null
	packageNetContent: number | null
	packageNetContentUnit: string | null
	transportRequirement: TransportRequirement | null
}

/**
 * Motivo de divergência pré-preenchido quando a temperatura sai da faixa.
 * Texto do conferente, não log: é ele que vai para o termo de recebimento.
 */
export function temperatureDivergenceReason(measuredC: number, range: TemperatureRange): string {
	const limits: string[] = []
	if (range.minC != null) limits.push(`mínima ${formatCelsius(range.minC)}`)
	if (range.maxC != null) limits.push(`máxima ${formatCelsius(range.maxC)}`)
	const exigida = limits.length > 0 ? limits.join(", ") : "sem faixa declarada"
	return `Temperatura aferida ${formatCelsius(measuredC)} fora da faixa exigida (${exigida}).`
}

/** Resumo de uma linha para a tela de conferência. Vazio quando nada foi especificado. */
export function describeConditioning(spec: Partial<ConditioningSpec>): string {
	const parts: string[] = []
	if (spec.conservationClass) parts.push(CONSERVATION_LABELS[spec.conservationClass])

	const min = spec.storageTempMinC ?? null
	const max = spec.storageTempMaxC ?? null
	if (min != null && max != null) parts.push(`${formatCelsius(min)} a ${formatCelsius(max)}`)
	else if (max != null) parts.push(`${formatCelsius(max)} ou inferior`)
	else if (min != null) parts.push(`${formatCelsius(min)} ou superior`)

	if (spec.packageType) parts.push(PACKAGE_TYPE_LABELS[spec.packageType])
	if (spec.packageNetContent != null && spec.packageNetContentUnit) {
		parts.push(`${formatQuantity(spec.packageNetContent)} ${spec.packageNetContentUnit}`)
	}
	if (spec.transportRequirement && spec.transportRequirement !== "ambiente") {
		parts.push(`transporte ${TRANSPORT_LABELS[spec.transportRequirement].toLowerCase()}`)
	}
	if (spec.minShelfLifeDaysOnDelivery != null) {
		parts.push(`validade mínima ${spec.minShelfLifeDaysOnDelivery} d na entrega`)
	}
	return parts.join(" · ")
}

/** Validade remanescente exigida foi respeitada? Sem exigência ou sem validade, não reprova. */
export function meetsMinimumShelfLife(expiryDate: string | null, receivedOn: string, minDays: number | null): boolean {
	if (minDays == null || expiryDate == null) return true
	const expiry = Date.parse(`${expiryDate}T00:00:00Z`)
	const received = Date.parse(`${receivedOn}T00:00:00Z`)
	if (!Number.isFinite(expiry) || !Number.isFinite(received)) return true
	const days = Math.floor((expiry - received) / 86_400_000)
	return days >= minDays
}

function formatCelsius(value: number): string {
	return `${Number.isInteger(value) ? value : value.toFixed(1)} °C`
}

function formatQuantity(value: number): string {
	return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)))
}

function stripDiacritics(value: string): string {
	return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}
