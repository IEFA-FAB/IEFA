import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres"
import { env } from "../env.ts"

// Tabelas do checkpointer também no schema `alpha` — sem isso o LangGraph as
// criaria em `public`, que é compartilhado com os demais apps do projeto.
export const checkpointer = PostgresSaver.fromConnString(env.DATABASE_URL, { schema: "alpha" })

// Cria as tabelas oficiais do LangGraph se não existirem
await checkpointer.setup()
