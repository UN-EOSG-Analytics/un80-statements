"use client";

import { useMemo, useState } from "react";
import {
  ColumnFiltersState,
  Column,
  SortingState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { SearchIcon, CopyIcon, Loader2Icon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type RagSearchResult = {
  id: number;
  score: number;
  text: string;
  contextText: string;
  assetId: string;
  sessionNum: string | null;
  sessionTitle: string;
  sessionDate: string;
  statementIdx: number;
  paragraphIdx: number;
  sentenceIdx: number;
  speakerAffiliationCode: string | null;
  speakerAffiliationName: string | null;
  speakerName: string | null;
  speakerFunction: string | null;
  speakerGroup: string | null;
};

interface SearchResponse {
  data: RagSearchResult[];
  meta?: {
    totalCandidates: number;
    topK: number;
  };
  error?: string;
}

function TextFilter<TData, TValue>({
  column,
  placeholder,
}: {
  column: Column<TData, TValue>;
  placeholder?: string;
}) {
  const filterValue = (column.getFilterValue() as string) ?? "";
  return (
    <input
      className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs focus:border-ring focus:ring-1 focus:ring-ring/50"
      value={filterValue}
      onChange={(event) =>
        column.setFilterValue(event.target.value || undefined)
      }
      placeholder={placeholder ?? "Filter"}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

const columnHelper = createColumnHelper<RagSearchResult>();

export function RagSearch() {
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState("20");
  const [results, setResults] = useState<RagSearchResult[]>([]);
  const [meta, setMeta] = useState<SearchResponse["meta"]>();
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "score", desc: true },
  ]);
  const [copiedRow, setCopiedRow] = useState<number | null>(null);

  const uniqueDates = useMemo(() => {
    return Array.from(new Set(results.map((r) => r.sessionDate))).filter(Boolean);
  }, [results]);

  const uniqueAffiliations = useMemo(() => {
    return Array.from(
      new Set(results.map((r) => r.speakerAffiliationName).filter(Boolean)),
    ) as string[];
  }, [results]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("score", {
        header: "Score",
        cell: (info) => (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs">
              {info.getValue().toFixed(3)}
            </Badge>
            <div className="h-1 w-24 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(1, Math.max(0, info.getValue())) * 100}%` }}
              />
            </div>
          </div>
        ),
        sortingFn: "basic",
        size: 120,
      }),
      columnHelper.accessor("contextText", {
        header: "Sentence Context",
        cell: (info) => {
          const row = info.row.original;
          const handleCopy = async () => {
            try {
              await navigator.clipboard.writeText(row.contextText);
              setCopiedRow(row.id);
              setTimeout(() => setCopiedRow(null), 1500);
            } catch (copyError) {
              console.error("Failed to copy context", copyError);
            }
          };
          return (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-primary">{row.text}</p>
              <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {row.contextText}
              </p>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>
                  Statement {row.statementIdx} • Paragraph {row.paragraphIdx} • Sentence {row.sentenceIdx}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={handleCopy}
                >
                  <CopyIcon className="mr-2 size-3.5" />
                  {copiedRow === row.id ? "Copied" : "Copy context"}
                </Button>
              </div>
            </div>
          );
        },
        enableColumnFilter: true,
        meta: {
          filterComponent: (props: { column: Column<RagSearchResult, string> }) => (
            <TextFilter {...props} placeholder="Filter text" />
          ),
        },
        size: 420,
      }),
      columnHelper.accessor("speakerName", {
        header: "Speaker",
        cell: (info) => (
          <div className="text-sm">
            <p className="font-medium">{info.getValue() || "Unknown"}</p>
            {info.row.original.speakerFunction && (
              <p className="text-xs text-muted-foreground">
                {info.row.original.speakerFunction}
              </p>
            )}
            {info.row.original.speakerGroup && (
              <p className="text-xs text-muted-foreground">
                Group: {info.row.original.speakerGroup}
              </p>
            )}
          </div>
        ),
        enableColumnFilter: true,
        meta: {
          filterComponent: (props: { column: Column<RagSearchResult, string> }) => (
            <TextFilter {...props} placeholder="Filter speaker" />
          ),
        },
        size: 160,
      }),
      columnHelper.accessor("speakerAffiliationName", {
        header: "Affiliation",
        cell: (info) => info.getValue() || "—",
        enableColumnFilter: true,
        meta: {
          filterComponent: ({ column }: { column: Column<RagSearchResult, string> }) => (
            <select
              className="w-full rounded-md border border-input px-2 py-1 text-xs"
              value={(column.getFilterValue() as string) ?? ""}
              onChange={(event) =>
                column.setFilterValue(event.target.value || undefined)
              }
            >
              <option value="">All</option>
              {uniqueAffiliations.map((affiliation) => (
                <option key={affiliation} value={affiliation}>
                  {affiliation}
                </option>
              ))}
            </select>
          ),
        },
        size: 160,
      }),
      columnHelper.accessor("sessionTitle", {
        header: "Session",
        cell: (info) => (
          <div className="space-y-1 text-sm">
            <p className="font-medium">{info.getValue()}</p>
            <p className="text-xs text-muted-foreground">
              {info.row.original.sessionDate}
            </p>
          </div>
        ),
        enableColumnFilter: true,
        meta: {
          filterComponent: (props: { column: Column<RagSearchResult, string> }) => (
            <TextFilter {...props} placeholder="Filter session" />
          ),
        },
        size: 220,
      }),
      columnHelper.accessor("sessionDate", {
        header: "Date",
        cell: (info) => info.getValue(),
        enableColumnFilter: true,
        meta: {
          filterComponent: ({ column }: { column: Column<RagSearchResult, string> }) => (
            <select
              className="w-full rounded-md border border-input px-2 py-1 text-xs"
              value={(column.getFilterValue() as string) ?? ""}
              onChange={(event) =>
                column.setFilterValue(event.target.value || undefined)
              }
            >
              <option value="">All</option>
              {uniqueDates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          ),
        },
        size: 140,
      }),
      columnHelper.accessor("assetId", {
        header: "Asset",
        cell: (info) => (
          <a
            className="text-sm text-primary underline-offset-4 hover:underline"
            href={`https://media.un.org/en/asset/${info.getValue()}`}
            target="_blank"
            rel="noreferrer"
          >
            {info.getValue()}
          </a>
        ),
        size: 140,
      }),
    ],
    [uniqueAffiliations, uniqueDates, copiedRow],
  );

  const table = useReactTable({
    data: results,
    columns,
    state: {
      columnFilters,
      sorting,
      globalFilter,
    },
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 25 },
    },
  });

  const handleSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setError(null);
    setColumnFilters([]);
    setGlobalFilter("");

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), topK: Number(topK) }),
      });
      const payload: SearchResponse = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Search failed");
      }
      setResults(payload.data ?? []);
      setMeta(payload.meta);
      if ((payload.data ?? []).length === 0) {
        setSorting([{ id: "score", desc: true }]);
      }
    } catch (searchError) {
      setError(
        searchError instanceof Error ? searchError.message : "Search failed",
      );
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const hasFilters = globalFilter || columnFilters.length > 0;

  return (
    <Card className="border-border">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Semantic Sentence Search</CardTitle>
        <p className="text-sm text-muted-foreground">
          Embed your query with Azure OpenAI and retrieve the most relevant statements from the Turso RAG store.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSearch} className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="query">
              Query
            </label>
            <Input
              id="query"
              placeholder="e.g. mandate registries transparency"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="topk">
              Top K
            </label>
            <Select value={topK} onValueChange={setTopK}>
              <SelectTrigger id="topk" className="min-w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[5, 10, 20, 50, 75, 100, 150, 200].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} results
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              className="w-full"
              disabled={!query.trim() || isSearching}
            >
              {isSearching ? (
                <>
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                  Searching
                </>
              ) : (
                <>
                  <SearchIcon className="mr-2 size-4" />
                  Run search
                </>
              )}
            </Button>
          </div>
        </form>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium" htmlFor="table-filter">
                  Filter rows
                </label>
                <Input
                  id="table-filter"
                  placeholder="Filter across all columns"
                  value={globalFilter}
                  onChange={(event) => setGlobalFilter(event.target.value)}
                  className="mt-1"
                />
              </div>
              {hasFilters && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setGlobalFilter("");
                    setColumnFilters([]);
                  }}
                >
                  Clear filters
                </Button>
              )}
              {meta && (
                <p className="text-sm text-muted-foreground">
                  Showing {table.getFilteredRowModel().rows.length} of {meta.topK} requested • {meta.totalCandidates} candidates scanned
                </p>
              )}
            </div>

            <div className="overflow-hidden rounded-lg border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <th
                            key={header.id}
                            className="border-b px-4 py-3 text-left font-semibold"
                            style={{ width: header.getSize() }}
                          >
                            <button
                              type="button"
                              className={cn(
                                "flex items-center gap-2",
                                header.column.getCanSort() && "cursor-pointer",
                                !header.column.getCanSort() && "cursor-default",
                              )}
                              onClick={
                                header.column.getCanSort()
                                  ? header.column.getToggleSortingHandler()
                                  : undefined
                              }
                              disabled={!header.column.getCanSort()}
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                              {{
                                asc: "↑",
                                desc: "↓",
                              }[header.column.getIsSorted() as string] ?? null}
                            </button>
                          </th>
                        ))}
                      </tr>
                    ))}
                    <tr>
                      {table.getHeaderGroups()[0]?.headers.map((header) => {
                        const FilterComponent =
                          header.column.columnDef.meta?.filterComponent;
                        return (
                          <th key={`filter-${header.id}`} className="border-b px-4 py-2">
                            {header.column.getCanFilter() && FilterComponent ? (
                              <FilterComponent column={header.column} />
                            ) : null}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row) => (
                      <tr key={row.id} className="border-b align-top hover:bg-muted/40">
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  Prev
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  Next
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
              </p>
              <select
                className="rounded-md border border-input px-2 py-1 text-sm"
                value={table.getState().pagination.pageSize}
                onChange={(event) => table.setPageSize(Number(event.target.value))}
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    Show {size}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {!isSearching && results.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">
            Run a query to see the most relevant sentences.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
