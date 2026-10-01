#!/usr/bin/env bun
/**
 * Gate: cada app SSR serve a baseline de headers de segurança na route rule `/**`
 * do Nitro (ver PR #209). O drift aqui é silencioso — apagar uma linha do
 * `vite.config.ts` não quebra build nem teste, e o app volta a responder sem
 * X-Frame-Options/HSTS/etc. Este check falha o CI se qualquer header sumir DA
 * REGRA `/**` (a única que cobre todo request de página).
 *
 * Escopo: apps SSR servidos pelo próprio runtime Nitro. O docs é estático em
 * S3/CloudFront e não tem servidor: os headers dele vêm da response headers policy do
 * módulo `infra/modules/static-site`, conferida no fim deste gate.
 *
 * CSP: a baseline cobre só as diretivas que não tocam script/estilo/imagem
 * (`frame-ancestors`, `base-uri`, `object-src`, `form-action`) — o gate cobra essas
 * quatro. `script-src`/`img-src`/`connect-src` precisam da própria mudança testada
 * por app (script inline do TanStack Start e de tema, Faro, Supabase, imagem
 * externa) e não entraram.
 *
 * CSRF das server functions: cada app SSR registra o `createCsrfMiddleware` do TanStack
 * Start em `src/start.ts` (auditoria de 2026-09-19). Sem ele, server fn aceita POST
 * `multipart/form-data`/sem `Content-Type` cross-site — sem preflight — com o cookie da
 * vítima. Apagar o arquivo não quebra build nem teste; por isso o gate.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

const REPO_ROOT = join(import.meta.dir, "..")

const SSR_APPS = ["sisub", "portal", "rumaer", "forms", "assignment-selection", "contrate", "sucont"] as const

const REQUIRED_HEADERS = [
	"strict-transport-security",
	"x-frame-options",
	"x-content-type-options",
	"referrer-policy",
	"permissions-policy",
	"content-security-policy",
] as const

/** Diretivas que a CSP da baseline tem de carregar — as que não quebram script, estilo nem imagem. */
const REQUIRED_CSP_DIRECTIVES = ["frame-ancestors 'self'", "base-uri 'self'", "object-src 'none'", "form-action 'self'"] as const

/**
 * Extrai o corpo `{...}` da route rule `/**` por casamento de chaves a partir da
 * chave literal `"/**"`. Text-based de propósito: importar o vite.config arrasta
 * todos os plugins e o ambiente de build. `null` se a regra não existir.
 */
function extractGlobRuleBody(source: string): string | null {
	const keyIdx = source.indexOf('"/**"')
	if (keyIdx === -1) return null
	const braceStart = source.indexOf("{", keyIdx)
	if (braceStart === -1) return null
	let depth = 0
	for (let i = braceStart; i < source.length; i++) {
		const ch = source[i]
		if (ch === "{") depth++
		else if (ch === "}") {
			depth--
			if (depth === 0) return source.slice(braceStart, i + 1)
		}
	}
	return null
}

const failures: string[] = []

for (const app of SSR_APPS) {
	const configPath = join(REPO_ROOT, "apps", app, "vite.config.ts")
	let source: string
	try {
		source = readFileSync(configPath, "utf8")
	} catch {
		failures.push(`${app}: vite.config.ts não encontrado (${configPath})`)
		continue
	}
	const body = extractGlobRuleBody(source)
	if (body === null) {
		failures.push(`${app}: sem route rule "/**" no vite.config.ts — a baseline de headers não é servida`)
		continue
	}
	const missing = REQUIRED_HEADERS.filter((h) => !body.includes(`"${h}"`))
	if (missing.length > 0) {
		failures.push(`${app}: headers de segurança ausentes na route rule "/**": ${missing.join(", ")}`)
	}
	const csp = /"content-security-policy":\s*"([^"]*)"/.exec(body)?.[1]
	if (csp !== undefined) {
		const missingDirectives = REQUIRED_CSP_DIRECTIVES.filter((d) => !csp.includes(d))
		if (missingDirectives.length > 0) {
			failures.push(`${app}: CSP da route rule "/**" sem as diretivas: ${missingDirectives.join("; ")}`)
		}
	}
}

for (const app of SSR_APPS) {
	let start: string
	try {
		start = readFileSync(join(REPO_ROOT, "apps", app, "src", "start.ts"), "utf8")
	} catch {
		failures.push(`${app}: sem src/start.ts — as server functions ficam sem o middleware de CSRF`)
		continue
	}
	if (!start.includes("createCsrfMiddleware(") || !/requestMiddleware:\s*\[[^\]]*csrfMiddleware/.test(start)) {
		failures.push(`${app}: src/start.ts não registra o createCsrfMiddleware em requestMiddleware`)
	}
}

// Site estático (docs): a distribuição tem de associar a response headers policy, e a
// policy tem de declarar cada header. Mesma lógica text-based: o gate não roda terraform.
const STATIC_SITE_CLOUDFRONT = join(REPO_ROOT, "infra", "modules", "static-site", "cloudfront.tf")
const STATIC_SITE_BLOCKS = [
	"response_headers_policy_id",
	"strict_transport_security",
	"content_type_options",
	"frame_options",
	"referrer_policy",
	"content_security_policy",
	"Permissions-Policy",
] as const
try {
	const tf = readFileSync(STATIC_SITE_CLOUDFRONT, "utf8")
	const missing = STATIC_SITE_BLOCKS.filter((b) => !tf.includes(b))
	if (missing.length > 0) {
		failures.push(`static-site (docs): cloudfront.tf sem ${missing.join(", ")} na response headers policy`)
	}
} catch {
	failures.push(`static-site (docs): ${STATIC_SITE_CLOUDFRONT} não encontrado`)
}

if (failures.length > 0) {
	console.error("✗ Baseline de headers de segurança violada:\n")
	for (const f of failures) console.error(`  - ${f}`)
	console.error('\nAdicione os headers na route rule `"/**": { headers: { ... } }` do Nitro.\n' + "Referência: qualquer um dos apps já conformes.")
	process.exit(1)
}

console.log(
	`✓ Baseline de headers de segurança presente na regra "/**" de ${SSR_APPS.length} apps SSR (${REQUIRED_HEADERS.length} headers cada), com CSRF das server functions, e na distribuição do site estático.`
)
