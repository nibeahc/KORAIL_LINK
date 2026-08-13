'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCases } from '../../../../lib/state';
import { insertCaseStatusHistory } from '../../../../lib/supabase';
import { QuoteValidationPanel } from '../../../../components/QuoteValidationPanel';

const CONFIRMABLE_STATUSES = new Set(['pending_validation', 'needs_review']);

export default function CaseValidationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { cases, setCasesAndPersist } = useCases();
  const [submitting, setSubmitting] = useState(false);
  const item = cases.find((c) => c.id === params.id);

  if (!item) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <p className="text-sm text-neutral-500">Case를 찾을 수 없습니다.</p>
      </main>
    );
  }

  const total = item.costLedger.reduce((sum, l) => sum + l.quotedAmount, 0);
  const canConfirm = CONFIRMABLE_STATUSES.has(item.status);

  async function handleConfirm() {
    setSubmitting(true);
    const previousStatus = item!.status;
    setCasesAndPersist((prev) =>
      prev.map((c) => (c.id === item!.id ? { ...c, status: 'quote_confirmed', price: total } : c))
    );
    await insertCaseStatusHistory(item!.id, previousStatus, 'quote_confirmed').catch(() => {});
    setSubmitting(false);
    router.push(`/cases/${item!.id}`);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-lg font-semibold text-neutral-900">견적 검증</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {item.caseNumber} · 현재 Cost Ledger 합계 ${total.toLocaleString()}
      </p>

      <div className="mt-6">
        <QuoteValidationPanel masterData={item.masterData} total={total} />
      </div>

      {canConfirm ? (
        <button
          onClick={handleConfirm}
          disabled={submitting}
          className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {submitting ? '확정 중…' : '견적 확정'}
        </button>
      ) : (
        <p className="mt-6 text-sm text-neutral-400">이미 견적이 확정된 Case입니다.</p>
      )}
    </main>
  );
}
