'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCases } from '../../lib/state';
import { CASE_STATUS_LABEL, CASE_STATUS_TONE, type CaseStatus } from '../../lib/types';
import { PageTitle } from '../../components/PageTitle';
import { Badge } from '../../components/Badge';
import { Icon } from '../../components/Icon';

const FILTERS: ('전체' | CaseStatus)[] = ['전체', 'pending_validation', 'needs_review', 'quote_confirmed', 'contracted', 'settlement'];

export default function CaseListPage() {
  const router = useRouter();
  const { cases, loading } = useCases();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'전체' | CaseStatus>('전체');

  const filtered = cases.filter(
    (c) =>
      (filter === '전체' || c.status === filter) &&
      `${c.shipperName} ${c.route} ${c.caseNumber} ${c.cargoType}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="page figma-case-list">
      <PageTitle
        eyebrow="SHIPMENT MANAGEMENT"
        title="화물 운송"
        desc="화물 운송 건을 등록해 견적 검증부터 계약·정산까지 한 곳에서 관리하세요."
        action={
          <Link href="/quotes/new" className="primary case-create">
            <Icon name="plus" /> 새 화물 운송 건 등록
          </Link>
        }
      />

      <div className="filters card">
        <label className="searchbox">
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="화주, 노선, Case 번호 검색" />
        </label>
        <div className="chips">
          {FILTERS.map((x) => (
            <button key={x} className={filter === x ? 'active' : ''} onClick={() => setFilter(x)}>
              {x === '전체' ? '전체' : CASE_STATUS_LABEL[x]}
            </button>
          ))}
        </div>
      </div>

      <div className="table-card card">
        <div className="table-summary">
          <b>전체 견적</b>
          <span>{filtered.length}건</span>
        </div>
        <div className="case-table-scroll">
          <table>
            <thead>
              <tr>
                <th>CASE 번호</th>
                <th>화주 / 품목</th>
                <th>노선</th>
                <th>견적</th>
                <th>상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  tabIndex={0}
                  role="link"
                  onClick={() => router.push(`/cases/${c.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      router.push(`/cases/${c.id}`);
                    }
                  }}
                >
                  <td>
                    <b>{c.caseNumber}</b>
                  </td>
                  <td>
                    <b>{c.shipperName}</b>
                    <small>
                      {c.cargoType} · {c.containerType}
                    </small>
                  </td>
                  <td>{c.route}</td>
                  <td>
                    <strong>${c.price.toLocaleString()}</strong>
                  </td>
                  <td>
                    <Badge tone={CASE_STATUS_TONE[c.status]}>{CASE_STATUS_LABEL[c.status].replace(' ', '')}</Badge>
                  </td>
                  <td>
                    <Icon name="arrow" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 && (
          <div className="empty">
            <span>⌕</span>
            <b>검색 결과가 없습니다.</b>
            <small>검색어나 필터를 다시 확인해주세요.</small>
          </div>
        )}
      </div>
    </div>
  );
}
