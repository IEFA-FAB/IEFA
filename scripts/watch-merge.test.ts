import { describe, expect, test } from "bun:test"
import { classifyDeployJobs, type Job } from "./watch-merge"

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
