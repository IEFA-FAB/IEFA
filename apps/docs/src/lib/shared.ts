export const appName = "IEFA Docs"
export const docsRoute = "/docs"
export const docsContentRoute = "/llms.mdx/docs"

export const gitConfig = {
	user: "IEFA-FAB",
	repo: "IEFA",
	branch: "main",
}

/** Canal único de exercício de direitos do titular (LGPD, art. 18). */
export const legalContactEmail = "iefa@fab.mil.br"

export const portalUrl = "https://portal.iefa.com.br"

export const legalLinks = [
	{ label: "Termos de Uso", href: `${portalUrl}/termos-de-uso` },
	{ label: "Política de Privacidade", href: `${portalUrl}/politica-de-privacidade` },
	{ label: "Política de Cookies", href: `${portalUrl}/politica-de-cookies` },
] as const
