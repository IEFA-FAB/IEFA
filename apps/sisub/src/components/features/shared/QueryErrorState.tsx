import { AlertCircle, Loader2, RefreshCcw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

/**
 * Falha ao buscar dados, dita como falha.
 *
 * As telas do fluxo de cardápio não liam `isError`: uma busca que falhava caía no estado vazio
 * e a tela afirmava "Nenhum cardápio criado ainda" — ou, na lixeira, "Nenhum template
 * removido", que é a pior mentira possível para quem acabou de perder trabalho.
 */
export function QueryErrorState({ message, onRetry, isRetrying }: { message: string; onRetry?: () => void; isRetrying?: boolean }) {
	return (
		<Alert role="alert">
			<AlertCircle className="size-4 text-destructive" />
			<AlertTitle>{message}</AlertTitle>
			<AlertDescription>
				<p>Foi uma falha ao buscar os dados, não uma lista vazia — nada foi apagado.</p>
				{onRetry && (
					<Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetry} disabled={isRetrying}>
						{isRetrying ? <Loader2 className="size-4 mr-2 animate-spin" /> : <RefreshCcw className="size-4 mr-2" />}
						Tentar novamente
					</Button>
				)}
			</AlertDescription>
		</Alert>
	)
}
