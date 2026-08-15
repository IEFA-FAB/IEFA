import { usePBAC } from "@/auth/pbac"

/**
 * `true` quando o usuário pode ALTERAR dados da SDAB (global nível 2).
 *
 * `global` nível 1 é leitura estrita: navega toda a administração global e não muda nada —
 * é o que a política "Conjunto Treino" concede. As operações de domínio já rejeitam a
 * escrita; este hook existe para a UI não oferecer um botão que vai falhar.
 */
export function useGlobalWrite(): boolean {
	const { can } = usePBAC()
	return can("global", 2)
}
