'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCases } from '../../../../lib/state';
import { insertCaseStatusHistory } from '../../../../lib/supabase';
import { QuoteValidationPanel } from '../../../../components/QuoteValidationPanel';
import { CaseHeader } from '../../../../components/CaseHeader';
import { CaseTabs } from '../../../../components/CaseTabs';

const CONFIRMABLE_STATUSES = new Set(['pending_validation', 'needs_review']);

export default function CaseValidationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { cases, setCasesAndPersist } = useCases();
  const [submitting, setSubmitting] = useState(false);
  const item = cases.find((c) => c.id === params.id);

  if (!item) {
    return (
      <div className="page">
        <p style={{ color: 'var(--muted)', fontSize: 12 }}>Case를 찾을 수 없습니다.</p>
      </div>
    );
  }

  const total = item.costLedger.reduce((sum, l) => sum + l.quotedAmount, 0);
  const canConfirm = CONFIRMABLE_STATUSES.has(item.status);

  async function handleConfirm() {
    setSubmitting(true);
    const previousStatus = item!.status;
    setCasesAndPersist((prev) => prev.map((c) => (c.id === item!.id ? { ...c, status: 'quote_confirmed', price: total } : c)));
    await insertCaseStatusHistory(item!.id, previousStatus, 'quote_confirmed').catch(() => {});
    setSubmitting(false);
    router.push(`/cases/${item!.id}/contract`);
  }

  return (
    <div className="case-workspace figma-case-detail">
      <CaseHeader item={item} />
      <CaseTabs caseId={item.id} />
      <div className="workspace-body">
        <QuoteValidationPanel masterData={item.masterData} total={total} onConfirm={canConfirm ? handleConfirm : undefined} confirmLabel={submitting ? '확정 중…' : '견적 확정하기'} />
      </div>
    </div>
  );
}
