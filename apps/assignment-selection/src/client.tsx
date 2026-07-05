import { StartClient } from "@tanstack/react-start/client"
import { hydrateRoot } from "react-dom/client"
import { getRouter } from "./router"

const router = getRouter()

// biome-ignore lint/suspicious/noExplicitAny: fix temporário do mismatch de tipos StartClient x React 19
const StartClientAny = StartClient as any
hydrateRoot(document, <StartClientAny router={router} />)
