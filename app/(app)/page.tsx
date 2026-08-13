'use client';

import { useEffect, useMemo, useState } from 'react';
import { useCases } from '../lib/state';
import { CASE_STATUS_LABEL, type CaseStatus } from '../lib/types';
import { buildCompositeIndex, SERIES, type IndicatorKey } from '../lib/marketData';
import { buildCausalAnalysis, type CausalAnalysis } from '../lib/causalAnalysis';
import { thisWeekBriefingNews } from '../lib/newsData';
import { getRoute } from '../lib/routeData';
import { DonutChart } from '../components/charts/DonutChart';
import { IndexChart } from '../components/charts/IndexChart';
import { MarketCard } from '../components/MarketCard';
import { EvidenceDrawer } from '../components/EvidenceDrawer';

const STATUS_COLORS: Record<CaseStatus, string> = {
  pending_validation: '#a3a3a3',
  needs_review: '#f59e0b',
  quote_confirmed: '#3b82f6',
  contracted: '#8b5cf6',
  settlement: '#16a34a',
};

const INDICATORS: IndicatorKey[] = ['usdKrw', 'cnyKrw', 'usdKzt', 'usdUzs', 'usdKgs', 'brent', 'kcci', 'kci'];

type LiveNewsArticle = { id: string; title: string; summary: string; url: string; source: string; publishedAt: string; category: string };

export default function DashboardPage() {
  const { cases } = useCases();
  const [drawer, setDrawer] = useState<CausalAnalysis | null>(null);
  const [liveBriefing, setLiveBriefing] = useState<LiveNewsArticle[]>([]);

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

  const compositeIndex = useMemo(() => buildCompositeIndex(), []);
  const briefing = useMemo(() => thisWeekBriefingNews(6), []);

  useEffect(() => {
    fetch('/api/news')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('News request failed'))))
      .then((data: { articles?: LiveNewsArticle[] }) => setLiveBriefing(data.articles ?? []))
      .catch(() => {});
  }, []);

  function openDrawer(indicator: IndicatorKey) {
    setDrawer(buildCausalAnalysis(indicator, SERIES[indicator]));
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-lg font-semibold text-neutral-900">홈</h1>
      <p className="mt-1 text-sm text-neutral-500">진행 중인 Case와 오늘 확인이 필요한 시황을 한눈에 봅니다.</p>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-neutral-200 bg-white p-5 md:col-span-1">
          <h2 className="text-sm font-medium text-neutral-700">Case 상태별 분포</h2>
          <div className="mt-3">
            <DonutChart
              segments={(Object.keys(statusCounts) as CaseStatus[]).map((s) => ({
                label: CASE_STATUS_LABEL[s],
                value: statusCounts[s],
                color: STATUS_COLORS[s],
              }))}
            />
          </div>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-5 md:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-700">KORAIL LINK 종합 지수</h2>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500">
              자체 산출 지수(외부 공식 지수 아님, MVP 참고용)
            </span>
          </div>
          <div className="mt-3">
            <IndexChart points={compositeIndex} />
          </div>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <p className="text-xs text-neutral-500">TCR 환적 경유 노선 Case 수</p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900">{kpis.tcrCount}건</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <p className="text-xs text-neutral-500">중국 내륙 직통 노선 Case 수</p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900">{kpis.directChinaCount}건</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <p className="text-xs text-neutral-500">평균 리드타임(등록→출발)</p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900">{kpis.avgLeadTime}일</p>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-medium text-neutral-700">시황 지표</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {INDICATORS.map((ind) => (
            <MarketCard key={ind} indicator={ind} onClick={openDrawer} />
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-medium text-neutral-700">이번 주 시황 브리핑</h2>
        <p className="mt-1 text-xs text-neutral-400">정책·화차공급·지정학 이슈를 우선 표시합니다.</p>
        <ul className="mt-3 divide-y divide-neutral-100">
          {(liveBriefing.length > 0 ? liveBriefing : briefing).map((n) => (
            <li key={n.id} className="py-2.5 text-sm">
              <span className="mr-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">{n.category}</span>
              {'url' in n ? (
                <a href={n.url} target="_blank" rel="noreferrer" className="text-neutral-800 hover:underline">
                  {n.title}
                </a>
              ) : (
                <span className="text-neutral-800">{n.title}</span>
              )}
              <span className="ml-2 text-xs text-neutral-400">{new Date(n.publishedAt).toLocaleDateString('ko-KR')}</span>
              {'source' in n && <span className="ml-2 text-xs text-neutral-400">{n.source}</span>}
            </li>
          ))}
        </ul>
      </section>

      <EvidenceDrawer analysis={drawer} onClose={() => setDrawer(null)} />
    </main>
  );
}
