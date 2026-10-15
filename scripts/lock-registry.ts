/**
 * O que os gates de dependência compartilham: a leitura do `bun.lock` e o registro das
 * exceções declaradas.
 *
 * Mora fora dos gates porque são dois lendo a MESMA lista. `check-override-ranges` cobra que
 * todo override esteja registrado com motivo (FORCED, MIRRORS ou FLOORS) e que o que capa um
 * consumidor esteja em FORCED ou MIRRORS; `check-installed-ranges`
 * aceita como intencional só a violação de faixa de um CONSUMIDOR listado em FORCED. Duas cópias do
 * FORCED seriam dois allowlists que um dia discordam.
 */

export type LockPkg = [string, ...unknown[]]

/**
 * Override que sai da faixa do consumidor de propósito. Cada entrada é dívida com saída.
 *
 * `consumers` é quem PODE ficar fora da faixa por causa do override — e só ele. A isenção é por
 * par (consumidor, pacote), não pelo nome do pacote: listar só `esbuild` desligaria o gate para
 * todo consumidor NOVO de esbuild que cair fora da faixa, que é justamente o defeito que o
 * `check-installed-ranges` existe para pegar.
 */
export interface Forced {
	reason: string
	consumers: readonly string[]
}

export const FORCED: Record<string, Forced> = {
	esbuild: {
		consumers: ["@esbuild-kit/core-utils", "drizzle-kit"],
		reason:
			"o alvo é a cópia de @esbuild-kit/core-utils@3.3.2, que pin `~0.18.20` — a faixa que carrega GHSA-67mh-4wv8-2f99 (dev server responde a qualquer origem). drizzle-kit@0.31.10 já pin `^0.25.4`, corrigido, e só é arrastado junto porque override do bun é plano. 0.31.10 é a última do drizzle-kit e ainda depende do @esbuild-kit/esm-loader, deprecado, então não há release para esperar. Cadeia é só dev. Verificado que o drizzle-kit ainda carrega e avalia o drizzle.config.ts sob 0.28.2, que é justamente o caminho do loader. Sai quando o drizzle-kit largar o @esbuild-kit, ou quando o repo largar o drizzle-kit.",
	},
	undici: {
		consumers: ["get-it"],
		reason:
			"o piso `>=8.9.0` existe por @grafana/faro-bundlers-shared@0.12.0, que pin `^8.5.0` — abaixo do 8.9.0 que corrige GHSA-4cwx-7wf7-3272 (high) e mais quatro medium da mesma leva. get-it@9.5.2 (via @sanity/client 8) pin `^7.29.0`, que JÁ é a linha 7 corrigida: ele não ganha nada e só atravessa o major porque override do bun é plano. Nenhuma versão publicada do get-it aceita undici 8, e o @sanity/client 8.4.0 pin `get-it@^9.5.0`. O get-it importa só `Agent`, `EnvHttpProxyAgent`, `ProxyAgent` e `fetch`, os quatro presentes no undici 8.10.0. Sai quando o get-it subir a faixa, ou quando o bun passar a aceitar override escopado por consumidor.",
	},
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

/**
 * Override que só LEVANTA O PISO dentro da faixa que os consumidores já aceitam: quase sempre
 * correção de segurança que o lockfile não pegava sozinho. Não força ninguém (o gate cobraria
 * FORCED) nem capa (o gate cobraria a faixa), então os checks de faixa não dizem por que ele
 * existe. Isto diz.
 *
 * `advisories` é o que o commit de origem cita (GHSA/CWE); vazio quando ele não cita. `source` é
 * o commit/PR onde o motivo está. Sai quando nenhum consumidor resolveria abaixo do piso sem o
 * override (o próprio upstream subiu a faixa): apague o override e a entrada juntos.
 */
export interface Floor {
	reason: string
	advisories: readonly string[]
	source: string
}

export const FLOORS: Record<string, Floor> = {
	react: {
		source: "primeiro commit; #202, #420",
		advisories: [],
		reason:
			"o motivo original não foi registrado. O que ele faz: uma cópia só de React no monorepo, no piso que os apps declaram (^19.3.0). Atrás da faixa dos apps já deixou o runtime em 19.2.8 com @types/react 19.3 (#420). Anda junto com os apps e com react-dom.",
	},
	"react-dom": {
		source: "primeiro commit; #202, #420",
		advisories: [],
		reason: "par do override de react, no mesmo número: react-dom só funciona com o react da mesma versão.",
	},
	ws: {
		source: "fa650bf2 (#202)",
		advisories: [],
		reason: "piso de segurança: 8.20.0 → 8.21.3, na leva que zerou as críticas do bun audit. O commit não cita o advisory.",
	},
	protobufjs: {
		source: "fa650bf2 (#202)",
		advisories: [],
		reason: "piso de segurança: 7.5.5 → 7.6.5 (5 high, injeção de código, segundo o PR). O commit não cita os IDs.",
	},
	"fast-uri": {
		source: "fa650bf2 (#202)",
		advisories: [],
		reason: "piso de segurança: 3.1.0 → 3.1.5 (5 high, segundo o PR). O commit não cita os IDs.",
	},
	tar: {
		source: "fa650bf2 (#202)",
		advisories: ["GHSA-23hp-3jrh-7fpw"],
		reason:
			"piso de segurança: 7.5.16 → 7.5.22. Crítica que era a baseline datada do gate `bun audit --audit-level=critical`; com o override o gate roda sem --ignore.",
	},
	qs: {
		source: "fa650bf2 (#202)",
		advisories: [],
		reason: "piso de segurança, na leva do #202. O commit não cita o advisory.",
	},
	"body-parser": {
		source: "fa650bf2 (#202)",
		advisories: [],
		reason: "piso de segurança, na leva do #202. O commit não cita o advisory.",
	},
	"@hono/node-server": {
		source: "fa650bf2 (#202)",
		advisories: [],
		reason:
			"piso de segurança, na leva do #202 (o commit não cita o advisory). `>=` e não `^` porque o SDK do MCP declara `^1.19.9 || ^2.0.5`: o caret capava o 2.x (é o caso que o gate de cap nasceu para pegar).",
	},
	"launch-editor": {
		source: "fa650bf2 (#202)",
		advisories: [],
		reason: "piso de segurança, na leva do #202. O commit não cita o advisory. Chega por @tanstack/devtools-vite (só dev).",
	},
	"shell-quote": {
		source: "fa650bf2 (#202), 02e0d74d (#596)",
		advisories: ["GHSA-w7jw-789q-3m8p", "GHSA-pqg4-j6r4-53mv"],
		reason:
			"piso de segurança, duas críticas: 1.8.3 → 1.10.0 no #202 (era a outra baseline do gate de crítica) e < 1.11.0 no #596, via @tanstack/devtools-vite › launch-editor. O advisory pede 1.11.0; o #596 pôs `^1.12.0`, a última publicada naquele dia (1.12.0 é de 2026-10-02), sem registrar por que não 1.11.0. Nenhum advisory conhecido exige 1.12 (conferido no GitHub Advisory DB em 2026-10-15): descer para `^1.11.0` é seguro, mas não muda a versão resolvida, já que os consumidores aceitam `^1`.",
	},
	"proxy-addr": {
		source: "02e0d74d (#596)",
		advisories: ["GHSA-jqcg-44mw-7w3h"],
		reason: "piso de segurança: crítica em < 2.0.8, via sisub-mcp › @modelcontextprotocol/sdk › express.",
	},
	seroval: {
		source: "02e0d74d (#596)",
		advisories: ["GHSA-p6vx-979v-rg4c"],
		reason: "piso de segurança: crítica que pegava as 1.5.6 e 1.6.7 resolvidas, via @tanstack/router-core e solid-js (devtools).",
	},
	"seroval-plugins": {
		source: "02e0d74d (#596)",
		advisories: ["GHSA-p6vx-979v-rg4c"],
		reason: "anda junto com o override de seroval, no mesmo número.",
	},
	"solid-js": {
		source: "02e0d74d (#596)",
		advisories: ["GHSA-p6vx-979v-rg4c"],
		reason:
			"o 1.9.15 prende seroval em `~1.5.4`, abaixo da correção; o 1.9.17 já pede `~1.6.8`. Subir o solid-js leva a família inteira sem entrada em FORCED.",
	},
	langsmith: {
		source: "fa650bf2 (#202)",
		advisories: [],
		reason:
			"piso de segurança: 0.5.18 → 0.8.11, que larga o uuid@10.0.0 vulnerável que ele fixava (o commit não cita o ID). O teto `<1.0.0` é o mesmo do @langchain/core: caret em 0.x trancaria o minor.",
	},
	"@ungap/structured-clone": {
		source: "73425bd8 (#260)",
		advisories: ["CWE-502"],
		reason: "o 1.3.0 está deprecado no npm por desserialização insegura (CWE-502); o override leva ao 1.4.0.",
	},
}

/**
 * Todo override da raiz tem de estar em exatamente um registro (FORCED, MIRRORS ou FLOORS), e
 * entrada de FLOORS sem override é morta. Devolve um problema por linha; vazio quando está tudo
 * registrado. FORCED e MIRRORS mortos são cobrados pelo `check-override-ranges`, que sabe se
 * ainda forçam.
 */
export function overrideRegistryProblems(
	overrides: Record<string, string>,
	registries: { FORCED: Record<string, unknown>; MIRRORS: Record<string, unknown>; FLOORS: Record<string, unknown> } = { FORCED, MIRRORS, FLOORS }
): string[] {
	const problems: string[] = []
	for (const name of Object.keys(overrides)) {
		const found = Object.entries(registries)
			.filter(([, registry]) => Object.hasOwn(registry, name))
			.map(([registryName]) => registryName)
		if (found.length === 0) problems.push(`  ${name}: override sem motivo registrado → registre em FLOORS, FORCED ou MIRRORS (scripts/lock-registry.ts).`)
		else if (found.length > 1) problems.push(`  ${name}: está em ${found.join(" e ")} → um override é uma coisa só; deixe em um.`)
	}
	for (const name of Object.keys(registries.FLOORS)) {
		if (!Object.hasOwn(overrides, name)) problems.push(`  ${name}: entrada morta em FLOORS, não há override com esse nome → apague.`)
	}
	return problems
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
