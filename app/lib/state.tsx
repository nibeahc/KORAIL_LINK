'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CaseItem } from './types';
import { listCases, upsertCase } from './supabase';
import { initialCases } from './mockCases';

export type CasesUpdater = CaseItem[] | ((prev: CaseItem[]) => CaseItem[]);

interface CasesContextValue {
  cases: CaseItem[];
  loading: boolean;
  toast: string | null;
  dismissToast: () => void;
  setCasesAndPersist: (updater: CasesUpdater) => void;
}

const CasesContext = createContext<CasesContextValue | null>(null);

/**
 * 로컬 상태 우선 + best-effort DB 동기화 (마스터 컨텍스트 4장).
 * 1) React state는 즉시 동기적으로 갱신 (배열/업데이터 함수 둘 다 받는다)
 * 2) Supabase 저장은 비동기로 시도, 실패해도 .catch()로 삼켜 화면은 절대 깨지지 않는다
 * 3) 저장 실패는 토스트로만 알리고 로컬 상태는 롤백하지 않는다
 */
export function CasesProvider({ children }: { children: ReactNode }) {
  const [cases, setCases] = useState<CaseItem[]>(initialCases);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCases()
      .then((rows) => {
        if (cancelled) return;
        if (rows.length > 0) setCases(rows);
        // DB가 비어 있으면 초기 목업(initialCases)을 그대로 유지한다.
      })
      .catch(() => {
        // 로그인 전(RLS 차단) 또는 네트워크 오류 — 목업으로 폴백, 화면은 깨지지 않는다.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setCasesAndPersist = useCallback((updater: CasesUpdater) => {
    setCases((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      Promise.all(next.map((item) => upsertCase(item))).catch(() => {
        setToast('저장에 실패했습니다. 화면은 계속 사용할 수 있어요.');
      });
      return next;
    });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const value = useMemo(
    () => ({ cases, loading, toast, dismissToast, setCasesAndPersist }),
    [cases, loading, toast, dismissToast, setCasesAndPersist]
  );

  return <CasesContext.Provider value={value}>{children}</CasesContext.Provider>;
}

export function useCases() {
  const ctx = useContext(CasesContext);
  if (!ctx) throw new Error('useCases는 CasesProvider 하위에서만 사용할 수 있습니다.');
  return ctx;
}
