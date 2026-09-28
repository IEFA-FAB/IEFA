/**
 * `fetch` de todas as server functions chamadas pelo navegador (`start.ts`,
 * `serverFns.fetch`). No SSR as server functions rodam direto e isto não entra.
 *
 * Duas coisas que o `fetch` padrão não faz:
 *   - resposta de erro que o TanStack tomaria por sucesso vira erro legível
 *     (`checkServerFnResponse`), e a queda de conexão também;
 *   - resposta de um build mais novo que o da aba avisa, uma vez, que há versão nova e
 *     oferece recarregar. Recarrega só quem clica: um editor com autosave pendente não pode
 *     ser derrubado por baixo, e os rascunhos são descarregados antes.
 */
import { toast } from "@/components/ui/toast"
import { draftStore } from "@/lib/drafts/draft-store"
import { reportError } from "@/lib/observability/report-error"

import { BUILD_ID, BUILD_ID_HEADER, compareBuildIds } from "./build-id"
import { checkServerFnResponse, describeTransportFailure, ServerFnTransportError } from "./server-fn-response"

let newBuildNoticeShown = false

function reloadKeepingDrafts() {
	draftStore.flush()
	window.location.reload()
}

function noteServerBuild(serverBuild: string | null) {
	if (newBuildNoticeShown || typeof window === "undefined") return
	if ((compareBuildIds(serverBuild, BUILD_ID) ?? 0) <= 0) return
	newBuildNoticeShown = true
	toast.info("Há uma versão nova do SISUB", {
		id: "sisub-new-build",
		description: "Recarregue quando puder. Os rascunhos ficam guardados, e editor sem rascunho avisa antes de sair.",
		duration: Number.POSITIVE_INFINITY,
		action: { label: "Recarregar", onClick: reloadKeepingDrafts },
	})
}

function isAbort(error: unknown, init: RequestInit | undefined): boolean {
	return init?.signal?.aborted === true || (error instanceof DOMException && error.name === "AbortError")
}

export async function serverFnFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	let response: Response
	try {
		response = await fetch(input, init)
	} catch (error) {
		if (isAbort(error, init)) throw error
		throw new ServerFnTransportError(describeTransportFailure(0, false), 0)
	}
	const serverBuild = response.headers.get(BUILD_ID_HEADER)
	noteServerBuild(serverBuild)
	try {
		return await checkServerFnResponse(response)
	} catch (error) {
		reportError(error, { source: "server-fn-transport", status: response.status, serverBuild, clientBuild: BUILD_ID })
		throw error
	}
}
