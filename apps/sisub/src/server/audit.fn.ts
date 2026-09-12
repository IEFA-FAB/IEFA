/**
 * @module audit.fn
 * Leitura do registro de operações sensíveis (`access_control.sensitive_operation_log`).
 *
 * Só leitura: quem grava é o envelope `withSensitiveAudit` (`lib/audit.server.ts`), na
 * própria operação. Não existe — e não deve existir — server fn que altere ou remova
 * linha do log.
 * AUTH: `admin` nível 3, no fn E na operation. O `beforeLoad` da rota não conta:
 * `/_serverFn/<id>` é chamável direto por HTTP, sem passar pelo router.
 * @domain core
 * @migration 20260911120000_access_control_sensitive_operation_log
 */

import { ListSensitiveOperationsSchema, listSensitiveOperations, type SensitiveOperationLogEntry } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export type SensitiveOperationRow = SensitiveOperationLogEntry

/**
 * Registro paginado, mais recentes primeiro, com o total da consulta.
 *
 * `actorId` é o filtro "o que esta pessoa fez". Ele nomeia OUTRO usuário de propósito —
 * é a razão de ser da tela —, e por isso o guard aqui é de autorização (`admin` nível 3),
 * não de autenticação.
 */
export const listSensitiveOperationsFn = createServerFn({ method: "GET" })
	.validator(ListSensitiveOperationsSchema)
	.handler(async ({ data }): Promise<{ rows: SensitiveOperationRow[]; total: number }> => {
		const ctx = await requireAuthWithPermission("admin", 3)
		return listSensitiveOperations(getDb(), ctx, data).catch(handleDomainError)
	})
