'use client';

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, qs, type Page } from '@/lib/api';
import { Button, EmptyState, ErrorState, FilterBar, cx } from './primitives';

/** Placeholder that matches the table's shape, so the page does not jump when rows arrive. */
function TableSkeleton({ columns, rows = 6 }: { columns: number; rows?: number }) {
  const cols = Math.min(Math.max(columns, 2), 6);
  return (
    <div role="status" aria-label="Loading" className="overflow-hidden rounded-lg border border-grey-200">
      <div className="flex gap-3 bg-grey-50 px-3 py-2.5">{Array.from({ length: cols }).map((_, i) => <div key={i} className="shimmer h-3 flex-1 rounded" />)}</div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3 border-t border-grey-100 px-3 py-3">
          {Array.from({ length: cols }).map((_, c) => <div key={c} className={cx('shimmer h-4 rounded', c === 0 ? 'flex-[1.4]' : 'flex-1', r % 2 ? 'max-w-[70%]' : '')} />)}
        </div>
      ))}
    </div>
  );
}

/**
 * Server-driven table over a cursor-paginated list endpoint. Keeps a stack of
 * cursors so "previous" works without offsets. Filters live in the parent;
 * changing them resets to the first page.
 */
export interface DataTableProps<T> {
  path: string;
  params?: Record<string, string | number | boolean | undefined | null>;
  columns: ColumnDef<T, unknown>[];
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  toolbar?: ReactNode;
  onRowClick?: (row: T) => void;
  queryKey?: unknown[];
  /** Poll while the current rows need it (e.g. jobs still running): return the interval in ms, or false to stop. */
  refetchInterval?: (rows: T[]) => number | false;
  /**
   * Keep only some rows of each page, for a view the API cannot filter by
   * itself (e.g. "open" orders = several statuses). Pages may then show fewer
   * rows than the page size; Next still walks the whole list.
   */
  rowFilter?: (row: T) => boolean;
}

export function DataTable<T extends { id: string }>({ path, params = {}, columns, pageSize = 25, emptyTitle = 'Nothing here yet', emptyDescription, toolbar, onRowClick, queryKey = [], refetchInterval, rowFilter }: DataTableProps<T>) {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const cursor = cursors[cursors.length - 1] ?? null;
  const paramKey = JSON.stringify(params);
  useEffect(() => {
    setCursors([null]);
  }, [paramKey, path]);

  const query = useQuery({
    queryKey: ['table', path, paramKey, cursor, pageSize, ...queryKey],
    queryFn: ({ signal }) => api.get<Page<T>>(`${path}${qs({ ...params, limit: pageSize, cursor: cursor ?? undefined })}`, signal),
    placeholderData: keepPreviousData,
    refetchInterval: refetchInterval ? (q) => refetchInterval(q.state.data?.data ?? []) : false,
  });

  const data = useMemo(() => { const rows = query.data?.data ?? []; return rowFilter ? rows.filter(rowFilter) : rows; }, [query.data, rowFilter]);
  const hiddenOnPage = (query.data?.data.length ?? 0) - data.length;
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="space-y-3">
      {toolbar && <FilterBar>{toolbar}</FilterBar>}
      {query.isPending ? (
        <TableSkeleton columns={columns.length} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : data.length === 0 ? (
        <EmptyState title={emptyTitle} description={query.data?.page.hasMore ? 'Nothing on this page matches. Use Next to look further.' : emptyDescription} />
      ) : (
        <div className={cx('animate-fade-in overflow-x-auto rounded-lg border border-grey-200 transition-opacity duration-200', query.isFetching && 'opacity-60')}>
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-grey-50 text-left text-xs uppercase tracking-wide text-grey-600">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th key={h.id} scope="col" className="px-3 py-2 font-medium">
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cx('border-t border-grey-200', onRowClick && 'cursor-pointer hover:bg-grey-50')}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-grey-600">
        <span>
          {data.length ? `${data.length} on this page` : ''}
          {hiddenOnPage > 0 && rowFilter ? ` (${hiddenOnPage} hidden in this view)` : ''}
          {cursors.length > 1 ? ` · page ${cursors.length}` : ''}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="min-w-10 sm:min-w-8" aria-label="Refresh" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw size={14} />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setCursors((c) => c.slice(0, -1))} disabled={cursors.length <= 1 || query.isFetching}>
            <ChevronLeft size={14} /> Prev
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setCursors((c) => [...c, query.data?.page.nextCursor ?? null])} disabled={!query.data?.page.hasMore || query.isFetching}>
            Next <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
