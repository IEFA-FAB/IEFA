import { StartClient } from "@tanstack/react-start/client"
import { hydrateRoot } from "react-dom/client"

// Sem prop: o `StartClient` cria o router sozinho, chamando o `getRouter()` de `router.tsx`
// na hidratação. Chamar `getRouter()` aqui também criava um segundo router, com outro
// QueryClient, que ninguém usava.
hydrateRoot(document, <StartClient />)
