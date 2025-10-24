import * as React from "react";
import { toast } from "sonner";
import supabase from "~/utils/supabase";

import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table";

import { ArrowUpDown, ChevronDown, MoreHorizontal } from "lucide-react";

import { Button } from "@iefa/ui";
import { Checkbox } from "@iefa/ui";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@iefa/ui";
import { Input } from "@iefa/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@iefa/ui";

import AddUserDialog, { NewUserPayload } from "./AddUserDialog";
import EditUserDialog, { EditUserPayload } from "./EditUserDialog";
import DeleteUserDialog from "./DeleteUserDialog";
import { useRancho } from "~/components/hooks/useRancho";
import { UserLevelOrNull } from "@iefa/auth";

// Tipos
export type ProfileAdmin = {
  id: string;
  saram: string | null;
  name: string | null;
  email: string;
  role: UserLevelOrNull;
  om: string | null;
  created_at: string;
  updated_at: string;
};

type UserLevel = UserLevelOrNull;

export default function ProfilesManager() {
  // Dados
  const [profiles, setProfiles] = React.useState<ProfileAdmin[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Hook de OMs
  const {
    unidades,
    isLoading: isLoadingUnidades,
    error: unidadesError,
  } = useRancho();

  // Estados dos diálogos e seleção
  const [selectedProfile, setSelectedProfile] =
    React.useState<ProfileAdmin | null>(null);
  const [isAddUserOpen, setIsAddUserOpen] = React.useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = React.useState(false);
  const [isDeleteUserOpen, setIsDeleteUserOpen] = React.useState(false);

  // Loading states de ações
  const [isAdding, setIsAdding] = React.useState(false);
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Buscar perfis
  const fetchProfiles = React.useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles_admin")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching profiles:", error);
      toast.error("Erro ao buscar perfis", {
        description: error.message,
      });
    } else {
      setProfiles(data || []);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // Ações: Adicionar
  const handleAddUser = async (payload: NewUserPayload) => {
    const id = payload.id.trim();
    const email = payload.email.trim().toLowerCase();
    const name = payload.name.trim();
    const saram = payload.saram.trim();
    const role = payload.role;
    const om = payload.om || null;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(id)) {
      toast.error("Erro de Validação", {
        description: "ID inválido. Informe um UUID válido do usuário admin.",
      });
      return;
    }
    if (!emailRegex.test(email)) {
      toast.error("Erro de Validação", { description: "Email inválido." });
      return;
    }
    if (!name) {
      toast.error("Erro de Validação", {
        description: "O nome é obrigatório.",
      });
      return;
    }
    if (!/^\d{7}$/.test(saram)) {
      toast.error("SARAM inválido", {
        description: "O SARAM deve conter exatamente 7 números.",
      });
      return;
    }
    if (!role) {
      toast.error("Erro de Validação", {
        description: "Selecione uma role para o usuário.",
      });
      return;
    }

    try {
      setIsAdding(true);
      const { error } = await supabase.from("profiles_admin").insert([
        {
          id,
          email,
          name,
          saram,
          role,
          om,
        },
      ]);
      if (error) throw error;

      toast.success("Sucesso!", {
        description: `Usuário ${email} adicionado.`,
      });

      setIsAddUserOpen(false);
      await fetchProfiles();
    } catch (err: any) {
      toast.error("Erro ao adicionar usuário", {
        description:
          err?.message ?? "Ocorreu um erro ao salvar. Tente novamente.",
      });
    } finally {
      setIsAdding(false);
    }
  };

  // Ações: Atualizar
  const handleUpdateUser = async (payload: EditUserPayload) => {
    if (!selectedProfile) return;

    if (payload.saram && !/^\d{7}$/.test(payload.saram)) {
      toast.error("SARAM inválido", {
        description: "O SARAM deve conter exatamente 7 números.",
      });
      return;
    }

    try {
      setIsUpdating(true);
      const { error } = await supabase
        .from("profiles_admin")
        .update({
          role: payload.role,
          saram: payload.saram || null,
          om: payload.om || null,
        })
        .eq("id", selectedProfile.id);

      if (error) throw error;

      toast.success("Sucesso!", {
        description: `Perfil de ${selectedProfile.email} atualizado.`,
      });

      setIsEditUserOpen(false);
      setSelectedProfile(null);
      await fetchProfiles();
    } catch (err: any) {
      toast.error("Erro ao atualizar", {
        description: err?.message ?? "Não foi possível atualizar o registro.",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Ações: Excluir
  const handleDeleteUser = async () => {
    if (!selectedProfile) return;

    try {
      setIsDeleting(true);
      const { error } = await supabase
        .from("profiles_admin")
        .delete()
        .eq("id", selectedProfile.id);

      if (error) throw error;

      toast.success("Registro excluído", {
        description: `Usuário ${selectedProfile.email} removido.`,
      });

      setIsDeleteUserOpen(false);
      setSelectedProfile(null);
      await fetchProfiles();
    } catch (err: any) {
      toast.error("Erro ao excluir", {
        description: err?.message ?? "Não foi possível excluir o registro.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Colunas da Tabela
  const columns = React.useMemo<ColumnDef<ProfileAdmin>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
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
        cell: ({ row }) => (
          <div className="lowercase text-gray-900">{row.getValue("email")}</div>
        ),
      },
      {
        accessorKey: "name",
        header: "Nome",
        cell: ({ row }) => (
          <div className="text-gray-700">{row.getValue("name") || "N/A"}</div>
        ),
      },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => (
          <div className="capitalize font-medium">
            {row.getValue("role") || "N/A"}
          </div>
        ),
      },
      {
        accessorKey: "saram",
        header: "SARAM",
        cell: ({ row }) => (
          <div className="tabular-nums">{row.getValue("saram") || "N/A"}</div>
        ),
      },
      {
        accessorKey: "om",
        header: "OM",
        cell: ({ row }) => <div>{row.getValue("om") || "N/A"}</div>,
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const profile = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Abrir menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Ações</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedProfile(profile);
                    setIsEditUserOpen(true);
                  }}
                >
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    setSelectedProfile(profile);
                    setIsDeleteUserOpen(true);
                  }}
                >
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    []
  );

  // Tabela
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

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
  });

  const emailFilter =
    (table.getColumn("email")?.getFilterValue() as string) ?? "";
  const roleFilter =
    (table.getColumn("role")?.getFilterValue() as string) ?? "";

  const resetFilters = () => {
    table.resetColumnFilters();
  };

  // Skeleton inicial (primeira carga)
  /* if (loading && profiles.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:gap-8">
        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-10 w-40" />
          </div>
          <Skeleton className="h-12 w-full rounded-md mb-3" />
          <Skeleton className="h-64 w-full rounded-md" />
        </div>
      </div>
    );
  } */

  return (
    <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-6">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 py-2">
        <div className="flex-1 flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Filtrar por email..."
            value={emailFilter}
            onChange={(event) =>
              table.getColumn("email")?.setFilterValue(event.target.value)
            }
            className="max-w-sm"
          />
          <div className="flex items-center gap-2">
            <select
              className="w-full sm:w-[200px] h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={roleFilter || ""}
              onChange={(e) =>
                table
                  .getColumn("role")
                  ?.setFilterValue(e.target.value || undefined)
              }
            >
              <option value="">Filtrar por role</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>

            <Button
              variant="outline"
              onClick={resetFilters}
              className="whitespace-nowrap"
            >
              Limpar filtros
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 md:ml-auto">
          {/* Adicionar Usuário */}
          <Button
            className="whitespace-nowrap"
            onClick={() => setIsAddUserOpen(true)}
          >
            + Adicionar Usuário
          </Button>

          {/* Dropdown de Colunas */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="whitespace-nowrap">
                Colunas <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabela */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
        <Table>
          <TableHeader className="bg-gray-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="h-24"
                >
                  <div className="flex items-center justify-center gap-2 text-gray-600">
                    <svg
                      className="animate-spin h-4 w-4 text-gray-400"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4l3.5-3.5L12 0v4a8 8 0 100 16v4l3.5-3.5L12 20v4a8 8 0 01-8-8z"
                      />
                    </svg>
                    Carregando...
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="hover:bg-gray-50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="h-24 text-center text-gray-600"
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
        isLoading={isAdding}
        unidades={unidades || []}
        isLoadingUnidades={isLoadingUnidades}
        unidadesError={unidadesError}
        onSubmit={handleAddUser}
      />

      <EditUserDialog
        open={isEditUserOpen}
        onOpenChange={setIsEditUserOpen}
        isLoading={isUpdating}
        profile={selectedProfile}
        unidades={unidades || []}
        isLoadingUnidades={isLoadingUnidades}
        unidadesError={unidadesError}
        onSubmit={handleUpdateUser}
      />

      <DeleteUserDialog
        open={isDeleteUserOpen}
        onOpenChange={setIsDeleteUserOpen}
        isLoading={isDeleting}
        profile={selectedProfile}
        onConfirm={handleDeleteUser}
      />
    </div>
  );
}
