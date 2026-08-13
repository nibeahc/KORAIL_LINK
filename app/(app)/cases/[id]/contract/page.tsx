'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useCases } from '../../../../lib/state';
import { recommendClauses } from '../../../../lib/contractEngine';
import { createContractApproval, decideContractApproval, insertCaseStatusHistory, listContractApprovals, replaceCostLedger, upsertContract, type ContractApproval } from '../../../../lib/supabase';
import { getRoute } from '../../../../lib/routeData';
import type { ClauseStatus, ContractClause, CostLedgerLine, SignStatus } from '../../../../lib/types';
import { CaseHeader } from '../../../../components/CaseHeader';
import { CaseTabs } from '../../../../components/CaseTabs';
import { Badge } from '../../../../components/Badge';
import { Icon } from '../../../../components/Icon';

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
  const [loadedItemId, setLoadedItemId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [signing, setSigning] = useState(false);
  const [approvals, setApprovals] = useState<ContractApproval[]>([]);
  const [approverName, setApproverName] = useState('');
  const [approverEmail, setApproverEmail] = useState('');
  const [approvalComment, setApprovalComment] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  if (item && item.id !== loadedItemId) {
    setLoadedItemId(item.id);
    setClauses(item.contract?.clauses ?? recommendClauses(item.masterData));
    setLedgerDraft(item.costLedger.map((l) => ({ ...l })));
    setSignStatus(item.contract?.signStatus ?? 'none');
    setSignedAt(item.contract?.signedAt);
    setDraftGenerated(!!item.contract);
  }

  useEffect(() => {
    if (!item) return;
    void refreshApprovals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  async function refreshApprovals() {
    if (!item) return;
    setApprovals(await listContractApprovals(item.id).catch(() => []));
  }

  function drawSignature(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || event.buttons !== 1) return;
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext('2d');
    if (!context) return;
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.strokeStyle = '#111827';
    context.lineTo(x, y);
    context.stroke();
    context.beginPath();
    context.moveTo(x, y);
  }

  async function addApprover() {
    if (!item || !approverName.trim()) return;
    await upsertContract(item.id, { clauses, contractAmount: contractTotal, signStatus, signedAt });
    await createContractApproval(item.id, approverName.trim(), approverEmail.trim());
    setApproverName('');
    setApproverEmail('');
    await refreshApprovals();
  }

  async function decideApproval(id: string, status: 'approved' | 'rejected') {
    const signature = status === 'approved' ? canvasRef.current?.toDataURL('image/png') : undefined;
    await decideContractApproval(id, status, approvalComment, signature);
    setApprovalComment('');
    await refreshApprovals();
  }

  const contractTotal = ledgerDraft.reduce((sum, l) => sum + l.contractAmount, 0);
  const route = useMemo(() => (item ? getRoute(item.masterData.destination) : undefined), [item]);
  const locked = signStatus === 'signed';

  if (!item) {
    return (
      <div className="page">
        <p style={{ color: 'var(--muted)', fontSize: 12 }}>Case를 찾을 수 없습니다.</p>
      </div>
    );
  }

  if (item.costLedger.length === 0) {
    return (
      <div className="case-workspace">
        <CaseHeader item={item} />
        <CaseTabs caseId={item.id} />
        <div className="workspace-body">
          <p style={{ color: 'var(--muted)', fontSize: 12 }}>
            먼저 견적을 확정해야 계약을 진행할 수 있습니다.{' '}
            <a href={`/cases/${item.id}/validation`} style={{ color: 'var(--blue)' }}>
              견적 검증으로 이동
            </a>
          </p>
        </div>
      </div>
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

  async function handleGenerateDraft() {
    setGenerating(true);
    await new Promise((r) => setTimeout(r, 900));
    setDraftGenerated(true);
    setGenerating(false);
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
        c.id === item!.id ? { ...c, status: 'contracted', costLedger: ledgerDraft, contract: { clauses, signStatus: 'signed', signedAt: now } } : c
      )
    );
    await insertCaseStatusHistory(item!.id, previousStatus, 'contracted').catch(() => {});
    await upsertContract(item!.id, { clauses, contractAmount: contractTotal, signStatus: 'signed', signedAt: now }).catch(() => {});
    await replaceCostLedger(
      item!.id,
      ledgerDraft.map((line) => ({
        stageId: line.stageId,
        stageName: line.stageName,
        mode: line.mode,
        costItem: line.stageName,
        quotedAmount: line.quotedAmount,
        contractAmount: line.contractAmount,
        currency: line.currency,
        sourceType: 'contract',
      }))
    ).catch(() => {});
    setSigning(false);
  }

  return (
    <div className="case-workspace">
      <CaseHeader item={item} />
      <CaseTabs caseId={item.id} />

      <div className="workspace-body">
        <div className="validation-title">
          <div>
            <span className="section-kicker">CONTRACT WORKSPACE</span>
            <h2>계약 특약 초안</h2>
            <p>
              {item.caseNumber} · {route?.usesTCR ? 'TCR 경유 노선' : '중국 내륙 직통 노선'} — 추천 특약 {clauses.length}개
            </p>
          </div>
        </div>

        <div className="notice">
          <Icon name="info" />
          <span>
            <b>담당자 검토가 필요합니다.</b> 왜 이 특약이 필요한지 근거를 먼저 확인한 뒤 반영·제외·수정을 선택하세요.
          </span>
        </div>

        <div className="clauses">
          {clauses.map((clause) => (
            <section className="card" key={clause.id}>
              <header>
                <h3>{clause.title}</h3>
                <Badge tone={clause.basisType === '협약' ? 'blue' : clause.basisType === 'AI 리스크 권고' ? 'amber' : 'green'}>{clause.basisType}</Badge>
              </header>
              <p>{clause.reason}</p>
              {clause.basisSource && (
                <p style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>근거 출처: {clause.basisSource}</p>
              )}
              {clause.status === 'modified' && (
                <textarea
                  className="clause-body-input"
                  value={clause.text}
                  disabled={locked}
                  onChange={(e) => updateClauseText(clause.id, e.target.value)}
                  rows={2}
                />
              )}
              <div className="clause-edit-actions" style={{ marginTop: 10 }}>
                {(['accepted', 'excluded', 'modified'] as ClauseStatus[]).map((s) => (
                  <button
                    key={s}
                    disabled={locked}
                    onClick={() => updateClauseStatus(clause.id, s)}
                    style={clause.status === s ? { background: 'var(--navy)', color: 'white', borderColor: 'var(--navy)' } : undefined}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        {!draftGenerated && !generating && (
          <button className="primary" onClick={handleGenerateDraft} style={{ marginTop: 16 }}>
            <Icon name="spark" /> 계약서 초안 생성
          </button>
        )}
        {generating && (
          <div className="card loading">
            <span className="spinner" />
            <b>특약을 반영해 계약서 초안을 작성하고 있습니다...</b>
          </div>
        )}

        {draftGenerated && (
          <>
            <section className="card rate-schedule">
              <div className="card-head">
                <div>
                  <span className="section-kicker">SCHEDULE OF RATES</span>
                  <h3>별첨 1 — 구간별 운임 명세</h3>
                </div>
              </div>
              <p className="schedule-desc">견적 확정 시 저장된 Cost Ledger를 그대로 옮긴 별첨입니다. 서명 전까지는 금액을 수정할 수 있습니다.</p>
              <table className="schedule-table">
                <thead>
                  <tr>
                    <th>구간</th>
                    <th>운송 방식</th>
                    <th>계약금액(USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerDraft.map((l) => (
                    <tr key={l.stageId}>
                      <td>{l.stageName}</td>
                      <td>{l.mode}</td>
                      <td>
                        <input
                          type="number"
                          disabled={locked}
                          value={l.contractAmount}
                          onChange={(e) => updateLedgerAmount(l.stageId, Number(e.target.value))}
                          style={{ width: 100, textAlign: 'right', border: '1px solid #dce2e9', borderRadius: 6, padding: '4px 6px' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>합계</td>
                    <td>
                      <b>${contractTotal.toLocaleString()}</b>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <section className="card e-signature">
              <div className="card-head">
                <div>
                  <span className="section-kicker">E-SIGNATURE</span>
                  <h3>전자서명</h3>
                </div>
                {signStatus === 'signed' && <Badge tone="green">서명 완료</Badge>}
              </div>
              {signStatus === 'none' && (
                <div className="sign-empty">
                  <p>
                    화주({item.masterData.shipperName})와 코레일 양측의 전자서명이 필요합니다.
                  </p>
                  <button className="primary" onClick={handleRequestSign} disabled={signing}>
                    <Icon name="spark" /> {signing ? '요청 중…' : '전자서명 요청'}
                  </button>
                </div>
              )}
              {signStatus === 'pending' && (
                <div className="doc-loading">
                  <span className="spinner" />
                  화주·코레일 서명을 요청하고 있습니다...
                  <button className="primary" onClick={handleCompleteSign} disabled={signing} style={{ marginLeft: 12 }}>
                    {signing ? '처리 중…' : '서명 완료 처리'}
                  </button>
                </div>
              )}
              {signStatus === 'signed' && signedAt && (
                <div className="sign-done">
                  <div>
                    <b>{item.masterData.shipperName}</b>
                    <small>화주 · 서명 완료 · {new Date(signedAt).toLocaleString('ko-KR')}</small>
                  </div>
                  <div>
                    <b>코레일</b>
                    <small>운송인 · 서명 완료 · {new Date(signedAt).toLocaleString('ko-KR')}</small>
                  </div>
                </div>
              )}
              <small className="hint">법적 효력이 있는 전자서명이 아니라 데모용 시뮬레이션입니다.</small>
            </section>

            <section className="card" style={{ marginTop: 16 }}>
              <div className="card-head">
                <div>
                  <span className="section-kicker">INTERNAL APPROVAL</span>
                  <h3>내부 결재 기록</h3>
                </div>
              </div>
              <p className="hint">내부 승인 기록용이며, 법적 전자서명이나 본인인증을 대체하지 않습니다.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginTop: 12 }}>
                <input value={approverName} onChange={(e) => setApproverName(e.target.value)} placeholder="결재자 이름" />
                <input value={approverEmail} onChange={(e) => setApproverEmail(e.target.value)} placeholder="이메일 (선택)" />
                <button className="primary" onClick={addApprover}>결재자 추가</button>
              </div>
              <textarea value={approvalComment} onChange={(e) => setApprovalComment(e.target.value)} placeholder="승인 또는 반려 의견" rows={2} style={{ width: '100%', marginTop: 10 }} />
              <canvas ref={canvasRef} width={600} height={160} onPointerDown={(e) => { e.currentTarget.getContext('2d')?.beginPath(); drawSignature(e); }} onPointerMove={drawSignature} style={{ width: '100%', height: 96, marginTop: 10, border: '1px dashed #dce2e9', borderRadius: 6, touchAction: 'none' }} />
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                {approvals.length === 0 && <p className="hint">등록된 결재자가 없습니다.</p>}
                {approvals.map((approval) => (
                  <div key={approval.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 6, padding: 10 }}>
                    <span><b>{approval.approverName}</b> · {approval.status}{approval.comment ? ` · ${approval.comment}` : ''}</span>
                    {approval.status === 'pending' && <span style={{ display: 'flex', gap: 6 }}><button onClick={() => decideApproval(approval.id, 'approved')}>승인</button><button onClick={() => decideApproval(approval.id, 'rejected')}>반려</button></span>}
                  </div>
                ))}
              </div>
              <button onClick={refreshApprovals} style={{ marginTop: 10 }}>결재 이력 새로고침</button>
            </section>

            <div className="form-actions">
              <span>
                <Icon name="info" /> {signStatus === 'signed' ? '서명이 완료되어 Cost Ledger가 정산 기준선으로 고정되었습니다.' : '전자서명을 완료해야 계약이 확정됩니다.'}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
