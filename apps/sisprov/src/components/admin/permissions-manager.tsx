"use no memo"

import {
	SISPROV_ADMIN_MODULE,
	SISPROV_MODULE_LABELS,
	SISPROV_MODULE_LEVELS,
	SISPROV_MODULES,
	type SisprovModule,
	sisprovLevelLabel,
} from "@iefa/sisprov-domain/modules"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Search, ShieldCheck, Trash2, UserPlus } from "lucide-react"
import { useState } from "react"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import {
	fetchUserSisprovPermissionsFn,
	grantSisprovPermissionFn,
	listGrantableUnitsFn,
	revokeSisprovPermissionFn,
	type SisprovUserSearchResult,
	searchUsersByEmailFn,
} from "@/server/permissions.fn"

const GLOBAL_SCOPE = "global"

/**
 * Concessão e revogação dos acessos `sisprov-*`. Só módulos deste app; par (módulo, nível)
 * validado no servidor pelo mesmo schema que tipa o seletor aqui, para uma combinação que o
 * servidor recusa não chegar a existir no menu.
 */
export function SisprovPermissionsManager() {
	const qc = useQueryClient()
	const [email, setEmail] = useState("")
	const [selected, setSelected] = useState<SisprovUserSearchResult | null>(null)
	const [module, setModule] = useState<SisprovModule>("sisprov-supply")
	const [level, setLevel] = useState<number>(1)
	const [scope, setScope] = useState<string>(GLOBAL_SCOPE)

	const term = email.trim()
	const search = useQuery({
		queryKey: ["sisprov", "userSearch", term],
		queryFn: () => searchUsersByEmailFn({ data: { email: term } }),
		enabled: term.length >= 2,
		staleTime: 30_000,
	})

	const units = useQuery({ queryKey: ["sisprov", "grantableUnits"], queryFn: () => listGrantableUnitsFn(), staleTime: 5 * 60_000 })

	const grants = useQuery({
		queryKey: ["sisprov", "userPermissions", selected?.id],
		queryFn: () => (selected ? fetchUserSisprovPermissionsFn({ data: { userId: selected.id } }) : Promise.resolve([])),
		enabled: !!selected,
	})

	const invalidateGrants = () => {
		if (selected) qc.invalidateQueries({ queryKey: ["sisprov", "userPermissions", selected.id] })
	}

	const grant = useMutation({
		mutationFn: () => {
			if (!selected) throw new Error("Nenhum usuário selecionado")
			const unitId = scope === GLOBAL_SCOPE ? null : Number(scope)
			// O par é validado de novo no servidor; aqui o cast só segue o seletor restrito.
			return grantSisprovPermissionFn({ data: { userId: selected.id, module, level, unitId } as Parameters<typeof grantSisprovPermissionFn>[0]["data"] })
		},
		onSuccess: () => {
			toast.success("Acesso concedido")
			invalidateGrants()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao conceder"),
	})

	const revoke = useMutation({
		mutationFn: (permissionId: string) => revokeSisprovPermissionFn({ data: { permissionId } }),
		onSuccess: () => {
			toast.success("Acesso revogado")
			invalidateGrants()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao revogar"),
	})

	const levelsFor = SISPROV_MODULE_LEVELS[module]
	const effectiveLevel = levelsFor.includes(level) ? level : (levelsFor[0] as number)
	const unitName = (unitId: number | null) => (unitId === null ? "Toda a rede" : (units.data?.units.find((u) => u.id === unitId)?.code ?? `OM ${unitId}`))
	const scopeDisabled = module === SISPROV_ADMIN_MODULE && units.data?.coverage !== "all"

	return (
		<div className="space-y-6">
			<PageHeader
				title="Permissões"
				description="Conceda e revogue os papéis do SISPROV: Planejamento (elo na OM), Almoxarifado (OM) e Administração (SDAB). Grant e registro de auditoria entram na mesma transação."
			/>

			<Card>
				<CardHeader>
					<CardTitle>Buscar usuário</CardTitle>
					<CardDescription>Pelo e-mail institucional. A conta precisa existir no ERP.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<InputGroup>
						<InputGroupAddon>
							<Search className="size-4 text-muted-foreground" aria-hidden="true" />
						</InputGroupAddon>
						<InputGroupInput value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Buscar por e-mail…" aria-label="Buscar usuário por e-mail" />
					</InputGroup>

					{term.length >= 2 &&
						(search.isLoading ? (
							<Skeleton className="h-10" />
						) : search.isError ? (
							<Alert variant="destructive">
								<AlertTitle>A busca falhou</AlertTitle>
								<AlertDescription>{search.error instanceof Error ? search.error.message : "Tente de novo."}</AlertDescription>
							</Alert>
						) : search.data?.length === 0 ? (
							<p className="text-caption text-muted-foreground">Nenhuma conta com esse e-mail.</p>
						) : (
							<ItemGroup>
								{search.data?.map((u) => (
									<Item
										key={u.id}
										variant={selected?.id === u.id ? "muted" : "outline"}
										size="sm"
										render={<button type="button" onClick={() => setSelected(u)} />}
									>
										<ItemContent>
											<ItemTitle>{u.email}</ItemTitle>
											{u.saram && <ItemDescription>SARAM {u.saram}</ItemDescription>}
										</ItemContent>
									</Item>
								))}
							</ItemGroup>
						))}
				</CardContent>
			</Card>

			{selected && (
				<Card>
					<CardHeader>
						<CardTitle>{selected.email}</CardTitle>
						<CardDescription>Acessos atuais do SISPROV. Cada linha sai sozinha; revogar não leva junto um bloqueio da mesma chave.</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						{grants.isLoading ? (
							<Skeleton className="h-10" />
						) : grants.isError ? (
							<Alert variant="destructive">
								<AlertTitle>Não foi possível ler os acessos</AlertTitle>
								<AlertDescription>{grants.error instanceof Error ? grants.error.message : "Tente de novo."}</AlertDescription>
							</Alert>
						) : grants.data && grants.data.length > 0 ? (
							<ItemGroup>
								{grants.data.map((row) => (
									<Item key={row.id} variant="outline" size="sm">
										<ItemContent>
											<ItemTitle>
												{SISPROV_MODULE_LABELS[row.module as SisprovModule] ?? row.module}{" "}
												<Badge variant={row.level === 0 ? "destructive" : "outline"}>
													{row.level === 0 ? "Bloqueado" : sisprovLevelLabel(row.module as SisprovModule, row.level)}
												</Badge>
											</ItemTitle>
											<ItemDescription>{unitName(row.unit_id)}</ItemDescription>
										</ItemContent>
										<ItemActions>
											<Button variant="ghost" size="sm" onClick={() => revoke.mutate(row.id)} disabled={revoke.isPending} aria-label="Revogar este acesso">
												<Trash2 className="size-4" />
												Revogar
											</Button>
										</ItemActions>
									</Item>
								))}
							</ItemGroup>
						) : (
							<p className="text-caption text-muted-foreground">Nenhum acesso do SISPROV nesta conta.</p>
						)}

						<FieldGroup className="sm:grid sm:grid-cols-3 sm:items-end">
							<Field>
								<FieldLabel>Papel</FieldLabel>
								<Select
									value={module}
									onValueChange={(v) => {
										if (v) setModule(v as SisprovModule)
									}}
								>
									<SelectTrigger>
										<SelectValue>{SISPROV_MODULE_LABELS[module]}</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{SISPROV_MODULES.map((m) => (
											<SelectItem key={m} value={m}>
												{SISPROV_MODULE_LABELS[m]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
							<Field>
								<FieldLabel>Nível</FieldLabel>
								<Select
									value={String(effectiveLevel)}
									onValueChange={(v) => {
										if (v) setLevel(Number(v))
									}}
								>
									<SelectTrigger>
										<SelectValue>{sisprovLevelLabel(module, effectiveLevel)}</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{levelsFor.map((l) => (
											<SelectItem key={l} value={String(l)}>
												{sisprovLevelLabel(module, l)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
							<Field>
								<FieldLabel>Escopo</FieldLabel>
								<Select
									value={scope}
									onValueChange={(v) => {
										if (v) setScope(v)
									}}
									disabled={units.isLoading}
								>
									<SelectTrigger>
										<SelectValue>{scope === GLOBAL_SCOPE ? "Toda a rede" : unitName(Number(scope))}</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{units.data?.coverage === "all" && <SelectItem value={GLOBAL_SCOPE}>Toda a rede (SDAB)</SelectItem>}
										{units.data?.units.map((u) => (
											<SelectItem key={u.id} value={String(u.id)}>
												{u.code}
												{u.display_name && u.display_name !== u.code ? ` · ${u.display_name}` : ""}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FieldDescription>
									{units.data?.coverage === "all" ? "Grant na apoiadora cobre as OMs apoiadas por ela." : "Você só concede nas OMs da sua cobertura."}
								</FieldDescription>
							</Field>
						</FieldGroup>
						<Button onClick={() => grant.mutate()} disabled={grant.isPending || units.isLoading || scopeDisabled}>
							{grants.data && grants.data.length > 0 ? <ShieldCheck className="size-4" /> : <UserPlus className="size-4" />}
							Conceder acesso
						</Button>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
