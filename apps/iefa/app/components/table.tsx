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
};

export interface FacilidadesTableProps {
  OM: string;
  Date: string;
  Hour: string;
  Hour_limit: string;
}

function useFacilidadesData(
  OM: string,
  Date: string,
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
          .from("facilidades_pregoeiro")
          .select();

        if (error) throw error;

        const finalData =
          fetched && fetched.length > 0
            ? fetched
            : [
                {
                  id: "d7090840-5353-473b-8914-893dcccdd5cd" as UUID,
                  created_at: "2025-06-22 20:57:15.526856+00",
                  title: "Abertura da Sessão Pública",
                  phase: "Abertura",
                  content:
                    "Prezados Licitantes, ${OM} registra e agradece a participação de todos. Informa-se que a Sessão Pública está aberta e em condições para o início das atividades de hoje. Mantenham-se conectados.",
                },
              ];
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
    return data.map((item) => ({
      ...item,
      content: item.content
        .replace("${OM}", OM)
        .replace("${date}", Date)
        .replace("${hour}", Hour)
        .replace("${hour_limit}", Hour_limit),
    }));
  }, [data, OM, Date, Hour]);

  return { data: processedData, loading, error };
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
      <div className="text-center capitalize break-words">
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
      <div className="capitalize break-words">{row.getValue("title")}</div>
    ),
  },
  {
    accessorKey: "content",
    header: "Conteúdo",
    enableHiding: false,
    cell: ({ row }) => (
      <div className="text-center font-medium break-words text-pretty hyphens-auto p-auto">
        {row.getValue("content")}
      </div>
    ),
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const facilidade = row.original;
      const content = facilidade.content;

      return <CopyButton content={content} />;
    },
  },
];

export function FacilidadesTable({
  OM,
  Date,
  Hour,
  Hour_limit,
}: FacilidadesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  const { data, loading, error } = useFacilidadesData(
    OM,
    Date,
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
          <DropdownMenuContent align="end">
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="w-full table">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="break-words">
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
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="break-words p-3">
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
