import { zodToJsonSchema } from "zod-to-json-schema"

export type JsonSchemaObject = {
	type: "object"
	properties: Record<string, unknown>
	required?: string[]
}

// biome-ignore lint/suspicious/noExplicitAny: Zod 4 ZodTypeAny is not assignable to zod-to-json-schema ZodType<any>
export function toJsonSchema(schema: any): JsonSchemaObject {
	// biome-ignore lint/suspicious/noExplicitAny: Zod 4 compatibility
	return zodToJsonSchema(schema as any, { $refStrategy: "none" }) as JsonSchemaObject
}
