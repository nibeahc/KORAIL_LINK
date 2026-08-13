// 물류·시황 뉴스 (목업, 하드코딩) — 기능_상세_스펙.md A-4
import type { IndicatorKey } from './marketData';

export type NewsCategory = 'TCR' | '연운항' | '환율' | '유가' | '통관' | '규제' | '지정학';

export interface NewsArticle {
  id: string;
  title: string;
  category: NewsCategory;
  indicator: IndicatorKey | null;
  publishedAt: string; // YYYY-MM-DD
  summary: string;
}

export const newsArticles: NewsArticle[] = [
  { id: 'n1', title: '중국-카자흐스탄 접속구간 궤간환적 처리량 증가로 TCR 소요일 소폭 단축', category: 'TCR', indicator: null, publishedAt: '2026-08-12', summary: '아라산커우/도스티크 접속구간 환적 처리 인력 증원으로 평균 대기시간이 줄었다는 현지 보도.' },
  { id: 'n2', title: 'TCR 화차 공급 부족, 성수기 앞두고 일부 구간 운임 상승 압력', category: 'TCR', indicator: null, publishedAt: '2026-08-10', summary: '카자흐스탄 국영철도 화차 재배치 지연으로 일부 구간 운임에 상승 압력이 있다는 분석.' },
  { id: 'n3', title: '중앙아시아행 컨테이너 수요 증가, TCR 예약 대기 발생', category: 'TCR', indicator: null, publishedAt: '2026-08-05', summary: '유럽向 우회 수요가 TCR로 옮겨오며 예약 대기가 발생하고 있다는 업계 관측.' },
  { id: 'n4', title: '연운항 항만 처리능력 확충 공사 1단계 완료', category: '연운항', indicator: 'kci', publishedAt: '2026-08-11', summary: '연운항 신규 선석 1단계 공사가 완료되며 처리능력이 늘었다는 현지 발표.' },
  { id: 'n5', title: '한중 항로 컨테이너선 기항 스케줄 조정, 부산-연운항 소요일 변동', category: '연운항', indicator: 'kci', publishedAt: '2026-08-09', summary: '선사 스케줄 조정으로 부산-연운항 구간 소요일이 반나절가량 늘어났다는 보도.' },
  { id: 'n6', title: '연운항 인근 물류단지 신규 가동, 내륙 환적 물량 확대 전망', category: '연운항', indicator: 'kci', publishedAt: '2026-08-03', summary: '연운항 배후 물류단지가 신규 가동되며 내륙행 환적 물량이 늘어날 것이라는 전망.' },
  { id: 'n7', title: '원/달러 환율, 미 연준 발언 여파로 급등', category: '환율', indicator: 'usdKrw', publishedAt: '2026-08-13', summary: '미 연준 위원 발언 이후 달러 강세가 이어지며 원/달러 환율이 급등했다.' },
  { id: 'n8', title: '위안화 약세 지속, 중국 수출입 물류비 영향 주시', category: '환율', indicator: 'cnyKrw', publishedAt: '2026-08-08', summary: '위안화 약세 흐름이 이어지며 중국 경유 물류비 환산에 영향을 줄 수 있다는 분석.' },
  { id: 'n9', title: '카자흐스탄 텡게화, 최근 원자재 가격 흐름에 연동 약세', category: '환율', indicator: 'usdKzt', publishedAt: '2026-08-07', summary: '텡게화가 원자재 가격 하락 흐름에 연동해 달러 대비 약세를 보이고 있다.' },
  { id: 'n10', title: '우즈베키스탄 솜화 환율, 중앙은행 개입으로 변동성 축소', category: '환율', indicator: 'usdUzs', publishedAt: '2026-08-06', summary: '우즈베키스탄 중앙은행의 시장 개입으로 솜화 환율 변동성이 최근 줄어들었다는 보도.' },
  { id: 'n11', title: '키르기스스탄 솜화, 인접국 통화 약세 여파로 동반 약세', category: '환율', indicator: 'usdKgs', publishedAt: '2026-08-04', summary: '인접국 통화 약세 흐름이 키르기스스탄 솜화에도 영향을 미치고 있다는 분석.' },
  { id: 'n12', title: '중동 정정 불안 심화, Brent 유가 급등', category: '지정학', indicator: 'brent', publishedAt: '2026-08-13', summary: '중동 지역 정정 불안이 심화되며 Brent 유가가 급등했다. 해상·내륙 운임 전반에 상승 압력이 우려된다.' },
  { id: 'n13', title: 'OPEC+ 감산 연장 논의, 유가 상방 압력 지속 전망', category: '유가', indicator: 'brent', publishedAt: '2026-08-11', summary: 'OPEC+의 감산 연장 논의가 이어지며 유가 상방 압력이 당분간 지속될 것이라는 전망.' },
  { id: 'n14', title: '미국 원유 재고 예상보다 큰 폭 감소, 유가 상승', category: '유가', indicator: 'brent', publishedAt: '2026-08-02', summary: '미국 주간 원유 재고가 예상보다 크게 줄며 유가가 상승 마감했다.' },
  { id: 'n15', title: '카자흐스탄, 국경통과 화물 통관서류 전자화 시범사업 발표', category: '통관', indicator: null, publishedAt: '2026-08-12', summary: '아라산커우 인근 통관서류 전자화 시범사업이 발표되며 향후 통관 소요시간 단축이 기대된다.' },
  { id: 'n16', title: '중국 세관, 임시 통관 검사 강화 조치 시행', category: '통관', indicator: null, publishedAt: '2026-08-09', summary: '일부 품목에 대해 중국 세관의 통관 검사가 일시적으로 강화됐다는 현지 보도.' },
  { id: 'n17', title: '우즈베키스탄, 통과운송 화물 원산지증명서 요건 완화', category: '통관', indicator: null, publishedAt: '2026-08-01', summary: '통과운송(transit) 화물에 대한 원산지증명서 제출 요건이 일부 완화됐다는 발표.' },
  { id: 'n18', title: 'SMGS 협약국, 화물운송장 전자문서 인정 범위 확대 논의', category: '규제', indicator: null, publishedAt: '2026-08-10', summary: 'OSJD 회원국 간 SMGS 화물운송장 전자문서 인정 범위 확대가 논의되고 있다는 보도.' },
  { id: 'n19', title: '카자흐스탄, 궤간환적 화차사용료 기준 개정 예고', category: '규제', indicator: null, publishedAt: '2026-08-06', summary: '궤간환적 구간 화차사용료 산정 기준 개정이 예고되어 관련 비용에 영향이 있을 수 있다.' },
  { id: 'n20', title: '중국-중앙아시아 물류회랑 관련 국경통과협정 갱신 협의', category: '규제', indicator: null, publishedAt: '2026-07-30', summary: '관련국 간 국경통과협정 갱신 협의가 진행 중이라는 보도.' },
  { id: 'n21', title: '중앙아시아 역내 긴장 완화 신호, 물류회랑 안정성 개선 기대', category: '지정학', indicator: null, publishedAt: '2026-08-08', summary: '역내 긴장 완화 신호가 나오며 물류회랑 안정성 개선 기대가 커지고 있다.' },
  { id: 'n22', title: '카스피해 인근 정세 변화, 우회 노선 검토 확산', category: '지정학', indicator: null, publishedAt: '2026-08-02', summary: '카스피해 인근 정세 변화로 일부 화주들이 우회 노선을 검토하고 있다는 보도.' },
  { id: 'n23', title: '중국-러시아 접경 화물 흐름 변화, 만저우리 경유 물량 증가', category: '지정학', indicator: null, publishedAt: '2026-07-28', summary: '중국-러시아 접경 지역 화물 흐름 변화로 만저우리 경유 물량이 늘고 있다는 보도.' },
  { id: 'n24', title: '위안화 강세 전환 조짐, 당국 개입 여부 주목', category: '환율', indicator: 'cnyKrw', publishedAt: '2026-07-27', summary: '위안화가 강세로 전환할 조짐을 보이며 당국 개입 여부에 시장의 관심이 쏠리고 있다.' },
  { id: 'n25', title: '원/달러 환율, 수출업체 네고 물량에 상승폭 제한', category: '환율', indicator: 'usdKrw', publishedAt: '2026-07-25', summary: '수출업체 네고 물량이 유입되며 원/달러 환율 상승폭이 제한됐다.' },
  { id: 'n26', title: '연운항-TCR 연계 복합운송 실적, 상반기 전년 대비 증가', category: 'TCR', indicator: null, publishedAt: '2026-07-20', summary: '연운항을 경유한 TCR 복합운송 실적이 상반기 전년 대비 늘었다는 통계 발표.' },
  { id: 'n27', title: '한중 항로 컨테이너선 신규 취항, 공급 확대', category: '연운항', indicator: 'kci', publishedAt: '2026-07-18', summary: '한중 항로에 신규 컨테이너선이 취항하며 공급이 확대됐다는 보도.' },
  { id: 'n28', title: 'KCCI 종합지수, 최근 한 달 완만한 상승세', category: '유가', indicator: 'kcci', publishedAt: '2026-07-15', summary: '부산발 13개 항로를 종합한 KCCI 지수가 최근 한 달 완만한 상승세를 보이고 있다.' },
  { id: 'n29', title: '중국 내륙 철도망 정비, 시안·우루무치 경유 리드타임 단축 기대', category: '통관', indicator: null, publishedAt: '2026-07-10', summary: '중국 내륙 철도망 정비 사업이 진행되며 시안·우루무치 경유 구간 리드타임 단축이 기대된다.' },
  { id: 'n30', title: '카자흐스탄 국경통과 화물 검사 절차 간소화 시행', category: '통관', indicator: null, publishedAt: '2026-07-05', summary: '카자흐스탄 국경통과 화물 검사 절차가 일부 간소화되어 시행됐다는 발표.' },
];

export function matchNewsForIndicator(indicator: IndicatorKey, limit = 5): NewsArticle[] {
  return newsArticles
    .filter((a) => a.indicator === indicator)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
    .slice(0, limit);
}

/** 이번 주(최근 7일) 이벤트성 뉴스 — 정책(규제)·화차공급(TCR)·지정학 카테고리를 우선한다 (A-4) */
export function thisWeekBriefingNews(limit = 6): NewsArticle[] {
  const priority: NewsCategory[] = ['규제', 'TCR', '지정학', '통관', '연운항', '환율', '유가'];
  const cutoff = new Date('2026-08-13T00:00:00+09:00');
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return [...newsArticles]
    .filter((a) => a.publishedAt >= cutoffStr)
    .sort((a, b) => {
      const pa = priority.indexOf(a.category);
      const pb = priority.indexOf(b.category);
      if (pa !== pb) return pa - pb;
      return a.publishedAt < b.publishedAt ? 1 : -1;
    })
    .slice(0, limit);
}
