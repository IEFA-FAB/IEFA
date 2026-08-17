import { Glob } from "bun"

/**
 * Texto de TODAS as migrations de documento legal, concatenado.
 *
 * Os testes leem daqui, e não de um caminho fixo, porque versão nova de documento
 * é migration NOVA (a regra que `user_legal_acceptances` impõe pela FK). Um teste
 * apontado para um arquivo só passaria a validar um documento revogado no instante
 * em que a versão seguinte fosse publicada — e continuaria verde.
 */
export const LEGAL_MIGRATIONS_ROOT = new URL("../../../", import.meta.url).pathname

export async function readLegalSeedText(): Promise<string> {
	const parts: string[] = []
	for await (const file of new Glob("packages/database/supabase/migrations/*legal_documents*.sql").scan({
		cwd: LEGAL_MIGRATIONS_ROOT,
		absolute: true,
	})) {
		parts.push(await Bun.file(file).text())
	}
	if (parts.length === 0) throw new Error("legal-kit: nenhuma migration de documento legal encontrada")
	return parts.join("\n")
}

/** Só a migration vigente — a de maior nome, que é a de maior timestamp. */
export async function readCurrentLegalSeedText(): Promise<string> {
	const files: string[] = []
	for await (const file of new Glob("packages/database/supabase/migrations/*legal_documents*.sql").scan({
		cwd: LEGAL_MIGRATIONS_ROOT,
		absolute: true,
	})) {
		files.push(file)
	}
	const latest = files.sort().at(-1)
	if (!latest) throw new Error("legal-kit: nenhuma migration de documento legal encontrada")
	return Bun.file(latest).text()
}
