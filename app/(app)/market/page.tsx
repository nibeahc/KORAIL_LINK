'use client';

import { useState } from 'react';
import { SERIES, type IndicatorKey } from '../../lib/marketData';
import { buildCausalAnalysis, type CausalAnalysis } from '../../lib/causalAnalysis';
import { MarketCard } from '../../components/MarketCard';
import { EvidenceDrawer } from '../../components/EvidenceDrawer';

const GROUPS: { title: string; indicators: IndicatorKey[] }[] = [
  { title: '환율', indicators: ['usdKrw', 'cnyKrw', 'usdKzt', 'usdUzs', 'usdKgs'] },
  { title: '유가·해상운임', indicators: ['brent', 'kcci', 'kci'] },
];

export default function MarketPage() {
  const [drawer, setDrawer] = useState<CausalAnalysis | null>(null);

  function openDrawer(indicator: IndicatorKey) {
    setDrawer(buildCausalAnalysis(indicator, SERIES[indicator]));
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-lg font-semibold text-neutral-900">시황</h1>
      <p className="mt-1 text-sm text-neutral-500">최근 30일 시계열과 이상탐지 결과입니다. 카드를 클릭하면 근거를 볼 수 있습니다.</p>

      {GROUPS.map((group) => (
        <section key={group.title} className="mt-6">
          <h2 className="text-sm font-medium text-neutral-700">{group.title}</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.indicators.map((ind) => (
              <MarketCard key={ind} indicator={ind} onClick={openDrawer} />
            ))}
          </div>
        </section>
      ))}

      <EvidenceDrawer analysis={drawer} onClose={() => setDrawer(null)} />
    </main>
  );
}
