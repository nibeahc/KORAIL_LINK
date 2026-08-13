'use client';

import Link from 'next/link';
import { useCases } from '../../lib/state';
import { CASE_STATUS_LABEL } from '../../lib/types';

export default function CaseListPage() {
  const { cases, loading } = useCases();

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-lg font-semibold text-neutral-900">화물 운송</h1>
      <p className="mt-1 text-sm text-neutral-500">Case 하나를 선택하면 견적·계약·문서·정산으로 이동할 수 있습니다.</p>

      <ul className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {cases.map((c) => (
          <li key={c.id}>
            <Link href={`/cases/${c.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-neutral-50">
              <div>
                <p className="font-medium text-neutral-900">
                  {c.caseNumber} · {c.shipperName}
                </p>
                <p className="text-neutral-500">{c.route}</p>
              </div>
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700">
                {CASE_STATUS_LABEL[c.status]}
              </span>
            </Link>
          </li>
        ))}
        {!loading && cases.length === 0 && <li className="px-4 py-6 text-sm text-neutral-400">등록된 Case가 없습니다.</li>}
      </ul>
    </main>
  );
}
