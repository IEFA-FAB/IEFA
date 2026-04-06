import { StartClient } from "@tanstack/react-start/client"
import { StrictMode } from "react"
import { hydrateRoot } from "react-dom/client"
import { ClientErrorBoundary } from "@/components/layout/errors/ClientErrorBoundary"

hydrateRoot(
	document,
	<StrictMode>
		<ClientErrorBoundary>
			<StartClient />
		</ClientErrorBoundary>
	</StrictMode>
)
