/**
 * @module expense-execution.fn
 * Pendências da execução da despesa (change `sisub-flexible-expense-execution`, D9): o fluxo
 * "Executar despesa" da Gestão Unidade e as pendências do recebimento no Estoque. Só leitura:
 * o status sai dos dados a cada chamada.
 * @domain core
 */

import { fetchExpenseExecutionStatus, fetchReceivingPendingStatus } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuthThenRun } from "@/lib/domain-handler.server"
import { z } from "zod"

export const fetchExpenseExecutionStatusFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive() }))
	.handler(requireAuthThenRun(fetchExpenseExecutionStatus))

export const fetchReceivingPendingStatusFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(requireAuthThenRun(fetchReceivingPendingStatus))
