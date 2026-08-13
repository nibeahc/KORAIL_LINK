'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useCases } from '../../../../lib/state';
import { recommendClauses, SMGS_REFERENCE } from '../../../../lib/contractEngine';
import { insertCaseStatusHistory, upsertContract } from '../../../../lib/supabase';
import { getRoute } from '../../../../lib/routeData';
import type { ClauseStatus, ContractClause, CostLedgerLine, SignStatus } from '../../../../lib/types';

const STATUS_LABEL: Record<ClauseStatus, string> = { accepted: '반영', excluded: '제외', modified: '수정' };

export default function CaseContractPage() {
  const params = useParams<{ id: string }>();
  const { cases, setCasesAndPersist } = useCases();
  const item = cases.find((c) => c.id === params.id);

  const [clauses, setClauses] = useState<ContractClause[]>([]);
  const [ledgerDraft, setLedgerDraft] = useState<CostLedgerLine[]>([]);
  const [signStatus, setSignStatus] = useState<SignStatus>('none');
  const [signedAt, setSignedAt] = useState<string | undefined>();
  const [draftGenerated, setDraftGenerated] = useState(false);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    if (!item) return;
    setClauses(item.contract?.clauses ?? recommendClauses(item.masterData));
    setLedgerDraft(item.costLedger.map((l) => ({ ...l })));
    setSignStatus(item.contract?.signStatus ?? 'none');
    setSignedAt(item.contract?.signedAt);
    setDraftGenerated(!!item.contract);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  const contractTotal = ledgerDraft.reduce((sum, l) => sum + l.contractAmount, 0);
  const route = useMemo(() => (item ? getRoute(item.masterData.destination) : undefined), [item]);
  const locked = signStatus === 'signed';

  if (!item) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <p className="text-sm text-neutral-500">Case를 찾을 수 없습니다.</p>
      </main>
    );
  }

  if (item.costLedger.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-lg font-semibold text-neutral-900">계약</h1>
        <p className="mt-3 text-sm text-neutral-500">
          먼저 견적을 확정해야 계약을 진행할 수 있습니다.{' '}
          <a href={`/cases/${item.id}/validation`} className="underline">
            견적 검증으로 이동
          </a>
        </p>
      </main>
    );
  }

  function updateClauseStatus(id: string, status: ClauseStatus) {
    setClauses((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
  }

  function updateClauseText(id: string, text: string) {
    setClauses((prev) => prev.map((c) => (c.id === id ? { ...c, text, status: 'modified' } : c)));
  }

  function updateLedgerAmount(stageId: string, value: number) {
    setLedgerDraft((prev) => prev.map((l) => (l.stageId === stageId ? { ...l, contractAmount: value } : l)));
  }

  async function handleRequestSign() {
    setSigning(true);
    await new Promise((r) => setTimeout(r, 700));
    setSignStatus('pending');
    setSigning(false);
  }

  async function handleCompleteSign() {
    setSigning(true);
    await new Promise((r) => setTimeout(r, 700));
    const now = new Date().toISOString();
    setSignStatus('signed');
    setSignedAt(now);

    const previousStatus = item!.status;
    setCasesAndPersist((prev) =>
      prev.map((c) =>
        c.id === item!.id
          ? { ...c, status: 'contracted', costLedger: ledgerDraft, contract: { clauses, signStatus: 'signed', signedAt: now } }
          : c
      )
    );
    await insertCaseStatusHistory(item!.id, previousStatus, 'contracted').catch(() => {});
    await upsertContract(item!.id, { clauses, contractAmount: contractTotal, signStatus: 'signed', signedAt: now }).catch(() => {});
    setSigning(false);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-lg font-semibold text-neutral-900">계약</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {item.caseNumber} · {route?.usesTCR ? 'TCR 경유 노선' : '중국 내륙 직통 노선'} — 특약 {clauses.length}개 추천
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-medium text-neutral-700">적용 규정·특약 근거</h2>
        <p className="mt-1 text-xs text-neutral-400">계약서를 바로 생성하지 않고, 왜 이 특약이 필요한지 먼저 보여줍니다.</p>
        <div className="mt-3 space-y-3">
          {clauses.map((clause) => (
            <div key={clause.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{clause.title}</p>
                  <p className="mt-1 text-sm text-neutral-600">{clause.reason}</p>
                </div>
                <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600">{clause.basisType}</span>
              </div>
              {clause.basisSource && <p className="mt-2 text-xs text-neutral-400">근거 출처: {clause.basisSource}</p>}

              {clause.status === 'modified' && (
                <textarea
                  value={clause.text}
                  disabled={locked}
                  onChange={(e) => updateClauseText(clause.id, e.target.value)}
                  className="mt-3 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  rows={2}
                />
              )}

              <div className="mt-3 flex gap-2">
                {(['accepted', 'excluded', 'modified'] as ClauseStatus[]).map((s) => (
                  <button
                    key={s}
                    disabled={locked}
                    onClick={() => updateClauseStatus(clause.id, s)}
                    className={`rounded-full px-3 py-1 text-xs disabled:opacity-50 ${
                      clause.status === s ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {!draftGenerated && (
          <button
            onClick={() => setDraftGenerated(true)}
            className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            계약서 초안 생성
          </button>
        )}
      </section>

      {draftGenerated && (
        <section className="mt-8 rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-medium text-neutral-700">계약서 초안</h2>
          <div className="mt-3 space-y-1 text-sm text-neutral-700">
            <p>당사자: 코레일 ↔ {item.masterData.shipperName}</p>
            <p>노선: {item.route}</p>
            <p>운송조건: {item.masterData.incoterms}</p>
            <p>계약금액: ${contractTotal.toLocaleString()}</p>
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">본문 특약</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
              {clauses.filter((c) => c.status !== 'excluded').map((c) => (
                <li key={c.id}>{c.text}</li>
              ))}
            </ul>
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium text-neutral-400">별첨 1 — 구간별 운임 명세 (견적 단계 Cost Ledger 기준)</p>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-400">
                  <th className="py-2">구간</th>
                  <th className="py-2">항목</th>
                  <th className="py-2 text-right">계약금액(USD)</th>
                </tr>
              </thead>
              <tbody>
                {ledgerDraft.map((l) => (
                  <tr key={l.stageId} className="border-b border-neutral-100 last:border-0">
                    <td className="py-2">{l.stageName}</td>
                    <td className="py-2 text-neutral-500">{l.mode}</td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        disabled={locked}
                        value={l.contractAmount}
                        onChange={(e) => updateLedgerAmount(l.stageId, Number(e.target.value))}
                        className="w-28 rounded-md border border-neutral-300 px-2 py-1 text-right text-sm disabled:bg-neutral-50"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 text-xs text-neutral-400">
            참조 지식베이스: {SMGS_REFERENCE.map((r) => `${r.title}(${r.article})`).join(', ')}
          </div>

          <div className="mt-6 border-t border-neutral-200 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">전자서명 (시뮬레이션 — 법적 효력 없음)</p>
            <div className="mt-2 flex items-center gap-3">
              <span
                className={`rounded-full px-2.5 py-1 text-xs ${
                  signStatus === 'signed'
                    ? 'bg-green-100 text-green-700'
                    : signStatus === 'pending'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {signStatus === 'signed' ? '서명 완료' : signStatus === 'pending' ? '서명 요청됨' : '서명 전'}
              </span>
              {signedAt && <span className="text-xs text-neutral-400">{new Date(signedAt).toLocaleString('ko-KR')}</span>}
            </div>

            {signStatus === 'none' && (
              <button
                onClick={handleRequestSign}
                disabled={signing}
                className="mt-3 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {signing ? '요청 중…' : '서명 요청'}
              </button>
            )}
            {signStatus === 'pending' && (
              <button
                onClick={handleCompleteSign}
                disabled={signing}
                className="mt-3 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {signing ? '처리 중…' : '서명 완료'}
              </button>
            )}
            {signStatus === 'signed' && (
              <p className="mt-3 text-sm text-neutral-500">
                서명이 완료되어 특약·계약금액·Cost Ledger가 정산 기준선으로 고정되었습니다.
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
