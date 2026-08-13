/**
 * @module rate-limiter
 * Trava de tentativas de login, client-side, com cooldown escalonado.
 *
 * Freio de UX contra brute force de balcão (alguém tentando senha na máquina do
 * colega), não controle de segurança: o estado vive no `sessionStorage` e some numa
 * aba anônima. O controle de verdade é o rate limit do GoTrue.
 */
const STORAGE_KEY = "auth_rate_limit"
const MAX_ATTEMPTS = 5
const COOLDOWNS_SEC = [30, 60, 120, 300]

export type RateLimitState = {
	failures: number
	lockUntil: number
	tier: number
}

const EMPTY_STATE: RateLimitState = { failures: 0, lockUntil: 0, tier: 0 }

function load(): RateLimitState {
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY)
		if (raw) return JSON.parse(raw)
	} catch {}
	return { ...EMPTY_STATE }
}

function save(s: RateLimitState) {
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s))
	} catch {}
}

export function getRemainingSeconds(): number {
	const { lockUntil } = load()
	if (lockUntil > Date.now()) return Math.ceil((lockUntil - Date.now()) / 1000)
	return 0
}

export function recordFailure(): number {
	const s = load()
	const now = Date.now()

	// Lock expirado: zera o contador E limpa `lockUntil` — senão a guarda
	// (lockUntil > 0 && lockUntil <= now) fica sempre verdadeira e `failures`
	// oscila entre 0 e 1 para sempre, nunca voltando a atingir MAX_ATTEMPTS.
	// Sem essa linha a trava dispara uma vez e depois nunca mais.
	if (s.lockUntil > 0 && s.lockUntil <= now) {
		s.failures = 0
		s.lockUntil = 0
	}

	s.failures++
	if (s.failures >= MAX_ATTEMPTS) {
		const cooldown = COOLDOWNS_SEC[Math.min(s.tier, COOLDOWNS_SEC.length - 1)]
		s.lockUntil = now + cooldown * 1000
		s.tier++
		s.failures = 0
	}
	save(s)
	return getRemainingSeconds()
}

export function resetRateLimit() {
	try {
		sessionStorage.removeItem(STORAGE_KEY)
	} catch {}
}
