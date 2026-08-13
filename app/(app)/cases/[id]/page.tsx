'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useCases } from '../../../lib/state';
import { getRoute } from '../../../lib/routeData';
import { relevantIndicatorsForRoute, SERIES } from '../../../lib/marketData';
import { getSeasonalSignal } from '../../../lib/seasonality';
import { buildCausalAnalysis, type CausalAnalysis } from '../../../lib/causalAnalysis';
import { Badge } from '../../../components/Badge';
import { Icon } from '../../../components/Icon';
import { EvidenceDrawer } from '../../../components/EvidenceDrawer';
import { CaseHeader } from '../../../components/CaseHeader';
import { CaseTabs } from '../../../components/CaseTabs';

export default function CaseOverviewPage() {
  const params = useParams<{ id: string }>();
  const { cases } = useCases();
  const [drawer, setDrawer] = useState<CausalAnalysis | null>(null);
  const item = cases.find((c) => c.id === params.id);

  if (!item) {
    return (
      <div className="page">
        <p style={{ color: 'var(--muted)', fontSize: 12 }}>Case를 찾을 수 없습니다.</p>
      </div>
    );
  }

  const route = getRoute(item.masterData.destination);
  const indicators = route ? relevantIndicatorsForRoute(route) : [];
  const seasonal = getSeasonalSignal(item.masterData.shipmentDate);
  const stages = item.costLedger;

  return (
    <div className="case-workspace">
      <CaseHeader item={item} />
      <CaseTabs caseId={item.id} />

      <div className="workspace-body">
        <div className="overview-grid">
          <section className="card route-card">
            <div className="card-head">
              <div>
                <span className="section-kicker">TRANSPORT</span>
                <h2>운송정보</h2>
              </div>
              <Badge>{stages.length}개 구간</Badge>
            </div>
            <div className="route-line">
              {stages.map((s, i) => (
                <div key={s.stageId}>
                  <span>{i === 0 ? 'K' : i === stages.length - 1 ? '◎' : s.mode.includes('해상') ? '⚓' : '⇄'}</span>
                  <b>{s.stageName}</b>
                  <small>{s.mode}</small>
                  {i < stages.length - 1 && <i />}
                </div>
              ))}
            </div>
          </section>

          <section className="card quote-detail">
            <span className="section-kicker">CONFIRMED QUOTE</span>
            <h2>확정 견적</h2>
            <strong>${item.price.toLocaleString()}</strong>
            <b>코레일</b>
            <dl>
              <div>
                <dt>화주</dt>
                <dd>{item.masterData.shipperName}</dd>
              </div>
              <div>
                <dt>출발 예정일</dt>
                <dd>{item.masterData.shipmentDate}</dd>
              </div>
              <div>
                <dt>결제 통화</dt>
                <dd>USD</dd>
              </div>
              <div>
                <dt>TCR 경유</dt>
                <dd>{route?.usesTCR ? '경유' : '미경유(중국 내륙 직통)'}</dd>
              </div>
              <div>
                <dt>계절성</dt>
                <dd>{seasonal.label}</dd>
              </div>
            </dl>
          </section>

          <section className="card full table-card">
            <div className="table-summary">
              <b>구간별 Cost Ledger</b>
              <span>{stages.length}개 항목</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>구간</th>
                  <th>항목</th>
                  <th>견적금액</th>
                  <th>계약금액</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((line) => (
                  <tr key={line.stageId}>
                    <td>
                      <b>{line.stageName}</b>
                    </td>
                    <td>{line.mode}</td>
                    <td>${line.quotedAmount.toLocaleString()}</td>
                    <td>${line.contractAmount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <section className="card weekly-briefing" style={{ marginTop: 17 }}>
          <div className="card-head">
            <div>
              <span className="section-kicker">MARKET SIGNALS</span>
              <h2>현재 시장정보</h2>
              <p>이 Case의 노선({route?.usesTCR ? 'TCR 경유' : '중국 내륙 직통'})에 관련된 지표만 표시합니다.</p>
            </div>
          </div>
          <div className="wb-indicators">
            {indicators.map((ind) => (
              <MarketWbCard key={ind} indicator={ind} onOpen={() => setDrawer(buildCausalAnalysis(ind, SERIES[ind]))} />
            ))}
          </div>
        </section>
      </div>

      <EvidenceDrawer analysis={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}

function MarketWbCard({ indicator, onOpen }: { indicator: Parameters<typeof buildCausalAnalysis>[0]; onOpen: () => void }) {
  const anomaly = buildCausalAnalysis(indicator, SERIES[indicator]);
  return (
    <button className="wb-indicator" onClick={onOpen}>
      <span className={`wb-dir ${anomaly.changePct >= 0 ? 'up' : 'down'}`}>{anomaly.changePct >= 0 ? '▲' : '▼'}</span>
      <div>
        <b>{anomaly.label}</b>
        <span>
          {anomaly.changePct >= 0 ? '+' : ''}
          {anomaly.changePct.toFixed(1)}% · z={anomaly.zScore.toFixed(1)}
        </span>
      </div>
      <Icon name="arrow" />
    </button>
  );
}
