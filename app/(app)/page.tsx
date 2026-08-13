'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useCases } from '../lib/state';
import { CASE_STATUS_LABEL, CASE_STATUS_TONE, CASE_STATUS_DONUT_COLOR, type CaseStatus } from '../lib/types';
import { buildCompositeIndex, historicalQuotes, SERIES, type IndicatorKey } from '../lib/marketData';
import { buildCausalAnalysis, type CausalAnalysis } from '../lib/causalAnalysis';
import { thisWeekBriefingNews } from '../lib/newsData';
import { getRoute } from '../lib/routeData';
import { validateQuote, VERDICT_LABEL, type QuoteVerdict } from '../lib/quoteEngine';
import { DonutChart } from '../components/charts/DonutChart';
import { IndexChart } from '../components/charts/IndexChart';
import { MarketCard } from '../components/MarketCard';
import { EvidenceDrawer } from '../components/EvidenceDrawer';
import { PageTitle } from '../components/PageTitle';
import { Badge } from '../components/Badge';
import { Icon } from '../components/Icon';

const INDICATORS: IndicatorKey[] = ['usdKrw', 'cnyKrw', 'usdKzt', 'usdUzs', 'usdKgs', 'brent', 'kcci', 'kci'];
const STATUS_ORDER: CaseStatus[] = ['pending_validation', 'needs_review', 'quote_confirmed', 'contracted', 'settlement'];

const VERDICT_TONE: Record<QuoteVerdict, 'red' | 'amber' | 'green'> = {
  appropriate: 'green',
  slightly_high: 'amber',
  high: 'red',
  slightly_low: 'amber',
  low: 'red',
  insufficient_data: 'amber',
};

type LiveNewsArticle = { id: string; title: string; summary: string; url: string; source: string; publishedAt: string; category: string };
type LiveRates = Partial<Record<IndicatorKey, number>>;

