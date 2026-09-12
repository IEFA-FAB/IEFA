import { describe, expect, test } from "vitest"
import type { AssurancePrompt } from "@/lib/assurance/assurance-error"
import { ElevationController } from "@/lib/assurance/elevation-controller"

const prompt = (reason: string): AssurancePrompt => ({ nextStep: "step-up", reason, grade: "fresh", origin: "session" })

describe("ElevationController", () => {
	test("começa fechado", () => {
		expect(new ElevationController().getPrompt()).toBeNull()
	})

	test("abre o modal com o pedido e resolve `true` na verificação", async () => {
		const controller = new ElevationController()
		const pending = controller.request(prompt("Esta operação altera permissões de acesso."))

		expect(controller.getPrompt()?.reason).toBe("Esta operação altera permissões de acesso.")

		controller.settle(true)
		await expect(pending).resolves.toBe(true)
		expect(controller.getPrompt()).toBeNull()
	})

	test("cancelar resolve `false` — e é o chamador que decide o que fazer com isso", async () => {
		const controller = new ElevationController()
		const pending = controller.request(prompt("x"))
		controller.settle(false)
		await expect(pending).resolves.toBe(false)
	})

	test("o snapshot é estável enquanto o pedido está aberto (useSyncExternalStore re-renderiza em laço sem isso)", () => {
		const controller = new ElevationController()
		controller.request(prompt("x"))
		expect(controller.getPrompt()).toBe(controller.getPrompt())
	})

	test("duas mutações barradas compartilham UM modal e UMA verificação", async () => {
		const controller = new ElevationController()
		const first = controller.request(prompt("primeira"))
		const second = controller.request(prompt("segunda"))

		// O motivo continua sendo o do primeiro pedido: é o que o usuário tinha em mente.
		expect(controller.getPrompt()?.reason).toBe("primeira")

		controller.settle(true)
		await expect(Promise.all([first, second])).resolves.toEqual([true, true])
	})

	test("avisa os assinantes ao abrir e ao fechar", () => {
		const controller = new ElevationController()
		let notifications = 0
		const unsubscribe = controller.subscribe(() => {
			notifications++
		})

		controller.request(prompt("x"))
		controller.settle(true)
		expect(notifications).toBe(2)

		unsubscribe()
		controller.request(prompt("y"))
		expect(notifications).toBe(2)
	})

	test("fechar sem pedido em aberto não faz nada", () => {
		const controller = new ElevationController()
		let notifications = 0
		controller.subscribe(() => {
			notifications++
		})

		controller.settle(true)
		expect(notifications).toBe(0)
	})

	test("depois de fechado, um pedido novo abre o modal de novo", async () => {
		const controller = new ElevationController()
		controller.settle(true)

		const pending = controller.request(prompt("de novo"))
		expect(controller.getPrompt()?.reason).toBe("de novo")
		controller.settle(false)
		await expect(pending).resolves.toBe(false)
	})
})
