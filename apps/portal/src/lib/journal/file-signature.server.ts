/**
 * @module file-signature.server
 * Confere o CONTEÚDO dos arquivos de uma versão antes de o caminho ser gravado nela.
 *
 * O servidor nunca vê os bytes do upload (signed URL, navegador → storage), então lê o
 * começo do objeto já gravado — um `Range` de poucos bytes, não o arquivo inteiro — e
 * exige a assinatura do formato (ver `file-signature.ts`).
 *
 * Onde isto roda importa: o autor pode regravar o mesmo caminho (`upsert`) enquanto o
 * artigo está num status em que ele edita. Por isso a checagem é repetida na transição
 * que tira o artigo desse status (submissão do rascunho, re-submissão da revisão) —
 * depois dela o autor não obtém mais URL de upload para aquela versão.
 */

import { formatLabel, hasFileSignature, matchesFileSignature, SIGNATURE_PROBE_BYTES } from "@/lib/journal/file-signature"
import { parseStoredSubmissionPath, SUBMISSIONS_BUCKET } from "@/lib/journal/storage-paths"
import { getJournalServerClient } from "@/lib/supabase.server"

/** Deadline da leitura do começo do objeto — é um round-trip curto, não um download. */
const PROBE_TIMEOUT_MS = 10_000

/** Primeiros `length` bytes do objeto; `null` se ele não existe no bucket. */
async function readObjectHead(path: string, length: number): Promise<Uint8Array | null> {
	const { data, error } = await getJournalServerClient().storage.from(SUBMISSIONS_BUCKET).createSignedUrl(path, 60)
	if (error || !data?.signedUrl) return null

	const response = await fetch(data.signedUrl, {
		headers: { Range: `bytes=0-${length - 1}` },
		signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
	})
	if (response.status === 404 || response.status === 400) return null
	// 416: o objeto existe e está vazio — não há assinatura para casar.
	if (response.status === 416) return new Uint8Array(0)
	if (!response.ok || !response.body) throw new Error("Não foi possível conferir o arquivo enviado. Tente novamente.")

	// Um storage que ignore o `Range` devolveria o arquivo inteiro: lê só o necessário
	// e cancela o resto do corpo.
	const head = new Uint8Array(length)
	let filled = 0
	const reader = response.body.getReader()
	try {
		while (filled < length) {
			const { done, value } = await reader.read()
			if (done) break
			const take = Math.min(value.length, length - filled)
			head.set(value.subarray(0, take), filled)
			filled += take
		}
	} finally {
		await reader.cancel().catch(() => {})
	}
	return head.subarray(0, filled)
}

/**
 * Nega a gravação se algum arquivo com formato binário não tiver a assinatura da
 * extensão, ou não existir no bucket. Os caminhos já passaram por
 * `areVersionPathsOfArticle` — aqui só se confere o conteúdo.
 */
export async function assertStoredFilesMatchExtension(paths: readonly (string | null | undefined)[]): Promise<void> {
	const checks = paths
		.filter((path): path is string => !!path)
		.map((path) => ({ path, extension: parseStoredSubmissionPath(path)?.extension }))
		.filter((entry): entry is { path: string; extension: string } => !!entry.extension && hasFileSignature(entry.extension))

	await Promise.all(
		checks.map(async ({ path, extension }) => {
			const head = await readObjectHead(path, SIGNATURE_PROBE_BYTES)
			const fileName = path.split("/").pop()
			if (!head) throw new Error(`Arquivo ${fileName} não encontrado. Envie-o novamente.`)
			if (!matchesFileSignature(extension, head)) {
				throw new Error(`O arquivo ${fileName} não é um ${formatLabel(extension)} válido. Envie-o novamente no formato correto.`)
			}
		})
	)
}
