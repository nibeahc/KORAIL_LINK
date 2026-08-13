'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCases } from '../../../lib/state';
import type { CaseMasterData, CostLedgerLine } from '../../../lib/types';
import { listDestinations, getRoute, buildRouteLabel } from '../../../lib/routeData';
import { buildQuoteDraft } from '../../../lib/quoteDraftEngine';
import { insertCaseStatusHistory } from '../../../lib/supabase';
import { QuoteValidationPanel } from '../../../components/QuoteValidationPanel';
import { PageTitle } from '../../../components/PageTitle';
import { Icon } from '../../../components/Icon';

const CONTAINER_TYPES = ['20FT', '40FT', '40FT HC'];
const INCOTERMS = ['FOB', 'CIF', 'CFR', 'EXW'];

type Step = 'form' | 'draft' | 'validate';

function nextCaseNumber(existing: string[]): string {
  const nums = existing.map((n) => parseInt(n.split('-').pop() ?? '0', 10)).filter((n) => !Number.isNaN(n));
  const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
  return `KL-2026-${String(next).padStart(4, '0')}`;
}

export default function NewQuotePage() {
  const router = useRouter();
  const { cases, setCasesAndPersist } = useCases();
  const [step, setStep] = useState<Step>('form');
  const [form, setForm] = useState({
    shipperName: '',
    cargoType: '',
    destination: listDestinations()[0]?.destination ?? '',
    containerType: CONTAINER_TYPES[0],
    containerCount: 1,
    totalWeightTon: 20,
    shipmentDate: '',
    incoterms: INCOTERMS[0],
  });
  const [lines, setLines] = useState<CostLedgerLine[]>([]);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const masterData: CaseMasterData = useMemo(
    () => ({
      shipperName: form.shipperName,
      cargoType: form.cargoType,
      origin: '오봉',
      destination: form.destination,
      containerType: form.containerType,
      containerCount: form.containerCount,
      totalWeightTon: form.totalWeightTon,
      shipmentDate: form.shipmentDate,
      incoterms: form.incoterms,
      changeHistory: [],
    }),
    [form]
  );

  const total = lines.reduce((sum, l) => sum + l.quotedAmount, 0);

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStep('draft');
  }

  async function handleGenerateDraft() {
    setGenerating(true);
    await new Promise((r) => setTimeout(r, 800));
    const draft = buildQuoteDraft(masterData);
    setLines(draft.lines);
    setGenerating(false);
    setStep('validate');
  }

  function updateLineAmount(stageId: string, value: number) {
    setLines((prev) => prev.map((l) => (l.stageId === stageId ? { ...l, quotedAmount: value, contractAmount: value } : l)));
  }

  async function handleConfirm() {
    setSubmitting(true);
    const route = getRoute(form.destination);
    const id = crypto.randomUUID();
    const caseNumber = nextCaseNumber(cases.map((c) => c.caseNumber));
    const newItem = {
      id,
      caseNumber,
      shipperName: form.shipperName,
      cargoType: form.cargoType,
      route: route ? buildRouteLabel(route) : form.destination,
      containerType: `${form.containerType} x ${form.containerCount}`,
      price: total,
      status: 'quote_confirmed' as const,
      createdAt: new Date().toISOString(),
      masterData,
      costLedger: lines,
    };
    setCasesAndPersist((prev) => [newItem, ...prev]);
    await insertCaseStatusHistory(id, 'pending_validation', 'quote_confirmed').catch(() => {});
    router.push(`/cases/${id}`);
  }

  return (
    <div className="page form-page">
      <PageTitle eyebrow="NEW QUOTE" title="견적 생성" desc="화물 기본정보와 구간별 원가를 입력해 AI 견적 초안과 적정성 검증을 받으세요." />

      {step === 'form' && (
        <form onSubmit={handleFormSubmit}>
          <section className="form-section card">
            <header>
              <span>01</span>
              <div>
                <h2>기본 운송정보</h2>
                <p>화물 및 운송 구간을 입력하세요.</p>
              </div>
            </header>
            <div className="form-grid">
              <TextField label="화주명" value={form.shipperName} set={(v) => setForm((f) => ({ ...f, shipperName: v }))} />
              <TextField label="품목" value={form.cargoType} set={(v) => setForm((f) => ({ ...f, cargoType: v }))} />
              <SelectField label="목적지" value={form.destination} set={(v) => setForm((f) => ({ ...f, destination: v }))} opts={listDestinations().map((r) => r.destination)} />
              <SelectField label="컨테이너 타입" value={form.containerType} set={(v) => setForm((f) => ({ ...f, containerType: v }))} opts={CONTAINER_TYPES} />
              <TextField label="컨테이너 수량" value={String(form.containerCount)} set={(v) => setForm((f) => ({ ...f, containerCount: Number(v) }))} type="number" suffix="대" />
              <TextField label="총중량" value={String(form.totalWeightTon)} set={(v) => setForm((f) => ({ ...f, totalWeightTon: Number(v) }))} type="number" suffix="ton" />
              <TextField label="출발 예정일" value={form.shipmentDate} set={(v) => setForm((f) => ({ ...f, shipmentDate: v }))} type="date" />
              <SelectField label="운송조건" value={form.incoterms} set={(v) => setForm((f) => ({ ...f, incoterms: v }))} opts={INCOTERMS} />
            </div>
          </section>
          <div className="form-actions">
            <span>
              <Icon name="info" /> 등록 즉시 내부 유사 견적 및 시장정보 분석이 시작됩니다.
            </span>
            <div>
              <button className="primary" type="submit">
                <Icon name="arrow" /> 다음: 구간별 원가 입력
              </button>
            </div>
          </div>
        </form>
      )}

      {step === 'draft' && (
        <section className="card quote-autofill">
          <span className="section-kicker">COST DOCUMENTS</span>
          <h2>구간별 원가 문서 업로드</h2>
          <p className="quote-autofill-desc">
            노선의 실제 구간 구성에 맞춰 AI가 구간별 금액을 산출합니다. 데모 단계라 실제 파일 내용은 읽지 않고, 방금 입력한 화물정보를 바탕으로 결정론적으로 생성합니다.
          </p>
          {generating ? (
            <div className="doc-loading">
              <span className="spinner" />
              구간별 원가를 산출하고 있습니다...
            </div>
          ) : (
            <button className="primary" onClick={handleGenerateDraft}>
              <Icon name="spark" /> 구간별 원가 산출 및 견적 초안 생성
            </button>
          )}
        </section>
      )}

      {step === 'validate' && (
        <>
          <section className="card quote-draft-result">
            <div className="card-head">
              <div>
                <span className="section-kicker">DRAFT QUOTE</span>
                <h2>구간별 견적 (직접 수정 가능)</h2>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>구간</th>
                  <th>항목</th>
                  <th>금액(USD)</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.stageId}>
                    <td>{line.stageName}</td>
                    <td>{line.mode}</td>
                    <td>
                      <input
                        type="number"
                        value={line.quotedAmount}
                        onChange={(e) => updateLineAmount(line.stageId, Number(e.target.value))}
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
                    <b>${total.toLocaleString()}</b>
                  </td>
                </tr>
              </tfoot>
            </table>
            <button className="primary" onClick={handleConfirm} disabled={submitting || lines.length === 0}>
              <Icon name="check" /> {submitting ? '확정 중…' : '견적 확정'}
            </button>
          </section>

          <QuoteValidationPanel masterData={masterData} total={total} />
        </>
      )}
    </div>
  );
}

function TextField({ label, value, set, type = 'text', suffix }: { label: string; value: string; set: (v: string) => void; type?: string; suffix?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div>
        <input required type={type} value={value} onChange={(e) => set(e.target.value)} />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  );
}

function SelectField({ label, value, set, opts }: { label: string; value: string; set: (v: string) => void; opts: string[] }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => set(e.target.value)}>
        {opts.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
