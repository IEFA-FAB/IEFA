import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres"
import { env } from "../env.ts"

export const checkpointer = PostgresSaver.fromConnString(env.DATABASE_URL)

// Cria as tabelas oficiais do LangGraph se não existirem
await checkpointer.setup()
