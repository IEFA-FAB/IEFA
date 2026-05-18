export type ResponseMetadataConfig = {
	om?: {
		scopeable?: boolean
	}
}

export type ViewerScopeMode = "global" | "scoped"
export type ViewerScopeEffect = "allow" | "deny"
export type ViewerAttributeKey = "om"

export type ViewerScopeBinding = {
	id?: string
	attribute_key: ViewerAttributeKey
	effect: ViewerScopeEffect
	value: string
}

export type ViewerPolicy = {
	scope_mode: ViewerScopeMode
	bindings: ViewerScopeBinding[]
}

export type ViewerPolicyInput = {
	om?: {
		allow?: string[]
		deny?: string[]
	}
}

export type ScopedResponse = {
	om?: string | null
}

export function normalizeScopeValue(value: string) {
	return value.trim().replace(/\s+/g, " ").toUpperCase()
}

export function normalizeOptionalScopeValue(value?: string | null) {
	if (typeof value !== "string") return null
	const normalized = normalizeScopeValue(value)
	return normalized.length > 0 ? normalized : null
}

export function isOmScopeable(config?: ResponseMetadataConfig | null) {
	return Boolean(config?.om?.scopeable)
}

export function parseResponseMetadataConfig(value: unknown): ResponseMetadataConfig {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {}
	const record = value as Record<string, unknown>
	const omValue = record.om
	if (!omValue || typeof omValue !== "object" || Array.isArray(omValue)) return {}
	const omRecord = omValue as Record<string, unknown>
	return {
		om: {
			scopeable: omRecord.scopeable === true,
		},
	}
}

export function buildBindingsFromPolicyInput(policy?: ViewerPolicyInput): ViewerScopeBinding[] {
	const allow = new Set((policy?.om?.allow ?? []).map(normalizeScopeValue).filter(Boolean))
	const deny = new Set((policy?.om?.deny ?? []).map(normalizeScopeValue).filter(Boolean))

	return [
		...Array.from(allow).map((value) => ({ attribute_key: "om" as const, effect: "allow" as const, value })),
		...Array.from(deny).map((value) => ({ attribute_key: "om" as const, effect: "deny" as const, value })),
	]
}

export function validateViewerPolicyInput(scopeMode: ViewerScopeMode, metadataConfig: ResponseMetadataConfig, policy?: ViewerPolicyInput) {
	if (scopeMode === "global") return
	if (!isOmScopeable(metadataConfig)) {
		throw new Error("Este formulário não permite segmentação por OM")
	}

	const allow = Array.from(new Set((policy?.om?.allow ?? []).map(normalizeScopeValue).filter(Boolean)))
	const deny = Array.from(new Set((policy?.om?.deny ?? []).map(normalizeScopeValue).filter(Boolean)))

	if (allow.length === 0) {
		throw new Error("Visualizadores escopados precisam de ao menos uma OM permitida")
	}

	const overlap = allow.find((value) => deny.includes(value))
	if (overlap) {
		throw new Error(`A OM ${overlap} não pode existir em allow e deny ao mesmo tempo`)
	}
}

export function matchesViewerPolicy(policy: ViewerPolicy, response: ScopedResponse, metadataConfig: ResponseMetadataConfig) {
	if (policy.scope_mode === "global") return true
	if (!isOmScopeable(metadataConfig)) return false

	const normalizedOm = normalizeOptionalScopeValue(response.om)
	if (!normalizedOm) return false

	const omBindings = policy.bindings.filter((binding) => binding.attribute_key === "om")
	const denyValues = new Set(omBindings.filter((binding) => binding.effect === "deny").map((binding) => binding.value))
	if (denyValues.has(normalizedOm)) return false

	const allowValues = omBindings.filter((binding) => binding.effect === "allow").map((binding) => binding.value)
	if (allowValues.length === 0) return false

	return allowValues.includes(normalizedOm)
}

export function filterResponsesByViewerPolicy<T extends ScopedResponse>(responses: T[], policy: ViewerPolicy, metadataConfig: ResponseMetadataConfig) {
	if (policy.scope_mode === "global") return responses
	return responses.filter((response) => matchesViewerPolicy(policy, response, metadataConfig))
}
