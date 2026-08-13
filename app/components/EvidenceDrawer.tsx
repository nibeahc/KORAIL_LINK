'use client';

import type { CausalAnalysis } from '../lib/causalAnalysis';
import { Icon } from './Icon';
import { SparkLine } from './charts/SparkLine';
import { SERIES } from '../lib/marketData';

export function EvidenceDrawer({ analysis, onClose }: { analysis: CausalAnalysis | null; onClose: () => void }) {
  if (!analysis) return null;
  const series = SERIES[analysis.indicator];
  const latest = series[series.length - 1];

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true">
        <header>
          <div>
            <span className="section-kicker">EVIDENCE</span>
            <h2>{analysis.label}</h2>
          </div>
          <button onClick={onClose}>×</button>
        </header>

        <div className="drawer-chart">
          <SparkLine series={series} isAnomaly={analysis.isAnomaly} height={70} />
          <div className="drawer-stats">
            <div>
              <b>{latest.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b>
              <span>현재값</span>
            </div>
            <div>
              <b>{analysis.zScore.toFixed(1)}</b>
              <span>z-score</span>
            </div>
            <div>
              <b style={{ color: analysis.isAnomaly ? '#c84449' : '#207c56' }}>{analysis.isAnomaly ? '이상탐지됨' : '정상 범위'}</b>
              <span>30일 기준</span>
            </div>
          </div>
        </div>

        <div className="causal-box">
          <Icon name="spark" />
          <div>
            <small>AI 인과분석 · {analysis.relatedNews.length > 0 ? '뉴스 근거' : '추정'}</small>
            <p>{analysis.narrative}</p>
          </div>
        </div>

        <h3>근거 뉴스</h3>
        {analysis.relatedNews.length > 0 ? (
          analysis.relatedNews.map((n, i) => (
            <article key={n.id}>
              <span>0{i + 1}</span>
              <div>
                <b>{n.title}</b>
                <p>{n.summary}</p>
                <small>
                  {n.category} · {n.publishedAt} <Icon name="external" />
                </small>
              </div>
            </article>
          ))
        ) : (
          <p className="doc-note">
            <Icon name="info" />
            관련된 뉴스가 확인되지 않았습니다.
          </p>
        )}

        <footer>
          <Icon name="check" />
          <div>
            <b>근거 자료 확인 완료</b>
            <span>필요 시 검증·포워더 문의 자료로 참고하세요.</span>
          </div>
        </footer>
      </div>
    </>
  );
}
