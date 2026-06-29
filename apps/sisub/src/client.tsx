// PRIMEIRO import — inicializa o Faro antes de tudo para capturar erros desde o boot.
import "@/lib/observability/faro.client"
import { StartClient } from "@tanstack/react-start/client"
import { StrictMode } from "react"
import { hydrateRoot } from "react-dom/client"
import { ClientErrorBoundary } from "@/components/layout/errors/ClientErrorBoundary"
import { installStaleChunkRecovery } from "@/lib/recover-stale-chunk"

// Recupera abas obsoletas pós-deploy (chunk de rota com hash que sumiu) antes da
// hidratação — caso contrário um import() 404 trava o usuário sem recuperação.
installStaleChunkRecovery()

hydrateRoot(
	document,
	<StrictMode>
		<ClientErrorBoundary>
			<StartClient />
		</ClientErrorBoundary>
	</StrictMode>
)
