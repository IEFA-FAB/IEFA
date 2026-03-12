import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres"
import { ENV } from "varlock/env"

export const checkpointer = PostgresSaver.fromConnString(ENV.DATABASE_URL)

// Cria as tabelas oficiais do LangGraph se não existirem
await checkpointer.setup()