export default function DashboardPage() {
  const { cases } = useCases();
  const [drawer, setDrawer] = useState<CausalAnalysis | null>(null);
  const [liveBriefing, setLiveBriefing] = useState<LiveNewsArticle[]>([]);
  const [liveRates, setLiveRates] = useState<LiveRates>({});

  const statusCounts = useMemo(() => {
    const counts: Record<CaseStatus, number> = {
      pending_validation: 0,
      needs_review: 0,
      quote_confirmed: 0,
      contracted: 0,
      settlement: 0,
    };
    for (const c of cases) counts[c.status] += 1;
    return counts;
  }, [cases]);

  const kpis = useMemo(() => {
    let tcrCount = 0;
    let directChinaCount = 0;
    let leadTimeSum = 0;
    for (const c of cases) {
      const route = getRoute(c.masterData.destination);
      if (route?.usesTCR) tcrCount += 1;
      if (route && !route.usesTCR) directChinaCount += 1;
      const created = new Date(c.createdAt).getTime();
      const shipment = new Date(c.masterData.shipmentDate).getTime();
      leadTimeSum += Math.max(0, Math.round((shipment - created) / (1000 * 60 * 60 * 24)));
    }
    return {
      tcrCount,
      directChinaCount,
      avgLeadTime: cases.length > 0 ? Math.round(leadTimeSum / cases.length) : 0,
    };
  }, [cases]);

  const verdicts = useMemo(
    () =>
      cases.map((item) => {
        const total = item.costLedger.reduce((s, l) => s + l.quotedAmount, 0) || item.price;
        const verdict = validateQuote(
          total,
          {
            route: item.masterData.destination,
            containerType: item.masterData.containerType,
            cargoType: item.masterData.cargoType,
            shipmentDate: item.masterData.shipmentDate,
          },
          historicalQuotes
        );
        return { item, verdict };
      }),
    [cases]
  );

  const attentionItems = verdicts.filter(({ item }) => item.status === 'needs_review');
  const processed = cases.filter((c) => c.status === 'quote_confirmed' || c.status === 'contracted' || c.status === 'settlement').length;
  const progressPct = cases.length ? Math.round((processed / cases.length) * 100) : 0;
  const contractPending = cases.filter((c) => c.status === 'contracted').length;
  const settlementPending = cases.filter((c) => c.status === 'settlement').length;

  const compositeIndex = useMemo(() => buildCompositeIndex(), []);
  const todayPoints = useMemo(
    () =>
      verdicts
        .filter(({ verdict }) => verdict.verdict !== 'insufficient_data')
        .map(({ item, verdict }) => ({
          id: item.caseNumber,
          z: verdict.sigma === 0 ? 0 : verdict.diffPct / verdict.sigma,
          tone: VERDICT_TONE[verdict.verdict],
        })),
    [verdicts]
  );
  const briefing = useMemo(() => thisWeekBriefingNews(6), []);

  useEffect(() => {
    fetch('/api/news')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('News request failed'))))
      .then((data: { articles?: LiveNewsArticle[] }) => setLiveBriefing(data.articles ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/market')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('Market request failed'))))
      .then((data: { rates?: LiveRates }) => setLiveRates(data.rates ?? {}))
      .catch(() => {});
  }, []);

  function openDrawer(indicator: IndicatorKey) {
    setDrawer(buildCausalAnalysis(indicator, SERIES[indicator]));
  }

  const statusSegments = STATUS_ORDER.map((s) => ({ label: CASE_STATUS_LABEL[s], value: statusCounts[s], color: CASE_STATUS_DONUT_COLOR[s] }));
  const displayBriefing = liveBriefing.length > 0 ? liveBriefing : briefing;

  return (
    <div className="page dashboard">
      <PageTitle eyebrow="HOME" title="좋은 아침입니다" desc="오늘 확인이 필요한 견적과 국제물류 변동 사항을 정리했어요." />

      <div className="quick-actions">
        <Link href="/quotes/new" className="quick-card accent">
          <Icon name="spark" />
          <b>견적 생성</b>
          <span>AI가 구간별 원가로 추천</span>
        </Link>
        <Link href="/cases" className="quick-card">
          <Icon name="contract" />
          <b>계약 {contractPending}건 대기</b>
          <span>전자서명 확인 필요</span>
        </Link>
        <Link href="/cases" className="quick-card">
          <Icon name="bill" />
          <b>정산 {settlementPending}건 대기</b>
          <span>Invoice 대조 필요</span>
        </Link>
      </div>

      <div className="market-strip">
        {INDICATORS.map((ind) => (
          <MarketCard key={ind} indicator={ind} onClick={openDrawer} liveValue={liveRates[ind]} />
        ))}
      </div>

      <div className="kpi-row">
        <div className="stat-mini">
          <span className="stat-mini-icon">
            <Icon name="waybill" />
          </span>
          <div>
            <b>
              {kpis.tcrCount}
              <em>건</em>
            </b>
            <span>TCR 환적 경유 노선</span>
          </div>
        </div>
        <div className="stat-mini">
          <span className="stat-mini-icon">
            <Icon name="arrow" />
          </span>
          <div>
            <b>
              {kpis.directChinaCount}
              <em>건</em>
            </b>
            <span>중국 내륙 직통 노선</span>
          </div>
        </div>
        <div className="stat-mini">
          <span className="stat-mini-icon">
            <Icon name="time" />
          </span>
          <div>
            <b>
              {kpis.avgLeadTime}
              <em>일</em>
            </b>
            <span>평균 리드타임(등록→출발)</span>
          </div>
        </div>
      </div>

      <div className="chart-row">
        <section className="card chart-card">
          <div className="card-head">
            <div>
              <span className="section-kicker">CASE STATUS</span>
              <h2>Case 상태별 분포</h2>
            </div>
          </div>
          <div className="donut-body">
            <DonutChart segments={statusSegments} />
            <div className="donut-legend">
              {statusSegments
                .filter((s) => s.value > 0)
                .map((s) => (
                  <div className="donut-legend-row" key={s.label}>
                    <i style={{ background: s.color }} />
                    <span>{s.label}</span>
                    <b>{s.value}</b>
                  </div>
                ))}
            </div>
          </div>
        </section>

        <section className="card chart-card">
          <div className="card-head">
            <div>
              <span className="section-kicker">MARKET INDEX</span>
              <h2>KORAIL LINK 종합 지수</h2>
              <p>과거 견적을 노선별로 표준화(σ)해 만든 자체 지수 · 외부 공식 지수 아님</p>
            </div>
          </div>
          <IndexChart monthly={compositeIndex} todayPoints={todayPoints} />
          <div className="legend index-legend">
            <span>
              <i className="legend-band" />
              정상범위(±1σ)
            </span>
            <span>
              <i className="legend-dot" style={{ background: '#1f8a5b' }} />
              정상
            </span>
            <span>
              <i className="legend-dot" style={{ background: '#d78516' }} />
              다소 높음
            </span>
            <span>
              <i className="legend-dot" style={{ background: '#d93d42' }} />
              높음
            </span>
          </div>
        </section>
      </div>

      <div className="home-grid">
        <section className="card briefing">
          <div className="card-head">
            <div>
              <span className="section-kicker">
                <Icon name="spark" /> LIVE BRIEFING
              </span>
              <h2>오늘의 국제물류 브리핑</h2>
            </div>
            <Link href="/search" className="text-btn">
              전체 정보 보기 <Icon name="arrow" />
            </Link>
          </div>
          <div className="brief-list">
            {displayBriefing.map((n) => (
              <button key={n.id} className="brief" onClick={() => 'indicator' in n && setDrawer(buildCausalAnalysis(n.indicator as IndicatorKey, SERIES[n.indicator as IndicatorKey]))}>
                <span className="brief-icon blue">◒</span>
                <div>
                  <Badge tone="blue">{n.category}</Badge>
                  <b>{n.title}</b>
                  <small>
                    {'source' in n ? n.source : ''} · {new Date(n.publishedAt).toLocaleDateString('ko-KR')}
                  </small>
                </div>
                <Icon name="arrow" />
              </button>
            ))}
          </div>
        </section>

        <aside className="card focus">
          <div className="card-head">
            <div>
              <span className="section-kicker">TODAY</span>
              <h2>오늘의 업무</h2>
            </div>
            <span className="count">{cases.length}</span>
          </div>
          {attentionItems.length > 0 ? (
            <div className="focus-list">
              {attentionItems.map(({ item, verdict }) => (
                <Link key={item.id} href={`/cases/${item.id}/validation`} className="focus-item">
                  <i className="focus-dot" style={{ background: VERDICT_TONE[verdict.verdict] === 'red' ? '#d93d42' : VERDICT_TONE[verdict.verdict] === 'amber' ? '#d78516' : '#1f8a5b' }} />
                  <div>
                    <b>
                      {item.caseNumber} · {item.route}
                    </b>
                    <small>{VERDICT_LABEL[verdict.verdict]}</small>
                  </div>
                  <Icon name="arrow" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="focus-empty">
              <Icon name="check" /> 오늘 추가로 확인할 항목이 없습니다.
            </div>
          )}
          <div className="progressbar">
            <i style={{ width: `${progressPct}%` }} />
          </div>
          <small>
            오늘 업무 {cases.length}건 중 {processed}건 처리
          </small>
          <Link href="/cases">
            업무 목록 확인 <Icon name="arrow" />
          </Link>
        </aside>
      </div>

      <section className="card ongoing">
        <div className="card-head">
          <div>
            <span className="section-kicker">ACTIVE CASES</span>
            <h2>진행 중인 견적</h2>
          </div>
          <Link href="/cases" className="text-btn">
            전체 보기 <Icon name="arrow" />
          </Link>
        </div>
        <div className="case-cards">
          {verdicts.slice(0, 3).map(({ item: c, verdict }) => (
            <Link href={`/cases/${c.id}`} className="case-card" key={c.id}>
              <div>
                <Badge tone={CASE_STATUS_TONE[c.status]}>{CASE_STATUS_LABEL[c.status]}</Badge>
                <span className="case-no">{c.caseNumber}</span>
              </div>
              <h3>{c.route}</h3>
              <p>
                {c.shipperName} · {c.containerType}
              </p>
              <footer>
                <span>코레일</span>
                <b>${c.price.toLocaleString()}</b>
              </footer>
              <div className="case-verdict">
                <Badge tone={VERDICT_TONE[verdict.verdict]}>{VERDICT_LABEL[verdict.verdict]}</Badge>
              </div>
              <i className="risk-line" style={{ background: VERDICT_TONE[verdict.verdict] === 'red' ? '#d45353' : VERDICT_TONE[verdict.verdict] === 'amber' ? '#e0a139' : '#4d89d5' }} />
            </Link>
          ))}
        </div>
      </section>

      <EvidenceDrawer analysis={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
