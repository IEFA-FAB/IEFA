import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
	children: ReactNode
}

interface State {
	error: Error | null
}

/**
 * Outer-most error boundary wrapping the entire app in client.tsx.
 * Intentionally uses no router/query/UI-library context — those may not
 * be available when a catastrophic hydration failure occurs.
 */
export class ClientErrorBoundary extends Component<Props, State> {
	state: State = { error: null }

	static getDerivedStateFromError(error: Error): State {
		return { error }
	}

	componentDidCatch(_error: Error, _info: ErrorInfo) {}

	handleReload = () => {
		window.location.reload()
	}

	render() {
		if (!this.state.error) return this.props.children

		return (
			<div
				style={{
					minHeight: "100dvh",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					fontFamily: "system-ui, sans-serif",
					padding: "1rem",
					background: "#0a0a0a",
					color: "#fafafa",
				}}
			>
				<div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
					<p style={{ fontSize: "2.5rem", margin: "0 0 0.5rem" }}>⚠️</p>
					<h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 0.5rem" }}>Falha ao inicializar o aplicativo</h1>
					<p style={{ fontSize: "0.875rem", color: "#a1a1aa", margin: "0 0 1.5rem" }}>Ocorreu um erro crítico ao carregar a página. Tente recarregar.</p>
					<pre
						style={{
							fontSize: "0.75rem",
							background: "#18181b",
							border: "1px solid #27272a",
							borderRadius: 6,
							padding: "0.75rem 1rem",
							textAlign: "left",
							overflowX: "auto",
							color: "#f87171",
							marginBottom: "1.5rem",
						}}
					>
						{this.state.error.message}
					</pre>
					<button
						type="button"
						onClick={this.handleReload}
						style={{
							padding: "0.5rem 1.25rem",
							borderRadius: 6,
							border: "none",
							background: "#fafafa",
							color: "#0a0a0a",
							fontWeight: 600,
							cursor: "pointer",
							fontSize: "0.875rem",
						}}
					>
						Recarregar página
					</button>
				</div>
			</div>
		)
	}
}
