import { AlertCircle, RefreshCw } from "lucide-react"
import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
	children: ReactNode
	fallback?: ReactNode
}

interface State {
	hasError: boolean
	error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
	public state: State = {
		hasError: false,
		error: null,
	}

	public static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error }
	}

	public componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {}

	public render() {
		if (this.state.hasError) {
			if (this.props.fallback) return this.props.fallback

			return (
				<div className="flex flex-col items-center justify-center p-8 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
					<AlertCircle className="w-12 h-12 text-red-500 mb-4" />
					<h2 className="text-xl font-bold text-red-700 dark:text-red-400 mb-2">Algo deu errado</h2>
					<p className="text-red-600 dark:text-red-300 text-center mb-6">Ocorreu um erro inesperado na interface. Tente recarregar a página.</p>
					<button
						type="button"
						onClick={() => window.location.reload()}
						className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-500 transition-colors"
					>
						<RefreshCw className="w-4 h-4" />
						Recarregar Página
					</button>
					{this.state.error && (
						<pre className="mt-6 p-4 bg-black/10 rounded text-xs text-red-800 dark:text-red-200 max-w-full overflow-auto">{this.state.error.toString()}</pre>
					)}
				</div>
			)
		}

		return this.props.children
	}
}
