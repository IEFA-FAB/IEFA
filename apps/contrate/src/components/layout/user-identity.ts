import type { User } from "@supabase/supabase-js"

export interface UserIdentity {
	displayName: string
	firstName: string
	initials: string
	email: string
}

/**
 * Nome, primeiro nome e iniciais a partir do que o cadastro tem. Sem nome no
 * `user_metadata`, a parte local do e-mail é o melhor palpite.
 *
 * Um lugar só porque o menu do cabeçalho da home e o rodapé da barra lateral
 * mostram a MESMA pessoa — duas regras de iniciais acabariam dando duas siglas.
 */
export function getUserIdentity(user: User | null | undefined): UserIdentity {
	const meta = (user?.user_metadata ?? {}) as {
		name?: string
		full_name?: string
		display_name?: string
		first_name?: string
	}
	const email = user?.email ?? ""
	const raw = meta.display_name || meta.first_name || meta.name || meta.full_name || email.split("@")[0] || "Usuário"
	const displayName = raw.includes("@") ? (raw.split("@")[0] ?? raw) : raw
	const parts = displayName
		.replace(/[._-]+/g, " ")
		.trim()
		.split(/\s+/)
		.filter(Boolean)

	const initials =
		parts.length === 0
			? "US"
			: parts.length === 1
				? (parts[0] ?? "").slice(0, 2).toUpperCase()
				: `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase()

	return { displayName, firstName: parts[0] ?? displayName, initials, email }
}
