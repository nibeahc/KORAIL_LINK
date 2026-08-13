'use client';

import { useState } from 'react';
import { SERIES, type IndicatorKey } from '../../lib/marketData';
import { buildCausalAnalysis, type CausalAnalysis } from '../../lib/causalAnalysis';
import { MarketCard } from '../../components/MarketCard';
import { EvidenceDrawer } from '../../components/EvidenceDrawer';
import { PageTitle } from '../../components/PageTitle';

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
    <div className="page">
      <PageTitle eyebrow="MARKET" title="시황" desc="최근 30일 시계열과 이상탐지 결과입니다. 카드를 클릭하면 근거를 볼 수 있습니다." />

      {GROUPS.map((group) => (
        <section key={group.title} style={{ marginBottom: 19 }}>
          <div className="card-head" style={{ marginBottom: 12 }}>
            <div>
              <span className="section-kicker">{group.title}</span>
            </div>
          </div>
          <div className="market-strip" style={{ gridTemplateColumns: `repeat(${group.indicators.length}, 1fr)` }}>
            {group.indicators.map((ind) => (
              <MarketCard key={ind} indicator={ind} onClick={openDrawer} />
            ))}
          </div>
        </section>
      ))}

      <EvidenceDrawer analysis={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
