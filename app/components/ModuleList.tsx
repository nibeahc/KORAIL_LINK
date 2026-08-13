'use client';

import Link from 'next/link';
import { useCases } from '../lib/state';
import { CASE_STATUS_LABEL, CASE_STATUS_TONE, type CaseItem } from '../lib/types';
import { PageTitle } from './PageTitle';
import { Badge } from './Badge';
import { Icon } from './Icon';

const MODULE_META: Record<string, { eyebrow: string; segment: string }> = {
  계약: { eyebrow: 'CONTRACTS', segment: '/contract' },
  문서: { eyebrow: 'DOCUMENTS', segment: '/documents' },
  정산: { eyebrow: 'SETTLEMENTS', segment: '/settlement' },
};

function isModuleRelevant(item: CaseItem): boolean {
  return item.status === 'quote_confirmed' || item.status === 'contracted' || item.status === 'settlement';
}

export function ModuleList({ type }: { type: '계약' | '문서' | '정산' }) {
  const { cases } = useCases();
  const subset = cases.filter(isModuleRelevant);
  const meta = MODULE_META[type];
  const inProgress = subset.filter((c) => c.status !== 'settlement').length;
  const completed = subset.filter((c) => c.status === 'settlement').length;

  return (
    <div className="page">
      <PageTitle eyebrow={meta.eyebrow} title={`${type} 업무`} desc={`견적 Case와 연결된 ${type} 진행상태를 확인하세요.`} />
      <div className="module-stats">
        <div className="card">
          <span>전체 대상</span>
          <b>{subset.length}</b>
          <small>Case</small>
        </div>
        <div className="card">
          <span>진행 중</span>
          <b>{inProgress}</b>
          <small>담당자 확인 필요</small>
        </div>
        <div className="card">
          <span>완료</span>
          <b>{completed}</b>
          <small>정산까지 완료</small>
        </div>
      </div>
      <div className="table-card card">
        <div className="table-summary">
          <b>{type} 대상 Case</b>
          <span>{subset.length}건</span>
        </div>
        <div className="case-table-scroll">
          <table>
            <thead>
              <tr>
                <th>CASE 번호</th>
                <th>화주 / 품목</th>
                <th>노선</th>
                <th>포워더</th>
                <th>상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {subset.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.caseNumber}</b>
                  </td>
                  <td>
                    <b>{c.shipperName}</b>
                    <small>{c.cargoType}</small>
                  </td>
                  <td>{c.route}</td>
                  <td>코레일</td>
                  <td>
                    <Badge tone={CASE_STATUS_TONE[c.status]}>{CASE_STATUS_LABEL[c.status].replace(' ', '')}</Badge>
                  </td>
                  <td>
                    <Link href={`/cases/${c.id}${meta.segment}`}>
                      <Icon name="arrow" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {subset.length === 0 && (
          <div className="empty">
            <span>⌕</span>
            <b>대상 Case가 없습니다.</b>
            <small>계약 진행이 시작되면 이곳에 표시됩니다.</small>
          </div>
        )}
      </div>
    </div>
  );
}
