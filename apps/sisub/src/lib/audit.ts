/**
 * @module audit
 * Ponto ÚNICO de passagem da auditoria de operações sensíveis (design.md D15).
 *
 * ## Por que um envelope, e não 23 chamadas copiadas
 *
 * Cada server function classificada precisa gravar uma linha em
 * `access_control.sensitive_operation_log` DEPOIS de concluir. Escrito à mão em 23
 * lugares, o defeito não é hipotético: basta um `return` antecipado, um caminho de erro
 * que não passa pela última linha, ou uma fn nova copiada de uma antiga para que a
 * operação rode sem rastro — e a lacuna não avisa. Com o envelope, "gravou?" é uma
 * propriedade do helper, e é ele que os testes provam.
 *
 * ## O grau NUNCA é redigitado aqui
 *
 * `assuranceFor(operation)` lê o registro (`src/server/assurance-registry.ts`), que é a
 * fonte única. Aceitar o grau por parâmetro criaria uma segunda lista sobre o mesmo
 * assunto — e duas listas se contradizem em silêncio, que é exatamente o formato de
 * defeito que o registro existe para fechar.
 *
 * ## Ordem: consulta o registro ANTES, grava DEPOIS
 *
 * A consulta ao registro vem antes de `run()` para que um nome de operação inexistente
 * (um erro de digitação) falhe ANTES da mutação, e não depois dela — falhar depois
 * devolveria erro ao usuário com a escrita já aplicada. A GRAVAÇÃO vem depois, e só no
 * caminho de sucesso: operação rejeitada pelo gate de permissão ou de garantia não
 * chega aqui, porque `run()` lança. Um log que mistura tentativa com execução não
 * responde "o que foi feito".
 *
 * ## Falha de gravação PROPAGA
 *
 * `record` lança `DomainError("AUDIT_INSERT_FAILED")` e este helper não engole.
 * Operação sensível que conclui sem deixar rastro é pior que operação que falha: a
 * falha é visível, a lacuna não.
 *
 * Este arquivo é puro de propósito — nenhum import de `db.server`/`env.server`. O
 * gravador real entra por injeção (`record`), e é isso que deixa `audit.test.ts` provar
 * o comportamento sem banco. A ligação com o domínio mora em `audit.server.ts`.
 *
 * @domain app
 */

import { type AssuranceOperationName, assuranceFor } from "@/server/assurance-registry"

/**
 * Identificação do alvo da operação: ids e escopo, no formato de cada uma.
 * NUNCA o payload inteiro — o log não guarda dado que a operação já grava na tabela dela.
 */
export type AuditTarget = Record<string, unknown>

/** O que vai para o registro. O ator não aparece: ele sai da sessão, no gravador. */
export type AuditEntry = {
	operation: string
	assurance: "session" | "fresh"
	target?: AuditTarget
}

export type AuditRecorder = (entry: AuditEntry) => Promise<unknown>

export type WithAuditInput<T> = {
	/** Nome da server function, como consta no registro de classificação. */
	operation: AssuranceOperationName
	/** Quem grava a linha. Injetado para manter este módulo sem banco. */
	record: AuditRecorder
	/** A operação em si. O log só é gravado se ela resolver. */
	run: () => Promise<T>
	/**
	 * Extrator do alvo. Recebe o resultado porque parte da identificação só existe
	 * depois da execução (o id da linha criada, p. ex.).
	 */
	target?: (result: T) => AuditTarget | undefined
}

/**
 * Executa a operação e, em caso de sucesso, grava a linha de auditoria com o grau que o
 * registro de classificação declara.
 *
 * Operação classificada como `"none"` passa direto, sem gravar — é o caso de rotina, e
 * poluir o log com ele esvaziaria a única lista que um auditor precisa conseguir ler.
 *
 * @throws {Error} se `operation` não estiver no registro — nome errado gravaria o grau
 * de ninguém, ou pior, não gravaria nada e ninguém perceberia.
 */
export async function withAudit<T>({ operation, record, run, target }: WithAuditInput<T>): Promise<T> {
	const entry = assuranceFor(operation)
	if (!entry) {
		throw new Error(`Operação "${operation}" não está no registro de garantia (src/server/assurance-registry.ts) — classifique-a antes de auditá-la.`)
	}

	const result = await run()
	if (entry.require === "none") return result

	await record({ operation, assurance: entry.require, target: target?.(result) })
	return result
}
