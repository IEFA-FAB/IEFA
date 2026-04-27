import { END, START, StateGraph } from "@langchain/langgraph"
import { checkpointer } from "../db/checkpointer.ts"
import { graderCondition, radaAgentCondition, routerCondition } from "./edges/conditions.ts"
import { generalChatNode } from "./nodes/general-chat.ts"
import { graderNode } from "./nodes/grader.ts"
import { noBasisNode } from "./nodes/no-basis.ts"
import { radaAgentNode } from "./nodes/rada-agent.ts"
import { routerNode } from "./nodes/router.ts"
import { synthesizerNode } from "./nodes/synthesizer.ts"
import { AgentStateAnnotation } from "./state.ts"

const workflow = new StateGraph(AgentStateAnnotation)
	.addNode("router", routerNode)
	.addNode("rada_agent", radaAgentNode)
	.addNode("grader", graderNode)
	.addNode("synthesizer", synthesizerNode)
	.addNode("no_basis", noBasisNode)
	.addNode("general_chat", generalChatNode)
	.addEdge(START, "router")
	.addConditionalEdges("router", routerCondition, {
		rada_agent: "rada_agent",
		general_chat: "general_chat",
	})
	.addConditionalEdges("rada_agent", radaAgentCondition, {
		grader: "grader",
		no_basis: "no_basis",
		rada_agent: "rada_agent",
	})
	.addConditionalEdges("grader", graderCondition, {
		synthesizer: "synthesizer",
		no_basis: "no_basis",
		rada_agent: "rada_agent",
	})
	.addEdge("synthesizer", END)
	.addEdge("no_basis", END)
	.addEdge("general_chat", END)

export const graph = workflow.compile({ checkpointer })

export const GRAPH_INVOKE_CONFIG = {
	recursionLimit: 10,
} as const
