import { useEffect, useState } from "react"

import { getRemainingSeconds, recordFailure, resetRateLimit } from "./rate-limiter.ts"

/**
 * Hook da trava de login: expõe o tempo restante e recalcula a cada segundo
 * enquanto estiver travado. Subpath `@iefa/auth-kit/react` para que a raiz do
 * pacote (usada em server functions) não puxe React.
 */
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
			resetRateLimit()
			setRetryAfter(0)
		},
	}
}
