/**
 * Relatório de frota — o parque da FAB inteira, agregado por FUNÇÃO.
 *
 * O eixo é a função, não o modelo, porque a pergunta do gestor global é "quantas cozinhas não
 * conseguem assar?", não "quantos iCombi existem". Modelo e cozinha são FILTROS: servem para o
 * recall de fabricante e para o caso pontual, não para a leitura principal.
 *
 * Cobertura conta unidade OPERANTE. Uma cozinha cujo único forno combinado está com pane
 * inoperante aberta aparece como **sem** cobertura — é o número que decide remanejamento, e
 * contá-la como coberta transformaria o relatório num inventário que não ajuda ninguém.
 *
 * Somente leitura, por definição: corrigir o dado é da cozinha que o produz.
 */

import { AlertTriangle } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useEquipmentModels, useEquipmentRoles, useFleetEquipmentReport } from "@/hooks/data/useEquipment"

const ALL = "__all__"

export function FleetEquipmentReport() {
	const [roleId, setRoleId] = useState<string | null>(null)
	const [modelId, setModelId] = useState<string | null>(null)
	const { data: roles = [] } = useEquipmentRoles()
	const { data: models = [] } = useEquipmentModels(null)
	const { data, isLoading } = useFleetEquipmentReport({ roleId, modelId })

	if (isLoading) return <Skeleton className="h-96 w-full" />
	if (!data) return null

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap gap-3">
				<div className="w-56">
					<span className="text-caption text-muted-foreground">Função</span>
					<Select value={roleId ?? ALL} onValueChange={(value) => setRoleId(value === ALL ? null : (value as string))}>
						<SelectTrigger className="w-full">
							<SelectValue>{roleId ? (roles.find((r) => r.id === roleId)?.name ?? "Função") : "Todas as funções"}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ALL}>Todas as funções</SelectItem>
							{roles.map((role) => (
								<SelectItem key={role.id} value={role.id}>
									{role.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="w-64">
					<span className="text-caption text-muted-foreground">Modelo</span>
					<Select value={modelId ?? ALL} onValueChange={(value) => setModelId(value === ALL ? null : (value as string))}>
						<SelectTrigger className="w-full">
							<SelectValue>{modelId ? (models.find((m) => m.id === modelId)?.name ?? "Modelo") : "Todos os modelos"}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ALL}>Todos os modelos</SelectItem>
							{models.map((model) => (
								<SelectItem key={model.id} value={model.id}>
									{[model.manufacturer, model.name].filter(Boolean).join(" ")}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<Card>
					<CardHeader className="pb-2">
						<CardDescription>Cozinhas com parque cadastrado</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-heading">
							{data.kitchens_with_park}
							<span className="text-body text-muted-foreground"> de {data.kitchens_total}</span>
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardDescription>Equipamentos cadastrados</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-heading">{data.units_total}</p>
					</CardContent>
				</Card>
				<Card className={data.inoperative_issues.length > 0 ? "bg-destructive/5" : undefined}>
					<CardHeader className="pb-2">
						<CardDescription>Panes inoperantes abertas</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-heading">{data.inoperative_issues.length}</p>
					</CardContent>
				</Card>
			</div>

			{data.kitchens_with_park === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyTitle>Nenhuma cozinha cadastrou parque</EmptyTitle>
						<EmptyDescription>
							A cobertura por função só passa a significar alguma coisa quando as cozinhas cadastram o que têm. Até lá, ausência aqui é falta de cadastro, não
							falta de equipamento.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<Card>
					<CardHeader>
						<CardTitle>Cobertura por função</CardTitle>
						<CardDescription>Cozinha com o equipamento parado conta como SEM cobertura — é o que decide remanejamento.</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Função</TableHead>
									<TableHead className="w-28">Com cobertura</TableHead>
									<TableHead className="w-28">Só parado</TableHead>
									<TableHead className="w-28">Sem nenhum</TableHead>
									<TableHead className="w-32">Unidades</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.coverage.map((row) => (
									<TableRow key={row.role_id} className={row.kitchens_down > 0 ? "bg-destructive/5" : undefined}>
										<TableCell className="font-medium">{row.role_name}</TableCell>
										<TableCell>{row.kitchens_covered}</TableCell>
										<TableCell>{row.kitchens_down > 0 ? <Badge variant="destructive">{row.kitchens_down}</Badge> : row.kitchens_down}</TableCell>
										<TableCell>{row.kitchens_without}</TableCell>
										<TableCell>
											{row.units_operational}/{row.units_total}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}

			{data.inoperative_issues.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<AlertTriangle className="size-4" />
							Parados há mais tempo
						</CardTitle>
						<CardDescription>Pane inoperante aberta, da mais antiga para a mais recente.</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Cozinha</TableHead>
									<TableHead>Equipamento</TableHead>
									<TableHead>Modelo</TableHead>
									<TableHead className="w-28">Parado</TableHead>
									<TableHead>Relato</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.inoperative_issues.map((issue) => (
									<TableRow key={issue.issue_id}>
										<TableCell>{issue.kitchen_name}</TableCell>
										<TableCell className="font-medium">{issue.unit_label}</TableCell>
										<TableCell>{issue.model ?? "—"}</TableCell>
										<TableCell>{issue.days_open === 1 ? "1 dia" : `${issue.days_open} dias`}</TableCell>
										<TableCell className="text-caption">{issue.description}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>Distribuição do parque</CardTitle>
					<CardDescription>Por modelo — é por aqui que se responde a um recall de fabricante.</CardDescription>
				</CardHeader>
				<CardContent>
					{data.distribution.length === 0 ? (
						<p className="text-caption text-muted-foreground">Nenhum equipamento cadastrado no recorte atual.</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Modelo</TableHead>
									<TableHead className="w-28">Unidades</TableHead>
									<TableHead className="w-28">Cozinhas</TableHead>
									<TableHead className="w-28">Parados</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.distribution.map((row) => (
									<TableRow key={row.model_id}>
										<TableCell className="font-medium">{row.model}</TableCell>
										<TableCell>{row.units}</TableCell>
										<TableCell>{row.kitchens}</TableCell>
										<TableCell>{row.down > 0 ? <Badge variant="destructive">{row.down}</Badge> : 0}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
