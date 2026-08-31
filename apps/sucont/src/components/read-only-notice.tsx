import { Lock } from "lucide-react"

/**
 * Aviso de seção somente-leitura.
 *
 * Toda escrita do sucont é barrada no servidor por `requireSucontEditor`
 * (nível 2). Enquanto a tela não sabia disso, o usuário de nível 1 via os botões
 * de gravar, preenchia o formulário e só descobria a negativa no 403 — depois do
 * trabalho, e sem mensagem traduzida. O princípio é o oposto: a tela nunca
 * oferece o que a política nega, e diz por que não oferece.
 *
 * Some quando o usuário PODE editar: quem tem o nível não precisa ler sobre ele.
 */
export function ReadOnlyNotice({ scope }: { scope: string }) {
	return (
		<div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
			<Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
			<div className="min-w-0">
				<p className="text-xs font-bold uppercase tracking-wider text-slate-600">Somente leitura</p>
				<p className="text-[11px] text-slate-500 mt-0.5">
					Seu acesso permite consultar {scope}, não alterar. Editar exige nível 2 no módulo <span className="font-mono">sucont</span> — peça a um gestor da
					SUCONT-4.
				</p>
			</div>
		</div>
	)
}
