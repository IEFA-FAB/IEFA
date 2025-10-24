"use client";

import { useMemo, useState } from "react";
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
} from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, ChevronDown } from "lucide-react";

import { Button } from "@iefa/ui";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
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
import { type UUID } from "crypto";
import {supabaseApp} from "@/lib/supabase";
import CopyButton from "./copy-button";

export type Facilidades_pregoeiro = {
  id: UUID;
  created_at: string;
  phase: string;
  title: string;
  content: string;
  tags: string[] | null;
  owner_id: UUID | null;
  default: boolean | null;
};

export interface FacilidadesTableProps {
  OM: string;
  Date: string;
  Hour: string;
  Hour_limit: string;
}

function safeReplaceAll(str: string, search: string, replace: string) {
  try {
    // @ts-ignore
    if (typeof str.replaceAll === "function")
      return str.replaceAll(search, replace);
  } catch {}
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return str.replace(new RegExp(escaped, "g"), replace);
}

// Hook com TanStack Query para buscar os registros crus (sem substituir placeholders)
const FACILITIES_QUERY_KEY = ["facilities_pregoeiro"];

function useFacilitiesQuery() {
  return useQuery<Facilidades_pregoeiro[]>({
    queryKey: FACILITIES_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabaseApp
        .from("facilities_pregoeiro")
        .select(); // busca todos os campos

      if (error) throw new Error(error.message);

      // Fallback se a tabela estiver vazia
      const fallback: Facilidades_pregoeiro[] = [
        {
          id: "d7090840-5353-473b-8914-893dcccdd5cd" as UUID,
          created_at: "2025-06-22 20:57:15.526856+00",
          title: "Abertura da Sessão Pública",
          phase: "Abertura",
          content:
            "Prezados Licitantes, ${OM} registra e agradece a participação de todos. Informa-se que a Sessão Pública está aberta e em condições para o início das atividades de hoje, ${date} às ${hour}. Encerramento estimado: ${hour_limit}. Mantenham-se conectados.",
          tags: ["sessão", "abertura"],
          owner_id: "00000000-0000-0000-0000-000000000000" as UUID,
          default: true,
        },
      ];

      const base = (
        data && data.length > 0 ? data : fallback
      ) as Facilidades_pregoeiro[];

      // Normalize alguns campos aqui (sem mexer nos placeholders)
      return base.map((item) => ({
        ...item,
        tags: item.tags ?? [],
        default: item.default ?? false,
      }));
    },
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });
}

export const columns: ColumnDef<Facilidades_pregoeiro>[] = [
  {
    accessorKey: "phase",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="h-auto p-2"
      >
        Fase
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="capitalize whitespace-pre-wrap break-words">
        {row.getValue("phase")}
      </div>
    ),
  },
  {
    accessorKey: "title",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="h-auto p-2"
      >
        Título
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="whitespace-pre-wrap break-words">
        {row.getValue("title")}
      </div>
    ),
  },
  {
    accessorKey: "content",
    header: "Conteúdo",
    enableHiding: false,
    cell: ({ row }) => (
      <div className="text-left font-normal whitespace-pre-wrap break-words text-pretty hyphens-auto leading-relaxed">
        {row.getValue("content")}
      </div>
    ),
  },
  {
    accessorKey: "tags",
    header: "Tags",
    cell: ({ row }) => {
      const tags = (row.getValue("tags") as string[]) || [];
      if (!tags.length)
        return <span className="text-muted-foreground text-sm">—</span>;
      return (
        <div className="flex flex-wrap gap-1">
          {tags.map((t, i) => (
            <span
              key={`${t}-${i}`}
              className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs break-words"
              title={t}
            >
              {t}
            </span>
          ))}
        </div>
      );
    },
  },
  {
    accessorKey: "default",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="h-auto p-2"
      >
        Padrão
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const val = row.getValue("default") as boolean;
      return (
        <span
          className={
            "inline-flex items-center rounded-md px-2 py-0.5 text-xs " +
            (val ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800")
          }
        >
          {val ? "Sim" : "Não"}
        </span>
      );
    },
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const facilidade = row.original;
      const content = facilidade.content ?? "";
      return <CopyButton content={content} />;
    },
  },
];

export function FacilidadesTable({
  OM,
  Date: DateStr,
  Hour,
  Hour_limit,
}: FacilidadesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  // Busca dados crus com TanStack Query
  const { data: baseData = [], isLoading, error } = useFacilitiesQuery();

  // Aplica substituições de placeholders sem re-fetch
  const data = useMemo(() => {
    return baseData.map((item) => {
      const raw = item.content ?? "";
      const replaced = [
        ["${OM}", OM],
        ["${date}", DateStr],
        ["${hour}", Hour],
        ["${hour_limit}", Hour_limit],
      ].reduce((acc, [from, to]) => safeReplaceAll(acc, from, to), raw);

      return {
        ...item,
        content: replaced,
      };
    });
  }, [baseData, OM, DateStr, Hour, Hour_limit]);

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    initialState: {
      pagination: { pageSize: 50 },
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  if (isLoading) {
    return (
      <div className="w-full flex items-center justify-center py-8">
        <div className="text-center">Carregando...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full flex items-center justify-center py-8">
        <div className="text-center text-red-500">
          Erro ao carregar dados:{" "}
          {error instanceof Error ? error.message : "Erro desconhecido"}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <Input
          placeholder="Filtre títulos..."
          value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("title")?.setFilterValue(event.target.value)
          }
          className="max-w-sm"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              Colunas <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-72 overflow-auto">
            {table
              .getAllLeafColumns()
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table className="w-full table-auto">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="align-top">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="align-top whitespace-pre-wrap break-words text-pretty"
                  >
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
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="align-top">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="align-top whitespace-pre-wrap break-words text-pretty hyphens-auto p-4 leading-relaxed"
                    >
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
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  Sem resultados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <span>
            Página{" "}
            <strong>
              {table.getState().pagination.pageIndex + 1} de{" "}
              {table.getPageCount()}
            </strong>
          </span>
          <span>
            | Total: {table.getFilteredRowModel().rows.length} registros
          </span>
        </div>
        <div className="flex items-center space-x-2">
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
    </div>
  );
}
