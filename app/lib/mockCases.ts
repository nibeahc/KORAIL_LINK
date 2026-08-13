import type { CaseItem } from './types';

/**
 * DB가 비어있거나 로그인 전(RLS 차단)일 때의 폴백 데이터.
 * 알마티 건은 TCR 환적(부산항→연운항→알마티) 경유, 시안 건은 중국 내륙 직통 —
 * Phase 1의 routeData.ts 분기(TCR 경유 여부)를 처음부터 두 갈래로 검증할 수 있게 한다.
 */
export const initialCases: CaseItem[] = [
  {
    id: 'case-almaty-001',
    caseNumber: 'KL-2026-0001',
    shipperName: '대한무역',
    cargoType: '건설중장비 부품',
    route: '오봉 → 부산항 → 연운항 → 알마티',
    containerType: '40FT HC x 2',
    price: 3220,
    status: 'quote_confirmed',
    createdAt: '2026-07-02T09:00:00+09:00',
    masterData: {
      shipperName: '대한무역',
      cargoType: '건설중장비 부품',
      origin: '오봉',
      destination: '알마티',
      containerType: '40FT HC',
      containerCount: 2,
      totalWeightTon: 58.0,
      shipmentDate: '2026-08-20',
      incoterms: 'CIF',
      changeHistory: [],
    },
    costLedger: [
      { stageId: 'obong-busan', stageName: '오봉→부산항', mode: '국내철도', quotedAmount: 260, contractAmount: 260, currency: 'USD', source: '수기 입력' },
      { stageId: 'busan-lianyungang', stageName: '부산항→연운항', mode: '해상운임', quotedAmount: 640, contractAmount: 640, currency: 'USD', source: '수기 입력' },
      { stageId: 'lianyungang-almaty', stageName: '연운항→알마티', mode: 'TCR철도', quotedAmount: 1900, contractAmount: 1900, currency: 'USD', source: '수기 입력' },
      { stageId: 'transload', stageName: '환적', mode: '환적료', quotedAmount: 420, contractAmount: 420, currency: 'USD', source: '수기 입력' },
    ],
  },
  {
    id: 'case-xian-002',
    caseNumber: 'KL-2026-0002',
    shipperName: '동북물산',
    cargoType: '전자부품',
    route: '오봉 → 만저우리 → 시안',
    containerType: '40FT x 1',
    price: 1450,
    status: 'pending_validation',
    createdAt: '2026-07-18T14:30:00+09:00',
    masterData: {
      shipperName: '동북물산',
      cargoType: '전자부품',
      origin: '오봉',
      destination: '시안',
      containerType: '40FT',
      containerCount: 1,
      totalWeightTon: 22.5,
      shipmentDate: '2026-09-05',
      incoterms: 'FOB',
      changeHistory: [],
    },
    costLedger: [
      { stageId: 'obong-manzhouli', stageName: '오봉→만저우리', mode: '국내철도', quotedAmount: 210, contractAmount: 210, currency: 'USD', source: '수기 입력' },
      { stageId: 'manzhouli-xian', stageName: '만저우리→시안', mode: '중국내륙철도', quotedAmount: 1240, contractAmount: 1240, currency: 'USD', source: '수기 입력' },
    ],
  },
  {
    id: 'case-tashkent-003',
    caseNumber: 'KL-2026-0003',
    shipperName: '한중섬유',
    cargoType: '방직 원단',
    route: '오봉 → 부산항 → 연운항 → 타슈켄트',
    containerType: '20FT x 3',
    price: 2680,
    status: 'needs_review',
    createdAt: '2026-08-01T11:15:00+09:00',
    masterData: {
      shipperName: '한중섬유',
      cargoType: '방직 원단',
      origin: '오봉',
      destination: '타슈켄트',
      containerType: '20FT',
      containerCount: 3,
      totalWeightTon: 41.2,
      shipmentDate: '2026-09-12',
      incoterms: 'CIF',
      changeHistory: [],
    },
    costLedger: [
      { stageId: 'obong-busan', stageName: '오봉→부산항', mode: '국내철도', quotedAmount: 240, contractAmount: 240, currency: 'USD', source: '수기 입력' },
      { stageId: 'busan-lianyungang', stageName: '부산항→연운항', mode: '해상운임', quotedAmount: 600, contractAmount: 600, currency: 'USD', source: '수기 입력' },
      { stageId: 'lianyungang-tashkent', stageName: '연운항→타슈켄트', mode: 'TCR철도', quotedAmount: 1440, contractAmount: 1440, currency: 'USD', source: '수기 입력' },
      { stageId: 'transload', stageName: '환적', mode: '환적료', quotedAmount: 400, contractAmount: 400, currency: 'USD', source: '수기 입력' },
    ],
  },
];
