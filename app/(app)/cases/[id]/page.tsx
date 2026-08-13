'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useCases } from '../../../lib/state';
import { getRoute } from '../../../lib/routeData';
import { relevantIndicatorsForRoute, SERIES } from '../../../lib/marketData';
import { getSeasonalSignal } from '../../../lib/seasonality';
import { buildCausalAnalysis, type CausalAnalysis } from '../../../lib/causalAnalysis';
import { CASE_STATUS_LABEL } from '../../../lib/types';
import { MarketCard } from '../../../components/MarketCard';
import { EvidenceDrawer } from '../../../components/EvidenceDrawer';

export default function CaseOverviewPage() {
  const params = useParams<{ id: string }>();
  const { cases } = useCases();
  const [drawer, setDrawer] = useState<CausalAnalysis | null>(null);
  const item = cases.find((c) => c.id === params.id);

  if (!item) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-8">
        <p className="text-sm text-neutral-500">Case를 찾을 수 없습니다.</p>
      </main>
    );
  }

  const route = getRoute(item.masterData.destination);
  const indicators = route ? relevantIndicatorsForRoute(route) : [];
  const seasonal = getSeasonalSignal(item.masterData.shipmentDate);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">
            {item.caseNumber} · {item.shipperName}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">{item.route}</p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700">{CASE_STATUS_LABEL[item.status]}</span>
      </div>

      <section className="mt-6 grid grid-cols-2 gap-4 rounded-lg border border-neutral-200 bg-white p-5 sm:grid-cols-4">
        <Field label="화주" value={item.masterData.shipperName} />
        <Field label="품목" value={item.masterData.cargoType} />
        <Field label="컨테이너" value={`${item.masterData.containerType} x ${item.masterData.containerCount}`} />
        <Field label="총중량" value={`${item.masterData.totalWeightTon}t`} />
        <Field label="운송조건" value={item.masterData.incoterms} />
        <Field label="출발 예정일" value={item.masterData.shipmentDate} />
        <Field label="TCR 경유" value={route?.usesTCR ? '경유' : '미경유(중국 내륙 직통)'} />
        <Field label="계절성" value={`${seasonal.label} · ${seasonal.reason}`} />
      </section>

      <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-medium text-neutral-700">구간별 Cost Ledger</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-400">
              <th className="py-2">구간</th>
              <th className="py-2">항목</th>
              <th className="py-2 text-right">견적금액</th>
              <th className="py-2 text-right">계약금액</th>
            </tr>
          </thead>
          <tbody>
            {item.costLedger.map((line) => (
              <tr key={line.stageId} className="border-b border-neutral-100 last:border-0">
                <td className="py-2">{line.stageName}</td>
                <td className="py-2 text-neutral-500">{line.mode}</td>
                <td className="py-2 text-right">${line.quotedAmount.toLocaleString()}</td>
                <td className="py-2 text-right">${line.contractAmount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="pt-2 text-right text-xs text-neutral-400">
                합계
              </td>
              <td className="pt-2 text-right font-medium">${item.price.toLocaleString()}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-medium text-neutral-700">현재 시장정보</h2>
        <p className="mt-1 text-xs text-neutral-400">
          이 Case의 노선({route?.usesTCR ? 'TCR 경유' : '중국 내륙 직통'})에 관련된 지표만 표시합니다.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {indicators.map((ind) => (
            <MarketCard key={ind} indicator={ind} onClick={(i) => setDrawer(buildCausalAnalysis(i, SERIES[i]))} />
          ))}
        </div>
      </section>

      <EvidenceDrawer analysis={drawer} onClose={() => setDrawer(null)} />
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-neutral-900">{value}</p>
    </div>
  );
}
