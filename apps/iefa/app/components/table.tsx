"use client";

import { useEffect, useState, useMemo } from "react";
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
import supabase from "@/lib/supabase";
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
  // Usa replaceAll se disponível, senão regex global
  // Evita erro caso o conteúdo não tenha a tag
  try {
    // @ts-ignore
    if (typeof str.replaceAll === "function")
      return str.replaceAll(search, replace);
  } catch {}
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return str.replace(new RegExp(escaped, "g"), replace);
}

function useFacilidadesData(
  OM: string,
  DateStr: string,
  Hour: string,
  Hour_limit: string
) {
  const [data, setData] = useState<Facilidades_pregoeiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function getFacilidades() {
      try {
        setLoading(true);
        const { data: fetched, error } = await supabase
          .from("facilities_pregoeiro")
          .select(); // busca todos os campos

        if (error) throw error;

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

        const finalData = fetched && fetched.length > 0 ? fetched : fallback;
        setData(finalData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar dados");
        console.error("Erro ao buscar facilidades:", err);
      } finally {
        setLoading(false);
      }
    }

    getFacilidades();
  }, []);

  const processedData = useMemo(() => {
    return data.map((item) => {
      const raw = item.content ?? "";
      const replaced = [
        // faz todas as substituições de forma segura
        ["${OM}", OM],
        ["${date}", DateStr],
        ["${hour}", Hour],
        ["${hour_limit}", Hour_limit],
      ].reduce((acc, [from, to]) => safeReplaceAll(acc, from, to), raw);

      return {
        ...item,
        content: replaced,
        tags: item.tags ?? [],
        default: item.default ?? false,
      };
    });
  }, [data, OM, DateStr, Hour, Hour_limit]);

  return { data: processedData, loading, error };
}

export const columns: ColumnDef<Facilidades_pregoeiro>[] = [
  /* {
    accessorKey: "id",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="h-auto p-2"
      >
        ID
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const id = row.getValue("id") as string;
      return (
        <div className="flex flex-col gap-1">
          <code className="text-xs break-words">{id}</code>
          <div>
            <CopyButton content={id} />
          </div>
        </div>
      );
    },
  }, */
  /* {
    accessorKey: "created_at",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="h-auto p-2"
      >
        Criado em
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const value = row.getValue("created_at") as string;
      const date = new Date(value);
      const formatted = isNaN(date.getTime())
        ? value
        : date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      return <div className="whitespace-pre-wrap break-words">{formatted}</div>;
    },
  }, */
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
      <div className="capitalize whitespace-pre-wrap break-words">
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
  /* {
    accessorKey: "owner_id",
    header: "Owner",
    cell: ({ row }) => {
      const owner = row.getValue("owner_id") as string | null;
      if (!owner)
        return <span className="text-muted-foreground text-sm">—</span>;
      return (
        <code className="text-xs whitespace-pre-wrap break-words">{owner}</code>
      );
    },
  }, */
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

  const { data, loading, error } = useFacilidadesData(
    OM,
    DateStr,
    Hour,
    Hour_limit
  );

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
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  if (loading) {
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
          Erro ao carregar dados: {error}
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

      {/* Sem scroll horizontal: removido overflow-x-auto e forçada quebra de linha */}
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
