import type { NewsCategory } from './newsData';

export const NEWS_KEYWORDS: Record<NewsCategory, string[]> = {
  TCR: [
    'tcr', '중국횡단철도', 'china railway express', 'cr express', 'china railway', '화차', '왜건', 'wagon', '컨테이너 공급', '컨테이너 부족', '컨테이너 적체', 'soc 컨테이너', 'coc 컨테이너', 'alashankou', 'alataw pass', '호르고스', 'khorgos', '도스티크', 'dostyk', '알틴콜', 'altynkol', '궤간 환적', 'break of gauge', '1435mm', '1520mm', '표준궤', '광궤', '배차', '블록트레인', 'block train', '국경통과', 'border crossing', 'rail subsidy', 'freight rate surge',
  ],
  연운항: [
    '연운항', 'lianyungang', '칭다오', 'qingdao', '청도', '르자오', 'rizhao', '웨이하이', 'weihai', '위해', '톈진', 'tianjin', '환적', 'transshipment', '크레인', 'gantry crane', '항만 노조', '파업', 'strike', 'dock strike', '처리능력', '하역', '컨테이너 터미널', '항만 혼잡', 'port congestion', '선석', 'berth', '복합물류단지',
  ],
  환율: [
    '환율', '환율 변동성', 'usd/krw', '원/달러', '달러 강세', '달러 약세', 'cny/krw', '위안화', '인민은행', 'pboc', 'kzt', '텡게', 'uzs', '우즈베키스탄 솜', 'kgs', '키르기스스탄 솜', '한국은행', 'bok', '외환시장', 'fx', 'exchange rate', 'currency', 'dollar index', 'dxy', '연준', 'fed', 'fomc', '기준금리', '미 국채금리', '환헤지', '슬라이딩 조항',
  ],
  유가: [
    '유가', 'brent', '브렌트유', 'wti', '두바이유', 'dubai crude', '국제유가', 'opec', 'opec+', '증산', '감산', '원유 재고', 'baf', 'bunker adjustment factor', '유류할증료', 'bunker surcharge', '벙커유', '해상운임', 'scfi', 'ccfi', '홍해', 'red sea', '수에즈운하', 'suez canal', '후티', 'houthi', '파나마운하', 'panama canal', '항로 우회',
  ],
  통관: [
    '통관', '통관 지연', '관세', '관세청', '세관', 'customs', '수입신고', '사전 신고', '전자신고', 'e-customs', '전자통관', 'e-tir', 'e-waybill', '원산지증명서', '위험물 신고서', 'dg declaration', '검역', '서류 요건', '비관세장벽', '무역장벽', 'customs committee', '계류', '억류',
  ],
  규제: [
    'osjd', 'organisation for cooperation of railways', 'smgs', '화물운송장', '전자문서화', '국경통과 협정', '컨테이너 봉인', 'seal', '보조금 축소', '보조금 정책', '정책 변경', '고시', '법령 개정', '규정 개정', '안전운임제', '물류정책기본계획', '철도산업발전기본법', '스마트물류센터', 'cbam', '탄소국경조정제도', '환경 규제', '배출 규제',
  ],
  지정학: [
    '러시아', 'ukraine', '우크라이나', 'sanction', '제재', '대러 제재', 'tsr', '시베리아횡단철도', '지정학적 리스크', 'geopolitical risk', '물류 우회', '물류 전환', 'tcr 전환', '카자흐스탄 정정불안', '중앙아시아 정세', '국경 분쟁', '무역 갈등', '미중 갈등', '관세 전쟁', '공급망 재편', '중동 정세', '대만해협',
  ],
};

const COMMON_KEYWORDS = [
  '오봉', '의왕', '부산항', 'bpa', '알마티', 'almaty', '아스타나', 'astana', '타슈켄트', 'tashkent', '비슈케크', 'bishkek', '시안', "xi'an", '카자흐스탄', 'kazakhstan', '우즈베키스탄', 'uzbekistan', '키르기스스탄', 'kyrgyzstan', '중앙아시아', 'central asia', '유라시아', 'eurasia', 'korail', 'ktz', 'uty', 'rzd', '물동량', '운임', '컨테이너 운임', '철도 운임', '국제복합운송', 'multimodal transport', 'freight', 'cargo', '화물', '화물열차', '수출입', '무역', 'trade', '공급망', 'supply chain', '물류 리스크', 'logistics risk', '원자재 가격', '인플레이션',
];

export function classifyRelevantNews(text: string): NewsCategory | null {
  const normalized = text.toLocaleLowerCase();
  let best: { category: NewsCategory; score: number } | null = null;
  for (const [category, keywords] of Object.entries(NEWS_KEYWORDS) as Array<[NewsCategory, string[]]>) {
    const score = keywords.reduce((count, keyword) => count + (normalized.includes(keyword.toLocaleLowerCase()) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { category, score };
  }
  if (best) return best.category;
  return COMMON_KEYWORDS.some((keyword) => normalized.includes(keyword.toLocaleLowerCase())) ? 'TCR' : null;
}
