'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCases } from '../../../lib/state';
import type { CaseMasterData, CostLedgerLine } from '../../../lib/types';
import { listDestinations, getRoute, buildRouteLabel } from '../../../lib/routeData';
import { buildQuoteDraft } from '../../../lib/quoteDraftEngine';
import { insertCaseStatusHistory } from '../../../lib/supabase';
import { QuoteValidationPanel } from '../../../components/QuoteValidationPanel';

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

  function handleGenerateDraft() {
    const draft = buildQuoteDraft(masterData);
    setLines(draft.lines);
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
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-lg font-semibold text-neutral-900">견적 생성</h1>

      {step === 'form' && (
        <form onSubmit={handleFormSubmit} className="mt-6 space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
          <p className="text-sm text-neutral-500">화물 기본정보를 입력해 Case Master Data 초기값을 만듭니다.</p>
          <div className="grid grid-cols-2 gap-4">
            <TextField label="화주명" value={form.shipperName} onChange={(v) => setForm((f) => ({ ...f, shipperName: v }))} required />
            <TextField label="품목" value={form.cargoType} onChange={(v) => setForm((f) => ({ ...f, cargoType: v }))} required />
            <SelectField
              label="목적지"
              value={form.destination}
              options={listDestinations().map((r) => r.destination)}
              onChange={(v) => setForm((f) => ({ ...f, destination: v }))}
            />
            <SelectField
              label="컨테이너 타입"
              value={form.containerType}
              options={CONTAINER_TYPES}
              onChange={(v) => setForm((f) => ({ ...f, containerType: v }))}
            />
            <NumberField
              label="컨테이너 수량"
              value={form.containerCount}
              onChange={(v) => setForm((f) => ({ ...f, containerCount: v }))}
              min={1}
            />
            <NumberField
              label="총중량(t)"
              value={form.totalWeightTon}
              onChange={(v) => setForm((f) => ({ ...f, totalWeightTon: v }))}
              min={0.1}
              step={0.1}
            />
            <div>
              <label className="block text-sm font-medium text-neutral-700">출발 예정일</label>
              <input
                type="date"
                required
                value={form.shipmentDate}
                onChange={(e) => setForm((f) => ({ ...f, shipmentDate: e.target.value }))}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              />
            </div>
            <SelectField
              label="운송조건"
              value={form.incoterms}
              options={INCOTERMS}
              onChange={(v) => setForm((f) => ({ ...f, incoterms: v }))}
            />
          </div>
          <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
            다음: 구간별 원가 문서 업로드
          </button>
        </form>
      )}

      {step === 'draft' && (
        <div className="mt-6 space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
          <p className="text-sm text-neutral-500">
            구간별 원가 문서를 업로드하세요. (데모 단계 — 실제 파일 내용은 읽지 않고, Case 정보를 바탕으로 구간별 금액을 산출합니다.)
          </p>
          <input type="file" multiple className="block text-sm text-neutral-600" />
          <button
            onClick={handleGenerateDraft}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            견적 초안 생성
          </button>
        </div>
      )}

      {step === 'validate' && (
        <div className="mt-6 space-y-6">
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="text-sm font-medium text-neutral-700">구간별 견적 (금액은 직접 수정할 수 있습니다)</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-400">
                  <th className="py-2">구간</th>
                  <th className="py-2">항목</th>
                  <th className="py-2 text-right">금액(USD)</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.stageId} className="border-b border-neutral-100 last:border-0">
                    <td className="py-2">{line.stageName}</td>
                    <td className="py-2 text-neutral-500">{line.mode}</td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        value={line.quotedAmount}
                        onChange={(e) => updateLineAmount(line.stageId, Number(e.target.value))}
                        className="w-28 rounded-md border border-neutral-300 px-2 py-1 text-right text-sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="pt-2 text-right text-xs text-neutral-400">
                    합계
                  </td>
                  <td className="pt-2 text-right font-semibold">${total.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div>
            <h2 className="text-sm font-medium text-neutral-700">AI 견적 적정성 검증</h2>
            <div className="mt-3">
              <QuoteValidationPanel masterData={masterData} total={total} />
            </div>
          </div>

          <button
            onClick={handleConfirm}
            disabled={submitting || lines.length === 0}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {submitting ? '확정 중…' : '견적 확정'}
          </button>
        </div>
      )}
    </main>
  );
}

function TextField({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700">{label}</label>
      <input
        type="text"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700">{label}</label>
      <input
        type="number"
        required
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
      />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
