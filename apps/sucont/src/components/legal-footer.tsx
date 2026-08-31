import { LegalFooterLinks } from "@iefa/legal-kit/react"

/**
 * Rodapé legal mínimo, para telas que não montam o `HubLayout`.
 *
 * O `LGPD.md` exige que todo app que trata dado pessoal exponha as três rotas
 * legais COM link no rodapé. O link vivia só dentro do `HubLayout`, e quatro
 * rotas do sucont não o montam — `auditor`, `centro-monitoramento`,
 * `subitens-genericos` e `documentacao` — então navegar direto para qualquer
 * uma delas deixava o usuário sem caminho para os termos, a política de
 * privacidade e a de cookies.
 *
 * O `HubLayout` continua com o rodapé completo (versão, aviso de acesso
 * restrito); este componente é só o que a conformidade exige.
 */
export function LegalFooter({ className = "" }: { className?: string }) {
	return (
		<footer className={`border-t border-border px-4 py-6 sm:px-6 ${className}`}>
			<div className="mx-auto flex max-w-6xl flex-col items-center gap-2 md:flex-row md:justify-between">
				<LegalFooterLinks
					className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1"
					linkClassName="text-hint font-mono uppercase text-muted-foreground transition-colors hover:text-foreground"
				/>
				<p className="text-hint font-mono text-muted-foreground">© {new Date().getFullYear()} SUCONT-4 | DIREF | FAB</p>
			</div>
		</footer>
	)
}
