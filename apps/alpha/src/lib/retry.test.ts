import { describe, expect, it } from "bun:test"
import { MAX_MODEL_RETRIES, stopUnlessTransient } from "./retry.ts"

describe("stopUnlessTransient", () => {
	it("interrompe a retentativa no erro que derrubou produção", () => {
		// Forma exata do que o CloudWatch registrou 57 vezes em 12 minutos: autorização
		// negada no modelo de embedding. Permanente — o próprio SDK marcou `$retryable`
		// como indefinido —, e mesmo assim virou 6 rodadas de backoff por chamada.
		const accessDenied = {
			name: "AccessDeniedException",
			message: "User: arn:aws:sts::103256050857:assumed-role/iefa-prod-ecs-task/… is not authorized to perform: bedrock:InvokeModel",
			$metadata: { httpStatusCode: 403 },
		}

		expect(() => stopUnlessTransient(accessDenied)).toThrow()
	})

	it("deixa retentar throttling, que é o caso para o qual a retentativa existe", () => {
		const throttling = { name: "ThrottlingException", message: "Too many requests", $metadata: { httpStatusCode: 429 } }

		expect(() => stopUnlessTransient(throttling)).not.toThrow()
	})

	it("deixa retentar queda de stream do modelo", () => {
		expect(() => stopUnlessTransient({ name: "ModelStreamErrorException", $metadata: { httpStatusCode: 424 } })).not.toThrow()
	})

	it("deixa retentar 5xx", () => {
		expect(() => stopUnlessTransient({ name: "InternalServerException", $metadata: { httpStatusCode: 500 } })).not.toThrow()
	})

	it("interrompe em erro de validação, que repetir só repete", () => {
		expect(() => stopUnlessTransient({ name: "ValidationException", $metadata: { httpStatusCode: 400 } })).toThrow()
	})

	it("interrompe no aborto MESMO com a palavra timeout na mensagem", () => {
		// O aborto precisa sair na frente da classificação: a mensagem varia entre runtimes
		// e algumas carregam "timeout", que seria lido como transitório — e aí o turno
		// cancelado gastaria exatamente o que o cancelamento foi economizar.
		const abort = { name: "AbortError", message: "The operation timed out and was aborted" }

		expect(() => stopUnlessTransient(abort)).toThrow()
	})

	it("cabe no orçamento de 60 s do turno", () => {
		// Seis retentativas com backoff exponencial gastam ~1 minuto sozinhas, ou seja, o
		// turno inteiro numa chamada só.
		expect(MAX_MODEL_RETRIES).toBeLessThanOrEqual(3)
	})
})
