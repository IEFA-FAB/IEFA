import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres"

const databaseUrl = process.env.DATABASE_URL!

if (!databaseUrl) {
	throw new Error("DATABASE_URL is required")
}

export const checkpointer = PostgresSaver.fromConnString(databaseUrl)

// Cria as tabelas oficiais do LangGraph se não existirem
await checkpointer.setup()
