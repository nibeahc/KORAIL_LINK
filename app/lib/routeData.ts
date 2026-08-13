// 노선(목적지)별 실제 구간 구성. TCR 경유 여부·해상구간 유무에 따라
// 관련 시황 지표·뉴스 카테고리가 달라진다 (기능_상세_스펙.md A-4, A-8).

export type CurrencyPair = 'USD/KZT' | 'USD/UZS' | 'USD/KGS';

export interface RouteStage {
  id: string;
  name: string;
  mode: string;
}

export interface RoutePath {
  destination: string;
  country: string;
  /** 목적지 통화 시계열 — 중국행 노선은 결제·표시 모두 USD라 별도 통화쌍이 없다 (A-8) */
  currencyPair: CurrencyPair | null;
  /** 연운항 이후 궤간환적을 거쳐 카자흐스탄행 TCR(중국-카자흐스탄 접속) 구간을 쓰는지 */
  usesTCR: boolean;
  /** 부산항→연운항 해상구간을 쓰는지 */
  hasSeaLeg: boolean;
  stages: RouteStage[];
}

export const ROUTES: Record<string, RoutePath> = {
  알마티: {
    destination: '알마티',
    country: '카자흐스탄',
    currencyPair: 'USD/KZT',
    usesTCR: true,
    hasSeaLeg: true,
    stages: [
      { id: 'obong-busan', name: '오봉→부산항', mode: '국내철도' },
      { id: 'busan-lianyungang', name: '부산항→연운항', mode: '해상운임' },
      { id: 'lianyungang-almaty', name: '연운항→알마티', mode: 'TCR철도' },
      { id: 'transload', name: '환적', mode: '환적료' },
    ],
  },
  아스타나: {
    destination: '아스타나',
    country: '카자흐스탄',
    currencyPair: 'USD/KZT',
    usesTCR: true,
    hasSeaLeg: true,
    stages: [
      { id: 'obong-busan', name: '오봉→부산항', mode: '국내철도' },
      { id: 'busan-lianyungang', name: '부산항→연운항', mode: '해상운임' },
      { id: 'lianyungang-astana', name: '연운항→아스타나', mode: 'TCR철도' },
      { id: 'transload', name: '환적', mode: '환적료' },
    ],
  },
  타슈켄트: {
    destination: '타슈켄트',
    country: '우즈베키스탄',
    currencyPair: 'USD/UZS',
    usesTCR: true,
    hasSeaLeg: true,
    stages: [
      { id: 'obong-busan', name: '오봉→부산항', mode: '국내철도' },
      { id: 'busan-lianyungang', name: '부산항→연운항', mode: '해상운임' },
      { id: 'lianyungang-tashkent', name: '연운항→타슈켄트', mode: 'TCR철도' },
      { id: 'transload', name: '환적', mode: '환적료' },
    ],
  },
  비슈케크: {
    destination: '비슈케크',
    country: '키르기스스탄',
    currencyPair: 'USD/KGS',
    usesTCR: true,
    hasSeaLeg: true,
    stages: [
      { id: 'obong-busan', name: '오봉→부산항', mode: '국내철도' },
      { id: 'busan-lianyungang', name: '부산항→연운항', mode: '해상운임' },
      { id: 'lianyungang-bishkek', name: '연운항→비슈케크', mode: 'TCR철도' },
      { id: 'transload', name: '환적', mode: '환적료' },
    ],
  },
  시안: {
    destination: '시안',
    country: '중국',
    currencyPair: null,
    usesTCR: false,
    hasSeaLeg: true,
    stages: [
      { id: 'obong-busan', name: '오봉→부산항', mode: '국내철도' },
      { id: 'busan-lianyungang', name: '부산항→연운항', mode: '해상운임' },
      { id: 'lianyungang-xian', name: '연운항→시안', mode: '중국내륙철도' },
    ],
  },
  상하이: {
    destination: '상하이',
    country: '중국',
    currencyPair: null,
    usesTCR: false,
    hasSeaLeg: true,
    stages: [
      { id: 'obong-busan', name: '오봉→부산항', mode: '국내철도' },
      { id: 'busan-shanghai', name: '부산항→상하이', mode: '해상운임' },
    ],
  },
};

export function getRoute(destination: string): RoutePath | undefined {
  return ROUTES[destination];
}

export function listDestinations(): RoutePath[] {
  return Object.values(ROUTES);
}

/** "오봉 → 부산항 → 연운항 → 알마티" 형태의 표시용 노선 라벨을 stages에서 조립한다 */
export function buildRouteLabel(route: RoutePath): string {
  const nodes: string[] = [];
  for (const stage of route.stages) {
    if (!stage.name.includes('→')) continue;
    const [from, to] = stage.name.split('→');
    if (nodes.length === 0) nodes.push(from);
    nodes.push(to);
  }
  return nodes.join(' → ');
}
