import type { Tool } from "#/lib/types"

/** Origem do card: rota do próprio hub, caderno do NotebookLM ou qualquer outro site externo. */
export type ToolKind = "internal" | "notebooklm" | "external"

const NOTEBOOKLM_HOST = "notebooklm.google.com"

function isNotebookLmUrl(url: string | undefined): boolean {
	if (!url) return false
	try {
		// Base só para não estourar em path relativo ("/documentacao"), que nunca é NotebookLM.
		const host = new URL(url, "http://hub.invalid").hostname.toLowerCase()
		return host === NOTEBOOKLM_HOST || host.endsWith(`.${NOTEBOOKLM_HOST}`)
	} catch {
		return false
	}
}

export function getToolKind(tool: Pick<Tool, "internalPath" | "url">): ToolKind {
	// internalPath ganha de url: alguns cards trazem os dois e navegam internamente.
	if (tool.internalPath) return "internal"
	if (isNotebookLmUrl(tool.url)) return "notebooklm"
	return "external"
}
