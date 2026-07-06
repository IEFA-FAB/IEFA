// hooks/useAppFavorites.ts
// Favoritos de apps da suite. Persiste no Supabase (iefa.user_app_favorites)
// quando autenticado; senão em localStorage. Segue o padrão de
// usePregoeiroPreferences (Supabase quando logado, localStorage anônimo).

import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { getFavoritesFn, setFavoritesFn } from "@/server/favorites.fn"

const LS_KEY = "iefa_app_favorites_v1"

function readLocal(): string[] {
	if (typeof window === "undefined") return []
	try {
		const raw = localStorage.getItem(LS_KEY)
		const parsed = raw ? JSON.parse(raw) : []
		return Array.isArray(parsed) ? (parsed as string[]) : []
	} catch {
		return []
	}
}

export function useAppFavorites() {
	const [favorites, setFavorites] = useState<Set<string>>(() => new Set())
	const [ready, setReady] = useState(false)
	const [userId, setUserId] = useState<string | null>(null)
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Descobre o usuário atual (client-side)
	useEffect(() => {
		let mounted = true
		supabase.auth.getUser().then(({ data }) => {
			if (mounted) setUserId(data.user?.id ?? null)
		})
		return () => {
			mounted = false
		}
	}, [])

	// Carrega favoritos (Supabase se autenticado, senão localStorage)
	useEffect(() => {
		let mounted = true
		async function load() {
			try {
				if (userId) {
					const ids = (await getFavoritesFn({ data: { userId } })) as string[] | null
					if (mounted) setFavorites(new Set(ids ?? []))
				} else if (mounted) {
					setFavorites(new Set(readLocal()))
				}
			} catch {
				if (mounted) setFavorites(new Set(readLocal()))
			} finally {
				if (mounted) setReady(true)
			}
		}
		load()
		return () => {
			mounted = false
		}
	}, [userId])

	const persist = useCallback(
		(next: Set<string>) => {
			const ids = Array.from(next)
			if (userId) {
				if (saveTimer.current) clearTimeout(saveTimer.current)
				saveTimer.current = setTimeout(() => {
					setFavoritesFn({ data: { userId, appIds: ids } }).catch(() => {
						// silencioso — favoritar não deve travar a UI
					})
				}, 600)
			} else if (typeof window !== "undefined") {
				try {
					localStorage.setItem(LS_KEY, JSON.stringify(ids))
				} catch {
					// ignora quota/serialization
				}
			}
		},
		[userId]
	)

	const toggle = useCallback(
		(appId: string) => {
			setFavorites((prev) => {
				const next = new Set(prev)
				if (next.has(appId)) next.delete(appId)
				else next.add(appId)
				persist(next)
				return next
			})
		},
		[persist]
	)

	const isFavorite = useCallback((appId: string) => favorites.has(appId), [favorites])

	return { favorites, toggle, isFavorite, ready }
}
