/**
 * O que os gates de dependência compartilham: a leitura do `bun.lock` e o registro das
 * exceções declaradas.
 *
 * Mora fora dos gates porque são dois lendo a MESMA lista. `check-override-ranges` cobra que
 * todo override que capa um consumidor esteja em FORCED ou MIRRORS; `check-lock-resolution`
 * aceita como intencional só a violação de faixa cujo pacote está em FORCED. Duas cópias do
 * FORCED seriam dois allowlists que um dia discordam.
 */

export type LockPkg = [string, ...unknown[]]

/** Override que sai da faixa do consumidor de propósito. Cada entrada é dívida com saída. */
export const FORCED: Record<string, string> = {
	"js-yaml": "@redocly/openapi-core pin `4.1.1`; a correção de GHSA-5p4m-2wfm-xmqj não foi backportada para <=4.1.1. Sai quando o redocly subir.",
	esbuild:
		"o alvo é a cópia de @esbuild-kit/core-utils@3.3.2, que pin `~0.18.20` — a faixa que carrega GHSA-67mh-4wv8-2f99 (dev server responde a qualquer origem). drizzle-kit@0.31.10 já pin `^0.25.4`, corrigido, e só é arrastado junto porque override do bun é plano. 0.31.10 é a última do drizzle-kit e ainda depende do @esbuild-kit/esm-loader, deprecado, então não há release para esperar. Cadeia é só dev. Verificado que o drizzle-kit ainda carrega e avalia o drizzle.config.ts sob 0.28.2, que é justamente o caminho do loader. Sai quando o drizzle-kit largar o @esbuild-kit, ou quando o repo largar o drizzle-kit.",
	undici:
		"o piso `>=8.9.0` existe por @grafana/faro-bundlers-shared@0.12.0, que pin `^8.5.0` — abaixo do 8.9.0 que corrige GHSA-4cwx-7wf7-3272 (high) e mais quatro medium da mesma leva. get-it@9.5.2 (via @sanity/client 8) pin `^7.29.0`, que JÁ é a linha 7 corrigida: ele não ganha nada e só atravessa o major porque override do bun é plano. Nenhuma versão publicada do get-it aceita undici 8, e o @sanity/client 8.4.0 pin `get-it@^9.5.0`. O get-it importa só `Agent`, `EnvHttpProxyAgent`, `ProxyAgent` e `fetch`, os quatro presentes no undici 8.10.0. Sai quando o get-it subir a faixa, ou quando o bun passar a aceitar override escopado por consumidor.",
}

/**
 * Override que ESPELHA o pin exato de outro pacote — não é piso, e alargar quebraria.
 *
 * O dono fixa a dependência em versão EXATA. O override existe só para o lockfile não resolver
 * as duas lado a lado; uma faixa deixaria a espelhada flutuar à frente do dono e parear com uma
 * versão contra a qual ele nunca foi publicado.
 *
 * Espelho não entra no check de "capa a faixa do consumidor": esse check pergunta se saiu versão
 * mais nova no registro, e para espelho a resposta é sempre sim no dia seguinte a cada release do
 * dono — ruído permanente, não achado. O que vale checar é o INVARIANTE: a spec do override tem
 * que ser exatamente o que o dono fixa NESTA árvore. Isso só muda quando alguém mexe no lock de
 * propósito, e aí o gate cobra mover os dois juntos.
 */
export const MIRRORS: Record<string, { owner: string; reason: string }> = {
	"@tanstack/query-core": {
		owner: "@tanstack/react-query",
		reason: "react-query fixa query-core em versão exata (PR #202, #237). Sai se o react-query passar a declarar faixa.",
	},
}

export function parseLock(text: string): {
	workspaces: Record<string, Record<string, Record<string, string>>>
	packages: Record<string, LockPkg>
} {
	// bun.lock é JSONC. Tirar a vírgula sobrando por regex cega corromperia hash e faixa de
	// versão que contenham `,` — daí varrer ciente de string.
	let out = ""
	let inString = false
	for (let i = 0; i < text.length; i++) {
		const ch = text[i] as string
		if (inString) {
			out += ch
			if (ch === "\\") out += text[++i] ?? ""
			else if (ch === '"') inString = false
			continue
		}
		if (ch === '"') {
			inString = true
			out += ch
			continue
		}
		if (ch === ",") {
			// Vírgula seguida (só de espaço) por fechamento é sobra: descarta.
			let j = i + 1
			while (j < text.length && /\s/.test(text[j] as string)) j++
			if (text[j] === "}" || text[j] === "]") continue
		}
		out += ch
	}
	return JSON.parse(out)
}
