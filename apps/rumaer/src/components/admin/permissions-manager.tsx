"use no memo"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Search, ShieldCheck, Trash2, UserPlus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
	fetchUserRumaerPermissionsFn,
	grantRumaerPermissionFn,
	type RumaerUserSearchResult,
	revokeRumaerPermissionFn,
	searchUsersByEmailFn,
} from "@/server/permissions.fn"

const LEVEL_LABELS: Record<number, string> = { 2: "Editor", 3: "Administrador" }

export function RumaerPermissionsManager() {
	const qc = useQueryClient()
	const [email, setEmail] = useState("")
	const [selected, setSelected] = useState<RumaerUserSearchResult | null>(null)
	const [level, setLevel] = useState<"2" | "3">("2")

	const term = email.trim()
	const search = useQuery({
		queryKey: ["rumaer", "userSearch", term],
		queryFn: () => searchUsersByEmailFn({ data: { email: term } }),
		enabled: term.length >= 2,
		staleTime: 30_000,
	})

	const grants = useQuery({
		queryKey: ["rumaer", "userPermissions", selected?.id],
		queryFn: () => {
			if (!selected) return []
			return fetchUserRumaerPermissionsFn({ data: { userId: selected.id } })
		},
		enabled: !!selected,
	})

	const invalidateGrants = () => {
		if (selected) qc.invalidateQueries({ queryKey: ["rumaer", "userPermissions", selected.id] })
	}

	const grant = useMutation({
		mutationFn: () => {
			if (!selected) throw new Error("Nenhum usuário selecionado")
			return grantRumaerPermissionFn({ data: { userId: selected.id, level: Number(level) as 2 | 3 } })
		},
		onSuccess: () => {
			toast.success("Acesso concedido")
			invalidateGrants()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao conceder"),
	})

	const revoke = useMutation({
		mutationFn: (permissionId: string) => revokeRumaerPermissionFn({ data: { permissionId } }),
		onSuccess: () => {
			toast.success("Acesso revogado")
			invalidateGrants()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao revogar"),
	})

	const current = grants.data?.[0] ?? null

	return (
		<div className="flex flex-col gap-8">
			<header>
				<h1 className="font-serif text-3xl font-bold tracking-tight">Permissões</h1>
				<p className="text-sm text-muted-foreground">
					Conceda acesso de <strong>edição</strong> (Editor) e <strong>administração</strong> (Administrador) do regulamento de uniformes. Somente
					administradores gerenciam esta tela.
				</p>
			</header>

			<section className="flex flex-col gap-3 border border-border rounded-lg p-4">
				<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Buscar usuário</h2>
				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
					<Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Buscar por email…" className="pl-9" />
				</div>

				{term.length >= 2 && (
					<ul className="flex flex-col divide-y divide-border border border-border rounded-md overflow-hidden">
						{search.isLoading && <li className="px-4 py-3 text-sm text-muted-foreground">Buscando…</li>}
						{search.data?.length === 0 && !search.isLoading && <li className="px-4 py-3 text-sm text-muted-foreground">Nenhum usuário encontrado.</li>}
						{search.data?.map((u) => (
							<li key={u.id}>
								<button
									type="button"
									onClick={() => setSelected(u)}
									className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted ${
										selected?.id === u.id ? "bg-muted" : ""
									}`}
								>
									<span className="text-sm font-medium">{u.email}</span>
									{u.nrOrdem && <span className="text-xs text-muted-foreground">Nr. Ordem {u.nrOrdem}</span>}
								</button>
							</li>
						))}
					</ul>
				)}
			</section>

			{selected && (
				<section className="flex flex-col gap-4 border border-border rounded-lg p-4">
					<div className="flex items-center justify-between gap-3">
						<div>
							<p className="text-sm font-semibold">{selected.email}</p>
							<p className="text-xs text-muted-foreground">
								Acesso atual:{" "}
								{grants.isLoading ? (
									"carregando…"
								) : current ? (
									<Badge variant="outline">{LEVEL_LABELS[current.level] ?? `Nível ${current.level}`}</Badge>
								) : (
									<span className="text-muted-foreground">nenhum</span>
								)}
							</p>
						</div>
						{current && (
							<Button variant="ghost" size="sm" onClick={() => revoke.mutate(current.id)} disabled={revoke.isPending} title="Revogar acesso">
								<Trash2 className="size-4" />
								Revogar
							</Button>
						)}
					</div>

					<div className="flex flex-col sm:flex-row gap-3 sm:items-end">
						<div className="flex flex-col gap-1.5 min-w-48">
							<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nível de acesso</span>
							<Select value={level} onValueChange={(v) => setLevel(v as "2" | "3")}>
								<SelectTrigger>
									<SelectValue>{LEVEL_LABELS[Number(level)]}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="2">Editor — edita uniformes</SelectItem>
									<SelectItem value="3">Administrador — edita e gerencia acessos</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<Button onClick={() => grant.mutate()} disabled={grant.isPending}>
							{current ? <ShieldCheck className="size-4" /> : <UserPlus className="size-4" />}
							{current ? "Atualizar acesso" : "Conceder acesso"}
						</Button>
					</div>
				</section>
			)}
		</div>
	)
}
