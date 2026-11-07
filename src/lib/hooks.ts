'use client';

import { useMutation, useQuery, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useToast } from '@/components/ui/toast';

/** GET helper returning the unwrapped `data`. Pass `null` to disable. */
export function useGet<T>(path: string | null, opts: { enabled?: boolean; refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: ['get', path],
    queryFn: ({ signal }) => api.get<{ data: T }>(path!, signal).then((r) => r.data),
    enabled: !!path && (opts.enabled ?? true),
    refetchInterval: opts.refetchInterval,
  });
}

/**
 * Mutation with toast feedback and query invalidation. `invalidate` entries
 * are path prefixes matched against ['get', path] and ['table', path] keys.
 *
 * Errors are always shown as ONE toast here; an `onError` passed by a page is
 * for extra work only (inline field errors, resetting state) and must not
 * toast again. `errorMessage` replaces the toast text for particular errors.
 *
 * A second `mutate` while one is still in flight is ignored (double taps send
 * one request). Pass `concurrent: true` for per-row actions where different
 * rows may legitimately run at the same time.
 */
export function useAction<TVars = void, TData = unknown>(
  fn: (vars: TVars) => Promise<TData>,
  opts: { success?: string; invalidate?: string[]; onSuccess?: (data: TData, vars: TVars) => void; onError?: (err: unknown, vars: TVars) => void; errorMessage?: (err: unknown) => string | undefined; concurrent?: boolean } & Omit<UseMutationOptions<TData, unknown, TVars>, 'mutationFn' | 'onSuccess' | 'onError'> = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  const { success, invalidate, onSuccess, onError, errorMessage, concurrent, onSettled, ...rest } = opts;
  const busy = useRef(false);
  const m = useMutation<TData, unknown, TVars>({
    mutationFn: fn,
    onSuccess: (data, vars) => {
      if (success) toast.success(success);
      for (const prefix of invalidate ?? []) {
        void qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[1] === 'string' && (q.queryKey[1] as string).startsWith(prefix) });
      }
      onSuccess?.(data, vars);
    },
    onError: (err, vars) => {
      const custom = errorMessage?.(err);
      toast.error(custom ? new Error(custom) : err);
      onError?.(err, vars);
    },
    onSettled: (...args) => {
      busy.current = false;
      return onSettled?.(...args);
    },
    ...rest,
  });
  const { mutate: rawMutate } = m;
  const guarded = useCallback((...args: Parameters<typeof rawMutate>) => {
    if (busy.current && !concurrent) return;
    busy.current = true;
    rawMutate(...args);
  }, [rawMutate, concurrent]);
  return { ...m, mutate: guarded as typeof rawMutate };
}

/** Controlled filter state for list pages. */
export function useFilters<T extends Record<string, string>>(initial: T) {
  const [filters, setFilters] = useState<T>(initial);
  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => setFilters((f) => ({ ...f, [key]: value })), []);
  const reset = useCallback(() => setFilters(initial), [initial]);
  return { filters, set, reset };
}

/** Debounced copy of a value (search inputs). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
