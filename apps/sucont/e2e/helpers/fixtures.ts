/**
 * Fixtures das planilhas do DGC para o E2E, com marcador e token de execução.
 *
 * O E2E do SAC-DGC ESCREVE no banco — e o banco é o de produção, o mesmo do sisub.
 * Então cada rodada precisa carregar consigo a prova de que é lixo de teste, na
 * mesma convenção do sisub (`src/test/operations-fixtures.ts`):
 *
 *   `[TEST]` prova a INTENÇÃO — alguém marcou como teste.
 *   O token prova a ORIGEM — `<base36><hex8>-<seq>` não é digitável por acidente.
 *
 * Só o marcador não basta: uma rodada real que alguém batizasse de "[TEST]" seria
 * apagada pela faxina junto. Por isso o token entra no NOME DO ARQUIVO, que o app
 * grava em `sucont.analysis_run.filename` sem nenhum código de produção precisar
 * saber que existe teste.
 */

import { copyFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"

export const E2E_MARKER = "[TEST]"

const SOURCE_DIR = resolve(import.meta.dirname, "../fixtures")
const OUTPUT_DIR = resolve(import.meta.dirname, "../../test-results/dgc-fixtures")

const PANEL_FILES = [
	"PAINEL 1 - DGC Sistemas - ANALISE.csv",
	"PAINEL 2 - Estatistico Pessoal - ANALISE.csv",
	"PAINEL 3 - BENS E SERVICOS POR NDD - ANALISE.csv",
	"PAINEL 4 - Para regularidade - ANALISE.csv",
]

let seq = 0
// Entropia por processo: dois workers carregam o módulo no mesmo milissegundo e só
// `Date.now()` colidiria, misturando o lixo de duas execuções.
const RUN = `${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}`

/** Token único e estável por execução. Mesmo formato do `uid()` do sisub. */
export function uid(prefix = ""): string {
	seq += 1
	return `${prefix}${RUN}-${seq}`
}

export interface PanelFixtures {
	/** Caminhos dos arquivos marcados, na ordem dos painéis 1 a 4. */
	files: string[]
	/** Token desta execução — é por ele que a faxina encontra e apaga o que foi gravado. */
	token: string
}

/**
 * Copia as planilhas para nomes marcados. Cópia BYTE A BYTE de propósito: as
 * fixtures são windows-1252 e reescrevê-las como texto destruiria justamente o que
 * o teste existe para exercitar.
 */
export function makePanelFixtures(): PanelFixtures {
	const token = uid()
	const dir = resolve(OUTPUT_DIR, token)
	mkdirSync(dir, { recursive: true })

	const files = PANEL_FILES.map((name) => {
		// O marcador vem antes do nome; "PAINEL N" continua no meio, então a dedução
		// do painel pelo nome do arquivo segue funcionando.
		const target = resolve(dir, `${E2E_MARKER}-${token} ${name}`)
		copyFileSync(resolve(SOURCE_DIR, name), target)
		return target
	})

	return { files, token }
}
