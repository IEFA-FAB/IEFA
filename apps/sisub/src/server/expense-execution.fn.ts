/**
 * @module expense-execution.fn
 * Pendências da execução da despesa (change `sisub-flexible-expense-execution`, D9): o fluxo
 * "Executar despesa" da Gestão Unidade e as pendências do recebimento no Estoque. Só leitura:
 * o status sai dos dados a cada chamada.
 * @domain core
 */

import { type ExpenseExecutionStatus, fetchExpenseExecutionStatus, fetchReceivingPendingStatus, type ReceivingPendingStatus } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export const fetchExpenseExecutionStatusFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive() }))
	.handler(async ({ data }): Promise<ExpenseExecutionStatus> => {
		const ctx = await requireAuth()
		return fetchExpenseExecutionStatus(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchReceivingPendingStatusFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }): Promise<ReceivingPendingStatus> => {
		const ctx = await requireAuth()
		return fetchReceivingPendingStatus(getDb(), ctx, data).catch(handleDomainError)
	})
