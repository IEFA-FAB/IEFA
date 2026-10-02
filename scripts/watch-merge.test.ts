import { describe, expect, test } from "bun:test"
import { classifyDeployJobs, classifyIntegrationJobs, type Job, parseArgs, resolveCancelled } from "./watch-merge"

const job = (name: string, conclusion: string | null, status = "completed"): Job => ({ name, conclusion, status })

describe("classifyDeployJobs", () => {
	test("deploy verde: chegou", () => {
		const states = classifyDeployJobs([job("check-sisub", "success"), job("build-sisub / build", "success"), job("deploy-sisub / deploy", "success")])
		expect(states.get("sisub")).toBe("deployed")
	})

	test("tudo skipped: o app não mudou", () => {
		expect(classifyDeployJobs([job("check-api", "skipped"), job("build-api", "skipped"), job("deploy-api", "skipped")]).get("api")).toBe("unchanged")
	})

	test("check vermelho deixa o deploy skipped: é falha, não 'nada a fazer'", () => {
		const states = classifyDeployJobs([job("check-portal", "failure"), job("build-portal / build", "skipped"), job("deploy-portal / deploy", "skipped")])
		expect(states.get("portal")).toBe("failed")
	})

	test("build verde e deploy skipped: bloqueado", () => {
		const states = classifyDeployJobs([job("check-forms", "success"), job("build-forms / build", "success"), job("deploy-forms / deploy", "skipped")])
		expect(states.get("forms")).toBe("blocked")
	})

	test("só check (pacotes): vale o check", () => {
		expect(classifyDeployJobs([job("check-packages", "success")]).get("packages")).toBe("checked")
		expect(classifyDeployJobs([job("check-packages", "failure")]).get("packages")).toBe("failed")
	})

	test("job ainda rodando", () => {
		expect(classifyDeployJobs([job("check-5s", "success"), job("build-5s / build", null, "in_progress")]).get("5s")).toBe("running")
	})

	test("nome de app com hífen e job fora do padrão", () => {
		const states = classifyDeployJobs([job("deploy-assignment-selection / deploy", "success"), job("changes", "success"), job("warm-deps", "success")])
		expect([...states.keys()]).toEqual(["assignment-selection"])
	})
})

describe("classifyDeployJobs — fila do deploy", () => {
	test("deploy cancelado: quem decide é o deploy posterior", () => {
		const states = classifyDeployJobs([job("check-sisub", "success"), job("build-sisub / build", "success"), job("deploy-sisub / deploy", "cancelled")])
		expect(states.get("sisub")).toBe("cancelled")
	})
})

describe("classifyIntegrationJobs", () => {
	const changes = job("changes", "success")
	test("full verde: passou", () => {
		expect(classifyIntegrationJobs([changes, job("gate (transacionais + ciclo e2e)", "success"), job("full suite (monitor)", "success")])).toBe("passed")
	})

	test("full vermelho com run 'success' (continue-on-error): falhou", () => {
		expect(classifyIntegrationJobs([changes, job("gate (transacionais + ciclo e2e)", "success"), job("full suite (monitor)", "failure")])).toBe("failed")
	})

	test("gate cancelado: depende do run posterior", () => {
		expect(classifyIntegrationJobs([changes, job("gate (transacionais + ciclo e2e)", "cancelled"), job("full suite (monitor)", "skipped")])).toBe("cancelled")
	})

	test("commit que não toca o sisub: não se aplica", () => {
		expect(classifyIntegrationJobs([changes, job("gate (transacionais + ciclo e2e)", "skipped"), job("full suite (monitor)", "skipped")])).toBe(
			"not-applicable"
		)
	})

	test("gate verde e full pulado não conta como coberto", () => {
		expect(classifyIntegrationJobs([changes, job("gate (transacionais + ciclo e2e)", "success"), job("full suite (monitor)", "skipped")])).toBe("failed")
	})
})

describe("parseArgs", () => {
	test("número, --wait e --timeout em qualquer ordem", () => {
		expect(parseArgs(["--wait", "557", "--timeout", "30"])).toEqual({ pr: "557", wait: true, timeoutMin: 30 })
		expect(parseArgs(["557"])).toEqual({ pr: "557", wait: false, timeoutMin: 120 })
	})
})

describe("resolveCancelled", () => {
	test("o primeiro posterior que terminou a etapa decide, verde ou vermelho", () => {
		expect(resolveCancelled(["absent", "passed"])).toBe("passed")
		expect(resolveCancelled(["cancelled", "failed", "passed"])).toBe("failed")
	})

	test("posterior ainda rodando: pendente", () => {
		expect(resolveCancelled(["absent", "running"])).toBe("running")
	})

	test("nenhum posterior rodou a etapa: não foi fila (timeout ou à mão)", () => {
		expect(resolveCancelled([])).toBe("failed")
		expect(resolveCancelled(["absent", "absent"])).toBe("failed")
	})
})
