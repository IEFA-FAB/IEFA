import { useEffect, useState } from "react"

const STORAGE_KEY = "auth_rate_limit"
const MAX_ATTEMPTS = 5
const COOLDOWNS_SEC = [30, 60, 120, 300]

interface RateLimitState {
	failures: number
	lockUntil: number
	tier: number
}

function load(): RateLimitState {
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY)
		if (raw) return JSON.parse(raw)
	} catch {}
	return { failures: 0, lockUntil: 0, tier: 0 }
}

function save(s: RateLimitState) {
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s))
	} catch {}
}

function getRemainingSeconds(): number {
	const { lockUntil } = load()
	if (lockUntil > Date.now()) return Math.ceil((lockUntil - Date.now()) / 1000)
	return 0
}

function recordFailure(): number {
	const s = load()
	const now = Date.now()
	if (s.lockUntil > 0 && s.lockUntil <= now) s.failures = 0
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

function reset() {
	try {
		sessionStorage.removeItem(STORAGE_KEY)
	} catch {}
}

export function useLoginRateLimiter() {
	const [retryAfter, setRetryAfter] = useState(getRemainingSeconds)

	useEffect(() => {
		if (retryAfter <= 0) return
		const id = setTimeout(() => setRetryAfter(getRemainingSeconds()), 1000)
		return () => clearTimeout(id)
	}, [retryAfter])

	return {
		isLocked: retryAfter > 0,
		retryAfter,
		onFailure: () => setRetryAfter(recordFailure()),
		onSuccess: () => {
			reset()
			setRetryAfter(0)
		},
	}
}
