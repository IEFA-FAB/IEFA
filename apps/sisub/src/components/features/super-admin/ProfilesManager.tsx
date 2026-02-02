import {
	Badge,
	Button,
	Checkbox,
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@iefa/ui"
import {
	type ColumnDef,
	type ColumnFiltersState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table"
import { ArrowUpDown, ChevronDown, MoreHorizontal } from "lucide-react"
import * as React from "react"
import {
	useAddProfile,
	useAdminProfiles,
	useDeleteProfile,
	useUpdateProfile,
} from "@/hooks/data/useAdminProfiles"
import { useMessHalls } from "@/hooks/data/useMessHalls"
import type { EditUserPayload, NewUserPayload, ProfileAdmin, UserLevelOrNull } from "@/types/domain"
import AddUserDialog from "./AddUserDialog"
import DeleteUserDialog from "./DeleteUserDialog"
import EditUserDialog from "./EditUserDialog"

type UserLevel = UserLevelOrNull
// Badge de role (cores via variantes padrão do shadcn)
const RoleBadge = ({ role }: { role: UserLevel }) => {
	if (!role) return <span className="text-muted-foreground">N/A</span>
	const variant: "destructive" | "default" | "secondary" =
		role === "superadmin" ? "destructive" : role === "admin" ? "default" : "secondary"
	const label = role === "superadmin" ? "Superadmin" : role === "admin" ? "Admin" : "User"
	return <Badge variant={variant}>{label}</Badge>
}

export default function ProfilesManager() {
	// Dados via Hook
	const { data: profiles = [], isLoading: loading } = useAdminProfiles()
	const addProfile = useAddProfile()
	const updateProfile = useUpdateProfile()
	const deleteProfile = useDeleteProfile()

	// Hook de OMs
	const { units, isLoading: isLoadingunits, error: unitsError } = useMessHalls()

	// Estados dos diálogos e seleção
	const [selectedProfile, setSelectedProfile] = React.useState<ProfileAdmin | null>(null)
	const [isAddUserOpen, setIsAddUserOpen] = React.useState(false)
	const [isEditUserOpen, setIsEditUserOpen] = React.useState(false)
	const [isDeleteUserOpen, setIsDeleteUserOpen] = React.useState(false)

	// Ações: Adicionar
	const handleAddUser = async (payload: NewUserPayload) => {
		await addProfile.mutateAsync(payload)
		setIsAddUserOpen(false)
	}

	// Ações: Atualizar
	const handleUpdateUser = async (payload: EditUserPayload) => {
		if (!selectedProfile) return
		await updateProfile.mutateAsync({ id: selectedProfile.id, payload })
		setIsEditUserOpen(false)
		setSelectedProfile(null)
	}

	// Ações: Excluir
	const handleDeleteUser = async () => {
		if (!selectedProfile) return
		await deleteProfile.mutateAsync(selectedProfile.id)
		setIsDeleteUserOpen(false)
		setSelectedProfile(null)
	}

	// Colunas da Tabela (React Compiler otimiza, sem useMemo)
	const columns: ColumnDef<ProfileAdmin>[] = [
		{
			id: "select",
			header: ({ table }) => (
				<Checkbox
					checked={table.getIsAllPageRowsSelected()}
					onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
					aria-label="Selecionar todos"
				/>
			),
			cell: ({ row }) => (
				<Checkbox
					checked={row.getIsSelected()}
					onCheckedChange={(value) => row.toggleSelected(!!value)}
					aria-label="Selecionar linha"
				/>
			),
			enableSorting: false,
			enableHiding: false,
		},
		{
			accessorKey: "email",
			header: ({ column }) => (
				<Button
					variant="ghost"
					className="px-0"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Email <ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			),
			cell: ({ row }) => <div className="lowercase text-foreground">{row.getValue("email")}</div>,
		},
		{
			accessorKey: "name",
			header: "Nome",
			cell: ({ row }) => (
				<div className="text-foreground">
					{row.getValue("name") || <span className="text-muted-foreground">N/A</span>}
				</div>
			),
		},
		{
			accessorKey: "role",
			header: "Role",
			cell: ({ row }) => <RoleBadge role={row.getValue("role")} />,
		},
		{
			accessorKey: "saram",
			header: "SARAM",
			cell: ({ row }) => (
				<div className="tabular-nums">
					{row.getValue("saram") || <span className="text-muted-foreground">N/A</span>}
				</div>
			),
		},
		{
			accessorKey: "om",
			header: "OM",
			cell: ({ row }) => (
				<div>{row.getValue("om") || <span className="text-muted-foreground">N/A</span>}</div>
			),
		},
		{
			id: "actions",
			cell: ({ row }) => {
				const profile = row.original
				return (
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button variant="ghost" className="h-8 w-8 p-0">
									<span className="sr-only">Abrir menu</span>
									<MoreHorizontal className="h-4 w-4" />
								</Button>
							}
						/>
						<DropdownMenuContent align="end">
							<DropdownMenuGroup>
								<DropdownMenuLabel>Ações</DropdownMenuLabel>
								<DropdownMenuItem
									onClick={() => {
										setSelectedProfile(profile)
										setIsEditUserOpen(true)
									}}
								>
									Editar
								</DropdownMenuItem>
								<DropdownMenuItem
									className="text-destructive focus:text-destructive"
									onClick={() => {
										setSelectedProfile(profile)
										setIsDeleteUserOpen(true)
									}}
								>
									Excluir
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				)
			},
		},
	]

	// Tabela
	const [sorting, setSorting] = React.useState<SortingState>([])
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
	const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
	const [rowSelection, setRowSelection] = React.useState({})

	const table = useReactTable({
		data: profiles,
		columns,
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onColumnVisibilityChange: setColumnVisibility,
		onRowSelectionChange: setRowSelection,
		state: {
			sorting,
			columnFilters,
			columnVisibility,
			rowSelection,
		},
	})

	const emailFilter = (table.getColumn("email")?.getFilterValue() as string) ?? ""
	const roleFilter = (table.getColumn("role")?.getFilterValue() as string) ?? ""

	const resetFilters = () => {
		table.resetColumnFilters()
	}

	return (
		<div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
			{/* Toolbar */}
			<div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 py-2">
				<div className="flex-1 flex flex-col sm:flex-row gap-2">
					<Input
						placeholder="Filtrar por email..."
						value={emailFilter}
						onChange={(event) => table.getColumn("email")?.setFilterValue(event.target.value)}
						className="max-w-sm"
					/>

					<div className="flex items-center gap-2">
						{/* Select do shadcn/ui para filtrar por role */}
						<Select
							value={roleFilter ?? ""}
							onValueChange={(v) => table.getColumn("role")?.setFilterValue(v || undefined)}
						>
							<SelectTrigger className="w-full sm:w-[200px]">
								<SelectValue placeholder="Filtrar por role" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="user">User</SelectItem>
								<SelectItem value="admin">Admin</SelectItem>
								<SelectItem value="superadmin">Superadmin</SelectItem>
							</SelectContent>
						</Select>

						<Button variant="outline" onClick={resetFilters} className="whitespace-nowrap">
							Limpar filtros
						</Button>
					</div>
				</div>

				<div className="flex items-center gap-2 md:ml-auto">
					{/* Adicionar Usuário */}
					<Button className="whitespace-nowrap" onClick={() => setIsAddUserOpen(true)}>
						+ Adicionar Usuário
					</Button>

					{/* Dropdown de Colunas */}
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button variant="outline" className="whitespace-nowrap">
									Colunas <ChevronDown className="ml-2 h-4 w-4" />
								</Button>
							}
						/>
						<DropdownMenuContent align="end">
							<DropdownMenuGroup>
								{table
									.getAllColumns()
									.filter((column) => column.getCanHide())
									.map((column) => (
										<DropdownMenuCheckboxItem
											key={column.id}
											className="capitalize"
											checked={column.getIsVisible()}
											onCheckedChange={(value) => column.toggleVisibility(!!value)}
										>
											{column.id}
										</DropdownMenuCheckboxItem>
									))}
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{/* Tabela */}
			<div className="mt-4 overflow-x-auto rounded-xl border border-border">
				<Table>
					<TableHeader className="bg-muted/50">
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<TableHead key={header.id} className="text-muted-foreground">
										{header.isPlaceholder
											? null
											: flexRender(header.column.columnDef.header, header.getContext())}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>

					<TableBody>
						{loading ? (
							<TableRow>
								<TableCell colSpan={table.getAllColumns().length} className="h-24">
									<div className="flex items-center justify-center gap-2 text-muted-foreground">
										<span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-b-transparent" />
										Carregando...
									</div>
								</TableCell>
							</TableRow>
						) : table.getRowModel().rows?.length ? (
							table.getRowModel().rows.map((row) => (
								<TableRow
									key={row.id}
									data-state={row.getIsSelected() && "selected"}
									className="
                    hover:bg-accent/50
                    data-[state=selected]:bg-accent/40
                  "
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id} className="align-middle">
											{flexRender(cell.column.columnDef.cell, cell.getContext())}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={table.getAllColumns().length}
									className="h-24 text-center text-muted-foreground"
								>
									Nenhum resultado encontrado.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			{/* Paginação */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4">
				<div className="text-muted-foreground text-sm">
					{table.getFilteredSelectedRowModel().rows.length} de{" "}
					{table.getFilteredRowModel().rows.length} linha(s) selecionada(s).
				</div>
				<div className="flex items-center gap-2">
					{/* Select para tamanho da página */}
					<Select
						value={String(table.getState().pagination?.pageSize ?? 10)}
						onValueChange={(v) => table.setPageSize(Number(v))}
					>
						<SelectTrigger className="w-[160px]">
							<SelectValue placeholder="Itens por página" />
						</SelectTrigger>
						<SelectContent>
							{[10, 20, 30, 50, 100].map((size) => (
								<SelectItem key={size} value={String(size)}>
									{size} por página
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<Button
						variant="outline"
						size="sm"
						onClick={() => table.previousPage()}
						disabled={!table.getCanPreviousPage()}
					>
						Anterior
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => table.nextPage()}
						disabled={!table.getCanNextPage()}
					>
						Próximo
					</Button>
				</div>
			</div>

			{/* Modais */}
			<AddUserDialog
				open={isAddUserOpen}
				onOpenChange={setIsAddUserOpen}
				isLoading={addProfile.isPending}
				units={units ? [...units] : []}
				isLoadingUnits={isLoadingunits}
				unitsError={unitsError}
				onSubmit={handleAddUser}
			/>

			<EditUserDialog
				open={isEditUserOpen}
				onOpenChange={setIsEditUserOpen}
				isLoading={updateProfile.isPending}
				profile={selectedProfile}
				units={units ? [...units] : []}
				isLoadingUnits={isLoadingunits}
				unitsError={unitsError}
				onSubmit={handleUpdateUser}
			/>

			<DeleteUserDialog
				open={isDeleteUserOpen}
				onOpenChange={setIsDeleteUserOpen}
				isLoading={deleteProfile.isPending}
				profile={selectedProfile}
				onConfirm={handleDeleteUser}
			/>
		</div>
	)
}
