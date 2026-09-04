/**
 * Reparo pontual da migração de tipografia.
 *
 * A primeira versão de `levelFor` promovia `text-xs` + peso ≥600 a `.text-label`
 * mesmo sem `uppercase` no original. Mas `.text-label` EMBUTE caixa alta e
 * letter-spacing: onde o texto era misto, ele passou a ser reescrito na tela —
 * "12 UGs" virou "12 UGS", "Filtro por Tipo:" virou "FILTRO POR TIPO:".
 *
 * Este script confronta cada arquivo com a versão do commit informado e devolve
 * a `.text-caption` os `.text-label` que nasceram sem `uppercase` no original.
 * O pareamento é por ESTRUTURA da linha (o conteúdo fora das classes), não por
 * número de linha: entre a migração e agora houve edição manual.
 *
 *   node scripts/repair-label-promotion.mjs <ref-git> <arquivos...>
 */
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"

const [ref, ...files] = process.argv.slice(2)

/** Assinatura da linha: tudo menos o conteúdo das strings de classe. */
function signature(line) {
	return line
		.replace(/(["'`])(?:[^"'`\\]|\\.)*\1/g, "§")
		.replace(/\s+/g, " ")
		.trim()
}

/** O original desta linha tinha caixa alta explícita? */
function hadUppercase(line) {
	return /\buppercase\b/.test(line)
}

let repaired = 0

for (const file of files) {
	const rel = file.replace(/^apps\/sucont\//, "")
	let before
	try {
		before = execFileSync("git", ["show", `${ref}:apps/sucont/${rel}`], { encoding: "utf8" })
	} catch {
		continue // arquivo novo: não veio da migração
	}

	// Assinatura → linhas originais. Assinatura ambígua (mais de uma linha) é
	// descartada: sem pareamento único, o reparo seria adivinhação.
	const bySignature = new Map()
	for (const line of before.split("\n")) {
		if (!/text-(?:xs|\[1[01]px\])/.test(line)) continue
		const sig = signature(line)
		if (bySignature.has(sig)) bySignature.set(sig, null)
		else bySignature.set(sig, line)
	}

	let content
	try {
		content = readFileSync(file, "utf8")
	} catch {
		continue // arquivo removido pela padronização
	}
	const after = content.split("\n")
	let changed = false

	const out = after.map((line) => {
		if (!line.includes("text-label")) return line
		const original = bySignature.get(signature(line))
		if (!original || hadUppercase(original)) return line
		changed = true
		repaired += 1
		return line.replace(/\btext-label\b/g, "text-caption")
	})

	if (changed) {
		writeFileSync(file, out.join("\n"))
		console.log(`${file}`)
	}
}

console.log(`\n${repaired} promoções indevidas a .text-label desfeitas`)
