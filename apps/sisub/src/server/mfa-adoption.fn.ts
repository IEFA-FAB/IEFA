/**
 * @module mfa-adoption.fn
 * Painel de adoção do segundo fator: quem tem fator, quem tem reserva, quem não tem nenhum.
 *
 * É o pré-requisito operacional de ligar `ASSURANCE_ENFORCEMENT` (etapa 9 do plano). Virar a
 * chave sem esta leitura é adivinhar quem vai ser trancado do lado de fora — e o custo do erro
 * é uma seção inteira que para de liquidar numa terça de manhã, sem caminho de volta pela
 * própria tela.
 *
 * ## De onde saem os fatores, e por que é SQL cru
 *
 * `auth.mfa_factors` não está exposta ao PostgREST e não está no schema Drizzle do domínio; o
 * `auth.admin` do GoTrue lista fator de UM usuário por vez (`listFactors({ userId })`), o que
 * aqui seria uma requisição por conta. A leitura é direta pelo `SISUB_DATABASE_URL`, escopada
 * em `status = 'verified'` — mesmo caminho e mesma justificativa de `listActiveSessionsFn`
 * (`mfa.fn.ts`), que lê `auth.sessions`.
 *
 * ## Falha de leitura NUNCA vira zero
 *
 * Se a consulta a `auth.mfa_factors` falhar, a resposta é `{ available: false }` — sem
 * contagem nenhuma. Um painel que respondesse "0 contas com fator" quando na verdade não
 * conseguiu ler produziria a decisão exatamente oposta à correta: "ninguém cadastrou, adie" ou
 * "todo mundo cadastrou, ligue". Por isso a ausência é um tipo diferente, e não um número.
 *
 * AUTH: `admin` nível 3, no fn E na operation. O `beforeLoad` da rota não conta:
 * `/_serverFn/<id>` é chamável direto por HTTP, sem passar pelo router.
 *
 * @domain core
 * @migration n-a
 */

import { isProtectedAccount } from "@iefa/pbac"
import { listAccountPermissionSets } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { sql } from "drizzle-orm"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import { assuranceReachability } from "@/server/assurance-registry"

/** Uma conta protegida, com a contagem de fatores VERIFICADOS que ela tem hoje. */
export interface ProtectedAccountAdoption {
	userId: string
	email: string
	nrOrdem: string | null
	/** Só fatores verificados: cadastro abandonado não protege nada e não conta. */
	verifiedFactors: number
}

export interface MfaAdoptionTotals {
	/** Contas cujas permissões efetivas alcançam alguma operação classificada (design.md D9). */
	protectedTotal: number
	/** **O número que decide a virada da chave.** Zero é a condição para ligar o piso. */
	protectedWithoutFactor: number
	/** Conta protegida com UM fator: cumpre o piso, mas está a um aparelho perdido do impasse. */
	protectedWithoutBackup: number
	/** Conta protegida com fator reserva — o estado desejado (spec `mfa-enrollment`). */
	protectedWithBackup: number
	/** Demais contas (os ~800 comensais). Para elas o cadastro é voluntário. */
	otherTotal: number
	otherWithFactor: number
}

export type MfaAdoptionReport =
	| {
			available: true
			totals: MfaAdoptionTotals
			/** Só as contas PROTEGIDAS, sem fator primeiro — é a fila de trabalho do administrador. */
			protectedAccounts: ProtectedAccountAdoption[]
	  }
	| {
			available: false
			/** Frase em português que a tela mostra no lugar dos números. */
			reason: string
	  }

/**
 * Fatores VERIFICADOS por usuário, lidos de `auth.mfa_factors`.
 *
 * `null` (e não um mapa vazio) quando a leitura falha: o chamador precisa distinguir "ninguém
 * tem fator" de "não consegui saber", e um `Map` vazio não carrega essa diferença.
 */
async function fetchVerifiedFactorCounts(): Promise<Map<string, number> | null> {
	try {
		const rows = await getDb().execute<{ user_id: string; verified: string }>(sql`
			select f.user_id::text as user_id, count(*)::text as verified
			  from auth.mfa_factors f
			 where f.status = 'verified'
			 group by f.user_id
		`)
		return new Map([...rows].map((row) => [row.user_id, Number(row.verified)]))
	} catch {
		// Sem permissão de leitura no schema `auth`, ou o formato da tabela mudou.
		return null
	}
}

/**
 * Adoção do segundo fator, agregada por conta protegida.
 *
 * Leitura pura: nenhuma elevação é exigida para abri-la (design.md D3 — rota e leitura NUNCA
 * disparam pedido de segundo fator). Seria um contrassenso pedir o fator para consultar quem
 * ainda não o tem.
 */
export const getMfaAdoptionFn = createServerFn({ method: "GET" }).handler(async (): Promise<MfaAdoptionReport> => {
	const ctx = await requireAuthWithPermission("admin", 3)

	const [accounts, factorCounts] = await Promise.all([listAccountPermissionSets(getDb(), ctx).catch(handleDomainError), fetchVerifiedFactorCounts()])

	if (!factorCounts) {
		return {
			available: false,
			reason: "Não foi possível ler os fatores cadastrados (`auth.mfa_factors`). Os números não são exibidos para não afirmar zero sem saber.",
		}
	}

	const reachability = assuranceReachability()
	const totals: MfaAdoptionTotals = {
		protectedTotal: 0,
		protectedWithoutFactor: 0,
		protectedWithoutBackup: 0,
		protectedWithBackup: 0,
		otherTotal: 0,
		otherWithFactor: 0,
	}
	const protectedAccounts: ProtectedAccountAdoption[] = []

	for (const account of accounts) {
		const verifiedFactors = factorCounts.get(account.userId) ?? 0

		if (!isProtectedAccount(account.permissions, reachability)) {
			totals.otherTotal += 1
			if (verifiedFactors > 0) totals.otherWithFactor += 1
			continue
		}

		totals.protectedTotal += 1
		if (verifiedFactors === 0) totals.protectedWithoutFactor += 1
		else if (verifiedFactors === 1) totals.protectedWithoutBackup += 1
		else totals.protectedWithBackup += 1

		protectedAccounts.push({ userId: account.userId, email: account.email, nrOrdem: account.nrOrdem, verifiedFactors })
	}

	// Sem fator primeiro, depois sem reserva, e o e-mail desempata: a tela abre exatamente na
	// fila de quem precisa ser procurado, sem ninguém precisar ordenar coluna.
	protectedAccounts.sort((a, b) => a.verifiedFactors - b.verifiedFactors || a.email.localeCompare(b.email))

	return { available: true, totals, protectedAccounts }
})
