'use client';

import type { CausalAnalysis } from '../lib/causalAnalysis';

export function EvidenceDrawer({ analysis, onClose }: { analysis: CausalAnalysis | null; onClose: () => void }) {
  if (!analysis) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={onClose}>
      <div className="h-full w-full max-w-sm overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">{analysis.label} 근거</h3>
          <button onClick={onClose} className="text-sm text-neutral-400 hover:text-neutral-700">
            닫기
          </button>
        </div>

        <div className="mt-4 rounded-md bg-neutral-50 p-3 text-sm text-neutral-700">{analysis.narrative}</div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-neutral-400">z-score</dt>
            <dd className="font-medium text-neutral-900">{analysis.zScore.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">전일 대비</dt>
            <dd className="font-medium text-neutral-900">{analysis.changePct.toFixed(2)}%</dd>
          </div>
        </dl>

        <div className="mt-6">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">관련 뉴스</p>
          {analysis.relatedNews.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">직접 연관된 뉴스가 없습니다.</p>
          ) : (
            <ul className="mt-2 space-y-3">
              {analysis.relatedNews.map((n) => (
                <li key={n.id} className="rounded-md border border-neutral-200 p-3">
                  <p className="text-xs text-neutral-400">
                    {n.category} · {n.publishedAt}
                  </p>
                  <p className="mt-1 text-sm font-medium text-neutral-900">{n.title}</p>
                  <p className="mt-1 text-xs text-neutral-500">{n.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
