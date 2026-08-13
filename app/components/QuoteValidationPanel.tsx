'use client';

import type { CaseMasterData } from '../lib/types';
import {
  validateQuote,
  computeSimilarityBreakdown,
  SIMILARITY_WEIGHTS,
  SIMILARITY_THRESHOLD,
  TIMING_WINDOW_MONTHS,
  MIN_SAMPLE_SIZE,
  VERDICT_LABEL,
  VERDICT_TONE,
} from '../lib/quoteEngine';
import { historicalQuotes, SERIES, windowChangePct, relevantIndicatorsForRoute } from '../lib/marketData';
import { buildCausalAnalysis, buildSubstitutionSignal } from '../lib/causalAnalysis';
import { getSeasonalSignal } from '../lib/seasonality';
import { newsArticles } from '../lib/newsData';
import { getRoute } from '../lib/routeData';
import { Badge } from './Badge';
import { Icon } from './Icon';
import { Factor } from './Factor';
import { PriceChart } from './charts/PriceChart';

function newsCount(category: string): number {
  return newsArticles.filter((n) => n.category === category).length;
}

export function QuoteValidationPanel({
  masterData,
  total,
  onConfirm,
  confirmLabel = '견적 확정하기',
}: {
  masterData: CaseMasterData;
  total: number;
  onConfirm?: () => void;
  confirmLabel?: string;
}) {
  const target = {
    route: masterData.destination,
    containerType: masterData.containerType,
    cargoType: masterData.cargoType,
    shipmentDate: masterData.shipmentDate,
  };
  const result = validateQuote(total, target, historicalQuotes);
  const route = getRoute(masterData.destination);
  const tone = VERDICT_TONE[result.verdict];
  const values = result.matches.map((m) => m.quote.amount);

  const breakdowns = result.matches.map((m) => computeSimilarityBreakdown(target, m.quote));
  const pct = (f: (b: (typeof breakdowns)[number]) => boolean) =>
    breakdowns.length ? Math.round((breakdowns.filter(f).length / breakdowns.length) * 100) : 0;
  const originPct = pct((b) => b.routeMatch);
  const containerPct = pct((b) => b.containerScore >= 1);
  const cargoPct = pct((b) => b.cargoMatch);
  const timingPct = breakdowns.length ? Math.round((breakdowns.reduce((a, b) => a + b.timingScore, 0) / breakdowns.length) * 100) : 0;
  const avgScore = result.matches.length ? Math.round((result.matches.reduce((a, m) => a + m.similarity, 0) / result.matches.length) * 100) : 0;

  const absDiff = Math.abs(result.diffPct);
  const position =
    absDiff <= 0.5 * result.sigma ? '중간' : absDiff <= 1.5 * result.sigma ? (result.diffPct >= 0 ? '상단' : '하단') : result.diffPct >= 0 ? '최상단' : '최하단';
  const diffLabel = `${result.diffPct >= 0 ? '+' : ''}${result.diffPct.toFixed(1)}%`;

  const seasonal = getSeasonalSignal(masterData.shipmentDate);
  const kciAnalysis = buildCausalAnalysis('kci', SERIES.kci);
  const substitution = route?.hasSeaLeg ? buildSubstitutionSignal(SERIES.kci, result.diffPct >= 0 ? 'up' : 'down') : null;

  const indicatorFactors = route
    ? relevantIndicatorsForRoute(route)
        .filter((ind) => ind !== 'kci')
        .map((ind) => {
          const analysis = buildCausalAnalysis(ind, SERIES[ind]);
          const change = windowChangePct(SERIES[ind], 30);
          return (
            <Factor
              key={ind}
              icon="◒"
              tone={analysis.isAnomaly ? 'red' : 'amber'}
              title={analysis.label}
              value={`${change >= 0 ? '+' : ''}${change.toFixed(1)}%`}
              label="최근 30일"
              desc={analysis.narrative}
            />
          );
        })
    : [];

  const factors = [
    ...(route?.usesTCR
      ? [
          <Factor key="policy" icon="§" tone="red" title="중국 철도 보조금 정책" value={`${newsCount('규제')}건`} label="관련 뉴스" desc="TCR 활성화를 위한 화차 보조금 정책 변화가 운임에 영향을 줄 수 있습니다." />,
          <Factor key="tcr" icon="⇄" tone="red" title="화차·컨테이너 공급" value={`${newsCount('TCR')}건`} label="관련 뉴스" desc="중국–카자흐스탄 접속구간의 화차 공급 상황이 대기일수·운임에 영향을 줄 수 있습니다." />,
          <Factor key="geo" icon="⚑" tone="red" title="지정학 리스크" value={`${newsCount('지정학')}건`} label="관련 뉴스" desc="역내 지정학 이슈가 물동량 쏠림을 통해 TCR 운임에 간접 영향을 줄 수 있습니다." />,
        ]
      : []),
    ...(route?.hasSeaLeg
      ? [<Factor key="yeonyungang" icon="⚓" tone="red" title="연운항 환적 이슈" value={`${newsCount('연운항')}건`} label="관련 뉴스" desc="부산–연운항 구간의 환적 처리 상황이 확인되었습니다." />]
      : []),
    ...indicatorFactors,
    ...(route?.hasSeaLeg
      ? [
          <Factor
            key="seaFreight"
            icon="≋"
            tone={kciAnalysis.isAnomaly ? 'red' : 'amber'}
            title="부산–중국 항로 수급 · KCI"
            value={`${windowChangePct(SERIES.kci, 30) >= 0 ? '+' : ''}${windowChangePct(SERIES.kci, 30).toFixed(1)}%`}
            label="최근 30일 · KCI(한중항로) 참고 벤치마크"
            desc={substitution?.narrative ?? ''}
          />,
        ]
      : []),
    <Factor key="seasonality" icon="◷" tone={seasonal.season === 'peak' ? 'red' : 'amber'} title="계절성" value={seasonal.label} label="캘린더 기반 신호" desc={seasonal.reason} />,
  ];

  return (
    <div className="validation">
      <div className="validation-title">
        <div>
          <span className="section-kicker">
            <Icon name="spark" /> AI QUOTE VALIDATION
          </span>
          <h2>AI 견적 검증</h2>
          <p>코레일 내부 유사 견적과 현재 시장정보를 함께 분석한 결과입니다.</p>
        </div>
        <span className="analyzed">
          <i /> 분석 완료 · 방금 전
        </span>
      </div>

      <section className="result-card">
        <div className="result-main">
          <span className="result-icon">{tone === 'green' ? '✓' : '!'}</span>
          <div>
            <Badge tone={tone}>{VERDICT_LABEL[result.verdict]}</Badge>
            <h2>{result.narrative}</h2>
            <p>
              내부 유사 견적 분포에서 <b>{position} 수준</b>이며,
              <br />
              최근 시장 변동요인도 함께 확인되었습니다.
            </p>
          </div>
        </div>
        <div className="result-price">
          <span>현재 견적</span>
          <b>${total.toLocaleString()}</b>
          <small>
            유사 견적 중앙값 대비 <em>{diffLabel}</em>
          </small>
        </div>
      </section>

      <div className="analysis-grid">
        <section className="card comparison">
          <div className="card-head">
            <div>
              <span className="section-kicker">INTERNAL DATA</span>
              <h2>코레일 내부 유사 견적 비교</h2>
            </div>
          </div>
          <div className="legend">
            <span>
              <i className="dot-gray" /> 과거 유사 견적
            </span>
            <span>
              <i className="tri" /> 현재 견적
            </span>
          </div>
          {result.verdict !== 'insufficient_data' && <PriceChart current={total} values={values} baseline={result.baseline} />}
          <div className="compare-note">
            <span>↗</span>
            <div>
              <b>내부 유사 Case의 가격 분포 중 {position}에 위치합니다.</b>
              <p>
                중앙값 ${result.baseline.toLocaleString()} 대비 ${Math.abs(total - result.baseline).toLocaleString()} {total >= result.baseline ? '높은' : '낮은'} 수준입니다.
              </p>
            </div>
          </div>
          <footer>
            <div>
              <b>{result.sampleSize}건</b>
              <span>유사 Case</span>
            </div>
            <div>
              <b>{masterData.destination}</b>
              <span>동일 목적지</span>
            </div>
            <div>
              <b>{masterData.containerType}</b>
              <span>컨테이너 타입</span>
            </div>
            <div>
              <b>σ={result.sigma.toFixed(1)}%</b>
              <span>가격 분산(σ){result.usedDefaultSigma ? ' · 기본값' : ''}</span>
            </div>
          </footer>
        </section>

        <section className="card why">
          <span className="section-kicker">WHY IT MATTERS</span>
          <h2>비교 조건</h2>
          <div className="match-score">
            <b>{avgScore}</b>
            <span>
              %<small>{avgScore >= 80 ? '높은 유사도' : avgScore >= 60 ? '보통 유사도' : '낮은 유사도'}</small>
            </span>
          </div>
          <ul>
            <li>
              <Icon name="check" />
              <span>출발·도착 구간 일치</span>
              <b>{originPct}%</b>
            </li>
            <li>
              <Icon name="check" />
              <span>컨테이너 조건 일치</span>
              <b>{containerPct}%</b>
            </li>
            <li>
              <Icon name="check" />
              <span>운송 시기 유사</span>
              <b>{timingPct}%</b>
            </li>
            <li>
              <Icon name="check" />
              <span>화물 특성 유사</span>
              <b>{cargoPct}%</b>
            </li>
          </ul>
          <p>
            <Icon name="info" /> 비교 결과는 노선 {SIMILARITY_WEIGHTS.route * 100}%·컨테이너 {SIMILARITY_WEIGHTS.containerType * 100}%·시기{' '}
            {SIMILARITY_WEIGHTS.timing * 100}%·화물특성 {SIMILARITY_WEIGHTS.cargoType * 100}% 가중치를 바탕으로 산출됩니다. 유사도 {SIMILARITY_THRESHOLD * 100}% 이상 · 최근{' '}
            {TIMING_WINDOW_MONTHS}개월 이내만 채택 · 표본 {MIN_SAMPLE_SIZE}건 미만이면 σ 기본값을 씁니다({result.sampleSize}건 매칭됨). 이 가중치·임계값은 코레일 실거래 이력으로 검증된 값이 아닌 MVP 초기 휴리스틱입니다.
          </p>
        </section>
      </div>

      <div className="factor-heading">
        <div>
          <span className="section-kicker">EXTERNAL SIGNALS</span>
          <h2>현재 시장정보</h2>
          <p>{masterData.destination} 도착 노선 기준으로 함께 확인할 외부 변동요인입니다.</p>
        </div>
        <span>관련도 순</span>
      </div>
      <div className="factors">{factors}</div>

      <section className="ai-summary">
        <div className="ai-label">
          <span>
            <Icon name="spark" />
          </span>
          <div>
            <small>KORAIL LINK AI</small>
            <h2>검증 요약</h2>
          </div>
        </div>
        <p>
          현재 견적 <b>${total.toLocaleString()}</b>은 코레일 내부 유사 견적 {result.sampleSize}건 분포에서 <b>{position}에 위치</b>합니다(중앙값 대비 {diffLabel}, 가격 분산 σ={result.sigma.toFixed(1)}%). 확인이
          필요한 항목: <mark>{route?.usesTCR ? 'TCR 구간 운임 변동 여부' : '중국 내륙철도 구간 운임 변동 여부'}</mark>,{' '}
          <mark>{route?.hasSeaLeg ? '환적 관련 추가비용 포함 여부' : '환율 환산 기준일'}</mark>
        </p>
        {onConfirm && (
          <div className="next-action">
            <div>
              <b>다음 권장 업무</b>
              <span>검증 결과를 확인했다면 견적을 확정하세요.</span>
            </div>
            <button onClick={onConfirm}>
              {confirmLabel} <Icon name="arrow" />
            </button>
          </div>
        )}
        <small className="disclaimer">
          <Icon name="info" /> 본 분석은 코레일 내부 유사 견적과 참고 시장정보를 활용한 검증이며, 최종 확정은 담당자가 수행합니다.
        </small>
      </section>
    </div>
  );
}
