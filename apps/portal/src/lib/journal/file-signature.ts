/**
 * @module file-signature
 * Assinatura (magic bytes) esperada de cada extensão do bucket de submissões.
 *
 * O upload é por signed URL: os bytes vão do navegador direto para o storage, e o nome
 * `manuscript.pdf` não prova nada sobre o conteúdo — um autor subia um SVG com script
 * como `manuscript.pdf`, e quem abria o arquivo era o editor ou o revisor. O servidor
 * lê o começo do objeto ao gravar o caminho numa versão e exige a assinatura do formato.
 *
 * `.typ` e `.csv` são texto e não têm assinatura: para eles vale o Content-Type do
 * bucket (derivado da extensão), não esta checagem.
 *
 * Módulo puro — a leitura dos bytes fica em `file-signature.server.ts`.
 */

const SIGNATURES: Record<string, readonly (readonly number[])[]> = {
	// `%PDF-`
	pdf: [[0x25, 0x50, 0x44, 0x46, 0x2d]],
	// `PK\x03\x04` (arquivo com entradas) ou `PK\x05\x06` (zip vazio)
	zip: [
		[0x50, 0x4b, 0x03, 0x04],
		[0x50, 0x4b, 0x05, 0x06],
	],
	png: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
	jpg: [[0xff, 0xd8, 0xff]],
	jpeg: [[0xff, 0xd8, 0xff]],
}

/** Quantos bytes do começo do arquivo bastam para decidir qualquer assinatura. */
export const SIGNATURE_PROBE_BYTES = Math.max(...Object.values(SIGNATURES).flatMap((list) => list.map((signature) => signature.length)))

/** A extensão tem assinatura binária a conferir? (`typ`/`csv` não têm.) */
export function hasFileSignature(extension: string): boolean {
	return extension.toLowerCase() in SIGNATURES
}

/** `true` se os primeiros bytes batem com uma das assinaturas da extensão. */
export function matchesFileSignature(extension: string, head: Uint8Array): boolean {
	const signatures = SIGNATURES[extension.toLowerCase()]
	if (!signatures) return true
	return signatures.some((signature) => signature.length <= head.length && signature.every((byte, index) => head[index] === byte))
}

/** Nome do formato para a mensagem ao usuário. */
export function formatLabel(extension: string): string {
	return extension.toLowerCase() === "jpeg" ? "JPG" : extension.toUpperCase()
}
