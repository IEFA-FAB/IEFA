import { describe, expect, test } from "bun:test"
import { redactCloudIdentifiers } from "./redact.ts"

describe("redactCloudIdentifiers", () => {
	test("tira o ARN da role do erro do Bedrock e mantém o resto", () => {
		const message =
			"User: arn:aws:sts::123456789012:assumed-role/alpha-task/abc is not authorized to perform: bedrock:InvokeModel on resource: arn:aws:bedrock:us-east-1::foundation-model/x"
		const redacted = redactCloudIdentifiers(message)
		expect(redacted).not.toContain("123456789012")
		expect(redacted).not.toContain("alpha-task")
		expect(redacted).toContain("is not authorized to perform: bedrock:InvokeModel")
	})
})
