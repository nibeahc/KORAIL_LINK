'use client';

import { Badge } from './Badge';
import { CASE_STATUS_LABEL, CASE_STATUS_TONE, type CaseItem, type CaseStatus } from '../lib/types';

const STEPS = ['견적 등록', 'AI 검증', '견적 확정', '계약', '정산'];

function stepIndex(status: CaseStatus): number {
  switch (status) {
    case 'pending_validation':
    case 'needs_review':
      return 1;
    case 'quote_confirmed':
      return 2;
    case 'contracted':
      return 3;
    case 'settlement':
      return 4;
  }
}

function Stepper({ status }: { status: CaseStatus }) {
  const idx = stepIndex(status);
  return (
    <div className="stepper">
      {STEPS.map((s, i) => (
        <div className={i < idx ? 'done' : i === idx ? 'current' : ''} key={s}>
          <span>{i < idx ? '✓' : i + 1}</span>
          <b>{s}</b>
          {i < STEPS.length - 1 && <i />}
        </div>
      ))}
    </div>
  );
}

export function CaseHeader({ item }: { item: CaseItem }) {
  return (
    <section className="case-hero">
      <div className="case-breadcrumb">
        화물 운송 <span>/</span> {item.caseNumber}
      </div>
      <div className="case-heading">
        <div>
          <div>
            <Badge tone={CASE_STATUS_TONE[item.status]}>{CASE_STATUS_LABEL[item.status]}</Badge>
            <span className="case-id">{item.caseNumber}</span>
          </div>
          <h1>{item.route}</h1>
          <p>
            {item.shipperName} · {item.cargoType} · {item.containerType}
          </p>
        </div>
        <div className="quote">
          <span>확정 견적금액</span>
          <b>${item.price.toLocaleString()}</b>
          <small>코레일 · USD</small>
        </div>
      </div>
      <Stepper status={item.status} />
    </section>
  );
}
