'use client';

import { useMemo, useState } from 'react';
import { newsArticles, thisWeekBriefingNews, type NewsCategory } from '../../lib/newsData';
import { detectAnomaly, INDICATOR_LABEL, SERIES, type IndicatorKey } from '../../lib/marketData';
import { buildCausalAnalysis, type CausalAnalysis } from '../../lib/causalAnalysis';
import { PageTitle } from '../../components/PageTitle';
import { Badge } from '../../components/Badge';
import { Icon } from '../../components/Icon';
import { EvidenceDrawer } from '../../components/EvidenceDrawer';

const CATEGORIES: NewsCategory[] = ['TCR', '연운항', '환율', '유가', '통관', '규제', '지정학'];
const CATEGORY_TONE: Record<NewsCategory, 'red' | 'amber' | 'green' | 'blue'> = {
  TCR: 'red',
  연운항: 'red',
  환율: 'blue',
  유가: 'green',
  통관: 'blue',
  규제: 'red',
  지정학: 'red',
};
const WEEKLY_INDICATORS: IndicatorKey[] = ['usdKrw', 'cnyKrw', 'brent', 'usdKzt', 'usdUzs', 'usdKgs', 'kcci', 'kci'];

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<NewsCategory | 'all'>('all');
  const [drawer, setDrawer] = useState<CausalAnalysis | null>(null);
  const briefing = useMemo(() => thisWeekBriefingNews(6), []);

  const anomalies = useMemo(
    () => WEEKLY_INDICATORS.map((key) => ({ key, anomaly: detectAnomaly(SERIES[key]) })).filter((d) => d.anomaly.isAnomaly),
    []
  );

  const results = useMemo(() => {
    return newsArticles
      .filter((a) => (category === 'all' ? true : a.category === category))
      .filter((a) => (query.trim() ? a.title.includes(query) || a.summary.includes(query) : true))
      .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  }, [query, category]);

  return (
    <div className="page search-page">
      <PageTitle eyebrow="INFORMATION HUB" title="통합 정보 검색" desc="과거 견적과 시장정보를 한 번에 검색하세요." />

      <section className="card weekly-briefing">
        <div className="card-head">
          <div>
            <span className="section-kicker">
              <Icon name="spark" /> WEEKLY BRIEFING
            </span>
            <h2>이번 주 시황 브리핑</h2>
            <p>최근 7일 시장지표 이상탐지와 주요 이슈를 모았습니다.</p>
          </div>
        </div>
        {anomalies.length > 0 ? (
          <div className="wb-indicators">
            {anomalies.map(({ key, anomaly }) => (
              <button key={key} className="wb-indicator" onClick={() => setDrawer(buildCausalAnalysis(key, SERIES[key]))}>
                <span className={`wb-dir ${anomaly.changePct >= 0 ? 'up' : 'down'}`}>{anomaly.changePct >= 0 ? '▲' : '▼'}</span>
                <div>
                  <b>{INDICATOR_LABEL[key]}</b>
                  <span>
                    {anomaly.changePct >= 0 ? '+' : ''}
                    {anomaly.changePct.toFixed(1)}% · z={anomaly.zScore.toFixed(1)}
                  </span>
                </div>
                <Icon name="arrow" />
              </button>
            ))}
          </div>
        ) : (
          <p className="wb-empty">
            <Icon name="check" /> 이번 주 이상탐지된 시장지표가 없습니다 — 안정적인 한 주입니다.
          </p>
        )}
        <div className="wb-news">
          {briefing.map((n) => (
            <button key={n.id} className="wb-news-row" onClick={() => setCategory(n.category)}>
              <Badge tone={CATEGORY_TONE[n.category]}>{n.category}</Badge>
              <b>{n.title}</b>
              <span>{n.publishedAt}</span>
              <Icon name="arrow" />
            </button>
          ))}
        </div>
      </section>

      <label className="hero-search">
        <Icon name="search" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="노선, 국가, 시장정보를 검색하세요" />
      </label>

      <div className="chips reference-chips">
        <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>
          전체
        </button>
        {CATEGORIES.map((c) => (
          <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="result-heading">
        <b>검색 결과</b>
        <span>{results.length}건</span>
      </div>
      <div className="news-list">
        {results.map((n) => (
          <article className="card news-card" key={n.id}>
            <div>
              <Badge tone={CATEGORY_TONE[n.category]}>{n.category} · 관련도 높음</Badge>
              <h3>{n.title}</h3>
              <p>{n.summary}</p>
              <small>{n.publishedAt}</small>
            </div>
          </article>
        ))}
        {results.length === 0 && (
          <div className="empty">
            <span>⌕</span>
            <b>검색 결과가 없습니다.</b>
            <small>검색어나 필터를 다시 확인해주세요.</small>
          </div>
        )}
      </div>

      <EvidenceDrawer analysis={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
