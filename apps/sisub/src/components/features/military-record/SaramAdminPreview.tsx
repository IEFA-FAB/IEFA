/**
 * Pré-visualização SÓ DE DESENVOLVIMENTO do console "Cadastro militar" (`?preview=1`).
 *
 * As filas reais têm e-mail e SARAM de pessoas de verdade — não servem para captura de tela num
 * repositório público. Aqui o console recebe uma fila inventada e uma API falsa (nada vai ao
 * servidor nem ao registro de operações sensíveis). "Conflito" simula a recusa de versão: a
 * primeira aprovação do pedido de `fulano` falha como se outra pessoa tivesse decidido antes.
 *
 * Só é importado atrás de `import.meta.env.DEV` (rota `admin/military-records`).
 */

import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import type { SaramReviewQueue, SaramSearchAccount } from "@/server/saram-admin.fn"
import { type SaramAdminApi, SaramReviewConsole } from "./SaramReviewConsole"

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

const INITIAL: SaramReviewQueue = {
	requests: [
		{
			id: "req-1",
			kind: "link",
			saram: "0000101",
			justification: "Sou o 3S Fictício, do 1º GAP. Mudei o nome de guerra e o e-mail ficou com o antigo.",
			claimVerifiedBy: null,
			createdAt: day(1),
			updatedAt: day(1),
			requester: { userId: "u-1", email: "fulano@example.invalid", accountKind: "pessoal", saram: null, verifiedBy: null },
			holders: [],
			identity: { posto: "3S", nomeGuerra: "FICTICIO", sgOrg: "1º GAP" },
		},
		{
			id: "req-2",
			kind: "link",
			saram: "0000102",
			justification: "Entrei este mês e ainda não estou na carga do cadastro.",
			claimVerifiedBy: null,
			createdAt: day(3),
			updatedAt: day(3),
			requester: { userId: "u-2", email: "beltrano@example.invalid", accountKind: "pessoal", saram: null, verifiedBy: null },
			holders: [],
			identity: null,
		},
		{
			id: "req-3",
			kind: "dispute",
			saram: "0000103",
			justification: "Este SARAM é meu; a outra conta foi criada por engano na seção.",
			claimVerifiedBy: "cpf",
			createdAt: day(0),
			updatedAt: day(0),
			requester: { userId: "u-3", email: "ciclano@example.invalid", accountKind: "pessoal", saram: null, verifiedBy: null },
			holders: [{ userId: "u-4", email: "secao.exemplo@example.invalid", verifiedBy: "email" }],
			identity: { posto: "1T", nomeGuerra: "MODELO", sgOrg: "IEFA" },
		},
	],
	legacy: [
		{
			userId: "u-5",
			email: "antigo@example.invalid",
			saram: "0000104",
			createdAt: day(400),
			verifiedElsewhere: false,
			sharedWith: 0,
			identity: { posto: "SO", nomeGuerra: "EXEMPLO", sgOrg: "GAP-SJ" },
		},
		{
			userId: "u-6",
			email: "duplicado@example.invalid",
			saram: "0000105",
			createdAt: day(300),
			verifiedElsewhere: true,
			sharedWith: 1,
			identity: { posto: "2S", nomeGuerra: "AMOSTRA", sgOrg: "DIRAD" },
		},
	],
	unverified: [],
	institutionalCandidates: [
		{ userId: "u-7", email: "cozinha.exemplo@example.invalid", createdAt: day(90) },
		{ userId: "u-8", email: "subsistencia.exemplo@example.invalid", createdAt: day(60) },
		{ userId: "u-9", email: "protocolo.exemplo@example.invalid", createdAt: day(10) },
	],
	institutional: [{ userId: "u-10", email: "secao.modelo@example.invalid" }],
}

const SEARCH: SaramSearchAccount[] = [
	{
		userId: "u-11",
		email: "teste.busca@example.invalid",
		accountKind: "pessoal",
		saram: null,
		verifiedBy: null,
		verifiedElsewhere: false,
		hasPendingRequest: false,
		identity: null,
	},
	{
		userId: "u-12",
		email: "verificado.busca@example.invalid",
		accountKind: "pessoal",
		saram: "0000106",
		verifiedBy: "email",
		verifiedElsewhere: false,
		hasPendingRequest: false,
		identity: { posto: "CB", nomeGuerra: "BUSCA", sgOrg: "1º GAP" },
	},
]

const pause = () => new Promise((resolve) => setTimeout(resolve, 400))

export default function SaramAdminPreview() {
	const queryClient = useQueryClient()
	const [queue, setQueue] = useState(INITIAL)
	const [conflictUsed, setConflictUsed] = useState(false)
	const ok = { outcome: "changed", logId: "preview" }

	const api: SaramAdminApi = {
		async decide({ requestId }) {
			await pause()
			if (requestId === "req-1" && !conflictUsed) {
				setConflictUsed(true)
				setQueue((q) => ({ ...q, requests: q.requests.filter((r) => r.id !== requestId) }))
				throw new Error("Este pedido já foi decidido ou retirado. Atualize a fila.")
			}
			setQueue((q) => ({ ...q, requests: q.requests.filter((r) => r.id !== requestId) }))
			return ok
		},
		async link({ userId }) {
			await pause()
			setQueue((q) => ({ ...q, legacy: q.legacy.filter((l) => l.userId !== userId) }))
			return ok
		},
		async unlink({ userId }) {
			await pause()
			setQueue((q) => ({ ...q, legacy: q.legacy.filter((l) => l.userId !== userId) }))
			return ok
		},
		async setKind({ userId, kind }) {
			await pause()
			setQueue((q) => {
				const moved = [...q.institutionalCandidates, ...q.institutional.map((i) => ({ ...i, createdAt: day(1) }))].find((c) => c.userId === userId)
				return kind === "institucional"
					? {
							...q,
							institutionalCandidates: q.institutionalCandidates.filter((c) => c.userId !== userId),
							institutional: moved ? [...q.institutional, { userId, email: moved.email }] : q.institutional,
						}
					: { ...q, institutional: q.institutional.filter((c) => c.userId !== userId) }
			})
			return ok
		},
		async search(query) {
			await pause()
			return SEARCH.filter((a) => a.email.includes(query.toLowerCase()) || a.saram === query)
		},
		async refresh() {
			await queryClient.invalidateQueries({ queryKey: ["admin", "saram", "search"] })
		},
	}

	return (
		<div className="flex flex-col gap-4">
			<Badge variant="warning">Pré-visualização: dados inventados</Badge>
			<SaramReviewConsole queue={queue} isLoading={false} error={null} api={api} />
		</div>
	)
}
