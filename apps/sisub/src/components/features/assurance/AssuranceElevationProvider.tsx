import type { ReactNode } from "react"
import { createContext, useContext, useState, useSyncExternalStore } from "react"
import { AssuranceElevationDialog } from "@/components/features/assurance/AssuranceElevationDialog"
import type { AssurancePrompt } from "@/lib/assurance/assurance-error"
import { ElevationController } from "@/lib/assurance/elevation-controller"

/**
 * Hospeda o modal de elevação acima de TODA a aplicação.
 *
 * Fica no `__root` de propósito: o modal precisa abrir sobre a tela que estava sendo usada,
 * qualquer que seja ela, sem que cada formulário do sistema tenha que montar o seu. Ele só
 * existe no DOM quando há um pedido em aberto — nenhuma consulta de MFA é feita enquanto
 * ninguém for barrado.
 *
 * @domain app
 */

interface AssuranceElevationContextValue {
	/**
	 * Abre o modal e resolve quando o usuário concluir: `true` sessão elevada, `false`
	 * cancelado. NUNCA rejeita — o cancelamento é uma resposta, não uma falha.
	 */
	requestElevation: (prompt: AssurancePrompt) => Promise<boolean>
}

const AssuranceElevationContext = createContext<AssuranceElevationContextValue | null>(null)

export function AssuranceElevationProvider({ children }: { children: ReactNode }) {
	const [controller] = useState(() => new ElevationController())
	// `getServerSnapshot` devolve `null`: no SSR não existe mutação barrada, e um pedido em
	// aberto durante a hidratação seria um modal sem ninguém do outro lado.
	const prompt = useSyncExternalStore(controller.subscribe, controller.getPrompt, () => null)

	// Sem `useMemo`: o compilador do React cuida da estabilidade deste objeto, e memoização à
	// mão em código compilado é ruído (o app roda `babel-plugin-react-compiler`).
	const value: AssuranceElevationContextValue = { requestElevation: (next) => controller.request(next) }

	return (
		<AssuranceElevationContext.Provider value={value}>
			{children}
			{prompt && <AssuranceElevationDialog prompt={prompt} onResolved={(elevated) => controller.settle(elevated)} />}
		</AssuranceElevationContext.Provider>
	)
}

/**
 * Acesso ao modal de elevação. Lança fora do provider, e isso é o certo: uma mutação
 * protegida montada fora dele ficaria com a recusa do servidor sem tela de volta — falha
 * silenciosa é pior que a exceção que aparece no primeiro teste manual.
 */
export function useAssuranceElevation(): AssuranceElevationContextValue {
	const value = useContext(AssuranceElevationContext)
	if (!value) throw new Error("useAssuranceElevation exige <AssuranceElevationProvider> na árvore (ele vive no __root).")
	return value
}
