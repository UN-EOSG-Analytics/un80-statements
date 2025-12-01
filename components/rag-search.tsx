"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
    Column,
    ColumnFiltersState,
    SortingState,
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table";
import { CopyIcon, Loader2Icon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
    totalCandidates?: number;
    topK?: number;
    total?: number;
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
      className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs focus:border-un-blue focus:outline-none"
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
  const [allData, setAllData] = useState<RagSearchResult[]>([]);
  const [filteredData, setFilteredData] = useState<RagSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "sessionDate", desc: true },
  ]);
  const [copiedRow, setCopiedRow] = useState<number | null>(null);
  const [copiedTable, setCopiedTable] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);

  // Load all data on mount
  useEffect(() => {
    async function loadAllData() {
      try {
        setIsLoading(true);
        const response = await fetch("/api/search/all");
        const payload: SearchResponse = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load data");
        }
        setAllData(payload.data ?? []);
        setFilteredData(payload.data ?? []);
        setIsSearchActive(false);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load data",
        );
      } finally {
        setIsLoading(false);
      }
    }
    loadAllData();
  }, []);

  const uniqueDates = useMemo(() => {
    return Array.from(new Set(filteredData.map((r) => r.sessionDate))).filter(
      Boolean,
    );
  }, [filteredData]);

  const uniqueAffiliations = useMemo(() => {
    return Array.from(
      new Set(
        filteredData.map((r) => r.speakerAffiliationName).filter(Boolean),
      ),
    ) as string[];
  }, [filteredData]);

  const columns = useMemo(
    () => [
      ...(isSearchActive
        ? [
            columnHelper.accessor("score", {
              header: "Match",
              cell: (info) => (
                <span className="font-mono text-xs font-semibold text-un-blue">
                  {(info.getValue() * 100).toFixed(0)}%
                </span>
              ),
              sortingFn: "basic",
              size: 80,
            }),
          ]
        : []),
      columnHelper.accessor("sessionTitle", {
        header: "Session Title",
        cell: (info) => info.getValue(),
        enableColumnFilter: true,
        meta: {
          filterComponent: (props: {
            column: Column<RagSearchResult, string>;
          }) => <TextFilter {...props} placeholder="Filter session" />,
        },
        size: 220,
      }),
      columnHelper.accessor("sessionDate", {
        header: "Date",
        cell: (info) => info.getValue(),
        enableColumnFilter: true,
        meta: {
          filterComponent: ({
            column,
          }: {
            column: Column<RagSearchResult, string>;
          }) => (
            <select
              className="w-full rounded-md border border-input px-2 py-1 text-xs focus:border-un-blue focus:outline-none"
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
      columnHelper.accessor("speakerAffiliationName", {
        header: "Affiliation",
        cell: (info) => info.getValue() || "—",
        enableColumnFilter: true,
        meta: {
          filterComponent: ({
            column,
          }: {
            column: Column<RagSearchResult, string>;
          }) => (
            <select
              className="w-full rounded-md border border-input px-2 py-1 text-xs focus:border-un-blue focus:outline-none"
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
      columnHelper.accessor("speakerName", {
        header: "Speaker",
        cell: (info) => info.getValue() || "Unknown",
        enableColumnFilter: true,
        meta: {
          filterComponent: (props: {
            column: Column<RagSearchResult, string>;
          }) => <TextFilter {...props} placeholder="Filter speaker" />,
        },
        size: 160,
      }),
      columnHelper.accessor(isSearchActive ? "contextText" : "text", {
        header: isSearchActive ? "Context" : "Sentence",
        cell: (info) => {
          const row = info.row.original;
          const displayText = isSearchActive ? row.contextText : row.text;
          const handleCopy = async () => {
            try {
              await navigator.clipboard.writeText(displayText);
              setCopiedRow(row.id);
              setTimeout(() => setCopiedRow(null), 1500);
            } catch (copyError) {
              console.error("Failed to copy text", copyError);
            }
          };
          return (
            <div className="space-y-1">
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {displayText}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-un-blue"
                onClick={handleCopy}
              >
                <CopyIcon className="mr-2 size-3.5" />
                {copiedRow === row.id ? "Copied" : "Copy"}
              </Button>
            </div>
          );
        },
        enableColumnFilter: true,
        meta: {
          filterComponent: (props: {
            column: Column<RagSearchResult, string>;
          }) => <TextFilter {...props} placeholder="Filter words" />,
        },
        size: 420,
      }),
    ],
    [uniqueAffiliations, uniqueDates, copiedRow, isSearchActive],
  );

  const table = useReactTable({
    data: filteredData,
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
    if (!query.trim()) {
      // Reset to all data if query is empty
      setFilteredData(allData);
      setColumnFilters([]);
      setGlobalFilter("");
      setSorting([{ id: "sessionDate", desc: true }]);
      setIsSearchActive(false);
      return;
    }

    setIsSearching(true);
    setError(null);
    setColumnFilters([]);
    setGlobalFilter("");

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), topK: 200 }),
      });
      const payload: SearchResponse = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Search failed");
      }
      setFilteredData(payload.data ?? []);
      setSorting([{ id: "score", desc: true }]);
      setIsSearchActive(true);
    } catch (searchError) {
      setError(
        searchError instanceof Error ? searchError.message : "Search failed",
      );
    } finally {
      setIsSearching(false);
    }
  };

  const buildMarkdownPayload = () => {
    const visibleRows = table.getRowModel().rows;
    if (visibleRows.length === 0) return "No rows selected";
    const headerRow = "| Affiliation | Speaker | Sentence |";
    const separator = "| --- | --- | --- |";
    const body = visibleRows
      .map((row) => {
        const data = row.original;
        const cleanSentence = data.text.replace(/\n+/g, " ").trim();
        return `| ${data.speakerAffiliationName || "—"} | ${
          data.speakerName || "Unknown"
        } | ${cleanSentence} |`;
      })
      .join("\n");
    return `${headerRow}\n${separator}\n${body}`;
  };

  const handleCopyTable = async () => {
    try {
      const markdown = buildMarkdownPayload();
      await navigator.clipboard.writeText(markdown);
      setCopiedTable(true);
      setTimeout(() => setCopiedTable(false), 1500);
    } catch (copyError) {
      console.error("Failed to copy table", copyError);
    }
  };

  const hasFilters = Boolean(globalFilter) || columnFilters.length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2Icon className="size-8 animate-spin text-un-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-16">
      {/* Search bar outside the box */}
      <form onSubmit={handleSearch} className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Semantic Search</h2>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="cursor-help text-xs">
                  AI
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-sm">
                  Uses AI embeddings to find semantically similar content
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="relative">
          <Input
            id="query"
            placeholder="e.g. voluntary registry for mandates"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSearch(
                  event as unknown as React.FormEvent<HTMLFormElement>,
                );
              }
            }}
            className="h-14 border-2 border-un-blue/30 pr-12 text-base focus-visible:border-un-blue focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {isSearching ? (
            <Loader2Icon className="absolute top-1/2 right-4 size-5 -translate-y-1/2 animate-spin text-un-blue" />
          ) : (
            <SearchIcon className="absolute top-1/2 right-4 size-5 -translate-y-1/2 text-un-blue/60" />
          )}
        </div>
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </form>

      {/* Table with filters */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-80">
            <Input
              id="table-filter"
              placeholder="Search within results"
              value={globalFilter}
              onChange={(event) => setGlobalFilter(event.target.value)}
              className="focus-visible:border-un-blue focus-visible:ring-0 focus-visible:ring-offset-0"
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
          <div className="ml-auto flex items-center gap-4">
            <p className="text-sm text-muted-foreground">
              Showing {table.getFilteredRowModel().rows.length} of{" "}
              {filteredData.length} results
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={handleCopyTable}
              className="w-[140px] justify-start border-un-blue text-un-blue"
            >
              <CopyIcon className="mr-2 size-4" />
              {copiedTable ? "Copied!" : "Copy Table"}
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/80">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="border-b px-4 py-3 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase"
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
                      <th
                        key={`filter-${header.id}`}
                        className="border-b px-4 py-2"
                      >
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
                  <tr
                    key={row.id}
                    className="border-b align-top hover:bg-un-blue/5"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-4 text-sm">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
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
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount() || 1}
          </p>
          <select
            className="rounded-md border border-input px-2 py-1 text-sm focus:border-un-blue focus:outline-none"
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
      </section>
    </div>
  );
}
