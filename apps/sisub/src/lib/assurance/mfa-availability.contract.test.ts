/**
 * Contrato do modo da verificação em duas etapas (`MFA_MODE`).
 *
 * Duas garantias, e as duas precisam de teste porque nenhuma aparece numa tela:
 *
 * 1. **Com a funcionalidade desligada (`off`), ela não existe de verdade.** Esconder a tela não
 *    basta — `/_serverFn/...` é chamável direto —, então toda server function de MFA passa por
 *    `assertMfaAvailable()`, inclusive as que forem criadas depois.
 * 2. **Fora de `enforced`, ninguém precisa de segundo fator.** O piso por operação, o prazo de
 *    cadastro, a tela de recadastro após código de recuperação e o diálogo de dispositivo
 *    reserva consultam `MFA_ENFORCEMENT_ALLOWED` antes da própria configuração.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { MFA_ENFORCEMENT_ALLOWED, MFA_MODE } from "@/lib/assurance/mfa-availability"
import { assuranceFor, enforcedAssuranceFor } from "@/server/assurance-registry"

const src = (path: string) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8")

const MFA_SERVER_FILES = ["server/mfa.fn.ts", "server/mfa-recovery.fn.ts", "server/mfa-admin.fn.ts", "server/mfa-adoption.fn.ts"]

describe("modo da verificação em duas etapas", () => {
	test("o segundo fator não é obrigatório para ninguém", () => {
		// Decisão do mantenedor (2026-09-13): cadastro voluntário possível, exigência nenhuma.
		// Passar para `enforced` é mudança de política — quem fizer isso edita este teste de
		// propósito, junto com a ordem de ativação de `ASSURANCE_ENFORCEMENT`.
		expect(MFA_MODE, "segundo fator só pode ser exigido por decisão explícita do mantenedor").not.toBe("enforced")
	})

	test("toda server function de MFA recusa quando a funcionalidade está desligada", () => {
		for (const file of MFA_SERVER_FILES) {
			const code = src(file)
			const fns = code.match(/createServerFn\(/g)?.length ?? 0
			const guarded = code.match(/assertMfaAvailable\(\)/g)?.length ?? 0
			expect(fns, `${file} não declara server function nenhuma`).toBeGreaterThan(0)
			expect(guarded, `${file}: ${fns} server fns, mas só ${guarded} chamam assertMfaAvailable()`).toBe(fns)
		}
	})

	test("as entradas da interface e o desvio do login respeitam a disponibilidade", () => {
		const gated = [
			"components/layout/sidebar/NavItems.tsx",
			"routes/_protected/_modules/diner/profile.tsx",
			"components/features/global/PermissionsManager.tsx",
			"routes/auth/index.tsx",
			"routes/_protected/_modules/diner/security.tsx",
			"routes/_protected/_modules/admin/mfa-adoption.tsx",
			"routes/auth/challenge.tsx",
			"routes/auth/recovery-code.tsx",
			"routes/auth/mfa-enrollment.tsx",
		]
		for (const file of gated) expect(src(file), `${file} não consulta MFA_AVAILABLE`).toContain("MFA_AVAILABLE")
	})

	test("toda exigência consulta o modo antes da própria configuração", () => {
		expect(src("server/assurance-registry.ts")).toMatch(/if \(!MFA_ENFORCEMENT_ALLOWED\) return NO_ASSURANCE/)
		expect(src("routes/_protected/route.tsx")).toMatch(/MFA_ENFORCEMENT_ALLOWED && <MfaMandateNotice \/>/)
		// Quem gastou um código de recuperação não pode ficar preso entre "cadastrar" e "sair".
		expect(src("routes/auth/mfa-enrollment.tsx")).toMatch(/!hasFactor && !MFA_ENFORCEMENT_ALLOWED &&/)
		// Quem aderiu com um aparelho só não pode ficar preso num diálogo de reserva sem saída —
		// nem na tela (sem "Agora não", sem fechar, surdo ao Esc) nem no aviso que o servidor dispara.
		expect(src("routes/_protected/_modules/diner/security.tsx")).toMatch(/mandatory=\{MFA_ENFORCEMENT_ALLOWED && overview\?\.isProtectedAccount === true\}/)
		expect(src("server/mfa.fn.ts")).toMatch(/needsBackupFactor: MFA_ENFORCEMENT_ALLOWED && /)
	})

	test("fora de enforced, nenhuma operação exige garantia de identidade", () => {
		if (MFA_ENFORCEMENT_ALLOWED) return
		for (const operation of ["createUserPermissionFn", "createEmpenhoFn", "createMcpKeyFn", "resetTrainingScopeFn", "resetUserMfaFn"]) {
			expect(assuranceFor(operation), `${operation} deveria estar no registro`).toBeDefined()
			expect(enforcedAssuranceFor(operation).require, `${operation} não pode exigir segundo fator`).toBe("none")
		}
	})
})
