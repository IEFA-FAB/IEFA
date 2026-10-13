import { createFileRoute } from "@tanstack/react-router"
import { TriangleAlert } from "lucide-react"
import { lazy, Suspense } from "react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { MilitaryRecordPanel } from "@/components/features/military-record/MilitaryRecordPanel"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useSaramLinkApi, useSaramStatus } from "@/hooks/business/useUserSaram"

/**
 * Pré-visualização dos estados (só em `vite dev`). Em produção a condição vira `false` e o
 * `import()` some do bundle — o build é conferido por `military-record-preview.contract.test.ts`.
 */
const SaramPreview = import.meta.env.DEV ? lazy(() => import("@/components/features/military-record/SaramPreview")) : null

export const Route = createFileRoute("/_protected/_modules/diner/military-record")({
	// `catch`: `?preview=1` chega como número; parâmetro estranho nunca derruba a tela.
	validateSearch: z.object({ preview: z.union([z.string(), z.number()]).transform(String).optional().catch(undefined) }),
	beforeLoad: (opts) => requirePermission(opts, "diner", 1),
	component: MilitaryRecordPage,
	head: () => ({
		meta: [{ name: "description", content: "Vínculo da sua conta com o cadastro militar (SARAM): estado, verificação e pedidos" }],
	}),
})

function MilitaryRecordPage() {
	const { preview } = Route.useSearch()
	const { data: status, isLoading, error, refetch } = useSaramStatus()
	const api = useSaramLinkApi()

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
			<PageHeader title="Meu cadastro militar" description="O vínculo da sua conta com o cadastro de pessoal da FAB (SARAM): quem você é para o sistema." />

			{SaramPreview && preview ? (
				<Suspense fallback={<Skeleton className="h-64 w-full" />}>
					<SaramPreview initial={preview} />
				</Suspense>
			) : isLoading ? (
				<Skeleton className="h-64 w-full" />
			) : error || !status ? (
				// Falha de leitura não é "sem vínculo": dizer isso mandaria a pessoa refazer o que já fez.
				<Alert variant="destructive">
					<TriangleAlert aria-hidden />
					<AlertTitle>Não foi possível ler o seu cadastro militar agora</AlertTitle>
					<AlertDescription>
						<p>Nada mudou na sua conta. Tente de novo em instantes.</p>
						<Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
							Tentar de novo
						</Button>
					</AlertDescription>
				</Alert>
			) : (
				<MilitaryRecordPanel status={status} api={api} />
			)}
		</div>
	)
}
