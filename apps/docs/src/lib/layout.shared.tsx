import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"
import { appName, gitConfig, legalLinks } from "./shared"

export function baseOptions(): BaseLayoutProps {
	return {
		nav: {
			title: appName,
		},
		// Links absolutos para o Portal, não rotas locais: o `docs` é o único app da
		// suíte sem credencial de Supabase, e portanto sem como ler
		// `iefa.legal_documents`. Dar a ele um par de env/secret só para renderizar
		// dois documentos públicos seria ampliar a superfície de credencial para
		// nada — o Portal já publica a versão canônica.
		links: legalLinks.map(({ label, href }) => ({ text: label, url: href, external: true })),
		githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
	}
}
