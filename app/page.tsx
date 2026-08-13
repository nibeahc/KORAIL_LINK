/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CaseItem, CaseStatus } from "./lib/types";
import { historicalQuotes, marketSeries } from "./lib/marketData";
import { buildMarketIndexSeries, detectAnomaly, matchSimilarQuotes, parseContainerType, parseRoute, toTransportMonth, verdictFromQuote, windowChangePct, type Verdict } from "./lib/quoteEngine";
import { DOCUMENT_TYPES, DOCUMENT_INFO, buildDocumentExtraction, buildInvoiceComparison, type DocumentType, type DocState, type InvoiceComparison } from "./lib/documentEngine";
import { newsArticles, type NewsArticle, type NewsCategory } from "./lib/newsData";
import { buildCausalAnalysis, buildQuotePressureAnalysis, buildSubstitutionSignal, type IndicatorInput, type QuotePressureAnalysis } from "./lib/causalAnalysis";
import type { MarketPoint } from "./lib/marketData";
import { buildRoutePath, type MarketFactorKey, type RoutePath } from "./lib/routeData";
import { buildQuoteDraft, costBearingStages, splitCostByStages, type QuoteDraft } from "./lib/quoteDraftEngine";
import { buildContractClauses, SMGS_REFERENCE_ITEMS, type ContractClause } from "./lib/contractEngine";
import { seasonalityForDate } from "./lib/seasonality";
import { buildTaxInvoice } from "./lib/taxInvoiceEngine";
import { answerDispute, type ChatMessage } from "./lib/disputeChatEngine";
import { listCases, createCase as createSupabaseCase, updateCaseStatus, uploadCaseDocument, saveDocumentRecord, saveTaxInvoice, saveDisputeMessage, saveContract, isPermissionError } from "./lib/supabase";

type SupabaseCaseRow = {
  id: string;
  case_number: string;
  title: string;
  status: string;
  origin: string | null;
  destination: string | null;
  cargo_type: string | null;
  currency: string | null;
  created_at: string;
  metadata: { shipper?: string; container?: string; forwarder?: string; price?: number; departure?: string; weight?: number } | null;
};

// Supabase cases 테이블 행 → 화면이 쓰는 CaseItem으로 변환. DB엔 없는 화면 전용 필드(견적금액·
// 중량 등)는 metadata jsonb 컬럼에 넣어뒀다가 여기서 꺼내 쓴다.
function fromSupabaseCase(row: SupabaseCaseRow): CaseItem {
  const metadata = row.metadata ?? {};
  const statuses: CaseStatus[] = ["검증 대기", "검토 필요", "견적 확정", "계약", "정산"];
  const status = statuses.includes(row.status as CaseStatus) ? row.status as CaseStatus : "검증 대기";
  return {
    id: row.case_number,
    shipper: metadata.shipper ?? "미입력",
    route: `${row.origin ?? "미정"} → ${row.destination ?? "미정"}`,
    item: row.cargo_type ?? row.title,
    container: metadata.container ?? "미입력",
    forwarder: metadata.forwarder ?? "코레일",
    price: Number(metadata.price ?? 0),
    status,
    date: row.created_at.slice(0, 10).replaceAll("-", "."),
    departure: metadata.departure ?? row.created_at.slice(0, 10),
    weight: Number(metadata.weight ?? 0),
  };
}

// 유라시아 철도 국제복합운송은 여러 프레이트포워더가 경쟁 입찰하는 구조가 아니라
// 코레일이 중국 국가철도그룹(CR)과 직접 협력해 운영하는 단독 사업이다
// (외부 조사로 확인 — 배경 조사 문서 참고. 실제로는 자회사 코레일로지스가 집행주체이지만,
// 서비스 스토리에서는 "코레일" 하나로 표기를 단순화했다 — HANDOFF.md 참고).
// 그래서 목업 Case도 "여러 포워더 중 견적 비교"가 아니라 전부 코레일 단일 견적으로 통일한다.
// 여기서 "포워더"는 코레일 안에서 이 견적을 산정한 담당(역할)을 가리키고,
// KORAIL LINK를 실제로 쓰는 담당자는 그 견적을 검증하는 별도 역할이다.
const initialCases: CaseItem[] = [
  {id:"KORAIL-2026-001",shipper:"ABC Motors",route:"오봉 → 알마티",item:"자동차부품",container:"40FT × 3",forwarder:"코레일",price:3400,status:"검토 필요",date:"2026.08.10",departure:"2026-08-24",weight:58},
  {id:"KORAIL-2026-002",shipper:"Hanul Electronics",route:"오봉 → 타슈켄트",item:"전자부품",container:"40FT × 2",forwarder:"코레일",price:2980,status:"검토 필요",date:"2026.08.09",departure:"2026-08-20",weight:36},
  {id:"KORAIL-2026-003",shipper:"Daehan Steel",route:"부산 → 시안",item:"철강 코일",container:"20FT × 5",forwarder:"코레일",price:2240,status:"검증 대기",date:"2026.08.08",departure:"2026-08-18",weight:112},
  {id:"KORAIL-2026-004",shipper:"Mirae Chemical",route:"의왕 → 비슈케크",item:"산업 소재",container:"40FT × 1",forwarder:"코레일",price:3650,status:"견적 확정",date:"2026.08.06",departure:"2026-08-15",weight:22},
  {id:"KORAIL-2026-005",shipper:"Seoul Trading",route:"오봉 → 아스타나",item:"소비재",container:"40FT × 4",forwarder:"코레일",price:4120,status:"계약",date:"2026.08.03",departure:"2026-08-12",weight:64},
];

const Icon = ({name}:{name:string}) => <span className="icon" aria-hidden>{({home:"⌂",case:"▤",search:"⌕",contract:"◇",bill:"▦",settings:"⚙",bell:"♢",plus:"＋",arrow:"→",check:"✓",info:"i",spark:"✦",external:"↗",copy:"▣",download:"↓",print:"⌘",waybill:"⇄",bl:"⚓",time:"◷"} as Record<string,string>)[name] || "•"}</span>;
const NAV_ICON_SRC:Record<string,string>={home:"/icons/nav-home.svg",search:"/icons/nav-search.svg",case:"/icons/nav-shipment.svg"};
const NavIcon=({name}:{name:'home'|'search'|'case'})=><img className={`nav-icon nav-icon-${name}`} src={NAV_ICON_SRC[name]} alt="" aria-hidden/>;
const money = (n:number) => `$${n.toLocaleString()}`;
const statusClass = (s:string) => s==='계약' ? "violet" : s.includes("검토") ? "amber" : s.includes("확인") ? "red" : s.includes("확정") ? "blue" : s.includes("정산") ? "green" : "neutral";
// Case 목록에서 화살표를 클릭하면 지금 그 Case가 멈춰있는 단계로 바로 들어가야지,
// 항상 "견적 검증" 탭부터 보여주면 안 된다. 상태 → 탭 매핑을 한 곳에 모아둔다.
const statusTab = (s:CaseStatus):string => s==='견적 확정'?'계약':s==='계약'?'문서':'견적 검증';
const caseHref = (id:string,status:CaseStatus) => `/cases/${id}?tab=${encodeURIComponent(statusTab(status))}`;

// Case 하나에 대한 검증 결과(유사 Case 매칭·판정·시황 이상탐지)를 한 번만 계산해
// 견적 검증 탭, 정산 탭의 이의제기 챗봇 등 여러 화면이 같은 결과를 공유하도록 한다.
function buildValidation(item: CaseItem) {
  const { origin, destination } = parseRoute(item.route);
  const query = { origin, destination, containerType: parseContainerType(item.container), cargoCategory: item.item, transportMonth: toTransportMonth(item.departure) };
  const matches = matchSimilarQuotes(query, historicalQuotes);
  const verdict = verdictFromQuote(item.price, matches);
  const usdKrw = detectAnomaly(marketSeries.usdKrw);
  const brent = detectAnomaly(marketSeries.brent);
  const cnyKrw = detectAnomaly(marketSeries.cnyKrw);
  const kztUsd = detectAnomaly(marketSeries.kztUsd);
  const uzsUsd = detectAnomaly(marketSeries.uzsUsd);
  const kgsUsd = detectAnomaly(marketSeries.kgsUsd);
  const kci = detectAnomaly(marketSeries.kci);
  // 계절성(A-6)은 시계열·이상탐지가 아니라 출발월 기준 캘린더 규칙이다.
  const seasonality = seasonalityForDate(item.departure);
  // 노선(목적지)에 따라 실제로 관련 있는 구간·시황 지표가 달라진다(routeData.ts 참고).
  const routePath = buildRoutePath(origin, destination);
  return { query, matches, verdict, usdKrw, brent, cnyKrw, kztUsd, uzsUsd, kgsUsd, kci, seasonality, routePath };
}
type ValidationResult = ReturnType<typeof buildValidation>;
// EvidenceDrawer에 전달하는 근거 컨텍스트. indicator가 있으면 시계열 차트+인과분석을,
// category만 있으면 해당 카테고리 뉴스 목록을 보여준다.
type DrawerState = { title: string; indicator?: "usdKrw" | "brent" | "cnyKrw" | "kztUsd" | "uzsUsd" | "kgsUsd" | "kcci" | "kci"; category?: NewsCategory; articleId?: string };

// Validation 탭과 이의제기 챗봇(Settlement 탭)이 같은 "운임 압박 요인 분석"을 공유해야 하므로
// 공용 함수로 뺐다 — 로직을 두 곳에 복붙하면 나중에 한쪽만 고치는 실수가 생기기 쉽다.
function buildPressure(validation: ValidationResult) {
  const allIndicators: IndicatorInput[] = [
    { key: 'usdKrw', label: 'USD/KRW 환율', anomaly: validation.usdKrw },
    { key: 'cnyKrw', label: 'CNY/KRW 환율', anomaly: validation.cnyKrw },
    { key: 'brent', label: 'Brent 유가', anomaly: validation.brent },
  ];
  const pressureIndicators = allIndicators.filter(i => validation.routePath.relevantFactors.includes(i.key as MarketFactorKey));
  return buildQuotePressureAnalysis(validation.verdict.diffPct, pressureIndicators, newsArticles);
}

export default function Home() {
  // 서버와 첫 클라이언트 렌더를 동일하게 유지한 뒤 실제 URL을 동기화한다.
  // 직접 /cases로 진입할 때 사이드바 상태가 달라져 hydration 경고가 뜨는 문제를 막는다.
  const [path,setPathState] = useState("/");
  const [navCollapsed,setNavCollapsed] = useState(false);
  const [cases,setCases] = useState<CaseItem[]>(initialCases);
  const [toast,setToast] = useState("");
  // setCasesAndPersist(아래)가 Supabase에 쓰기 전에 "새로 추가된 항목"을 판단하려면 갱신 직전의
  // cases가 필요하다 — 클로저로 캡처하면 연속 갱신 시 오래된 값을 볼 수 있어 ref로 항상 최신값을 든다.
  const casesRef = useRef(cases);
  const notify=(m:string)=>{setToast(m);setTimeout(()=>setToast(""),2300)};
  useEffect(() => { casesRef.current = cases; }, [cases]);
  useEffect(() => {
    let active = true;
    listCases().then(rows => {
      if (!active || rows.length === 0) return;
      const remoteCases = rows.map(row => fromSupabaseCase(row as SupabaseCaseRow));
      // 데모 목록은 피그마 시나리오의 5건을 항상 보여준다. 저장소에 아직 4건만
      // 들어 있는 초기 환경에서는 불완전한 조회 결과로 기본 목록을 덮어쓰지 않는다.
      setCases(remoteCases.length >= 5 ? remoteCases : initialCases);
    }).catch(() => {
      // 로그인 전에는 RLS가 조회를 막을 수 있으므로 목업 데이터로 화면을 유지한다.
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const onFileChange = async (event: Event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file || !input.id.startsWith('upload-')) return;
      const caseId = location.pathname.match(/\/cases\/([^/]+)/)?.[1];
      if (!caseId) return;
      const documentType = input.id.replace('upload-', '').replace('-settlement', '');
      try {
        const storagePath = await uploadCaseDocument(decodeURIComponent(caseId), file);
        await saveDocumentRecord({ caseId: decodeURIComponent(caseId), file, documentType, storagePath });
      } catch (error) {
        console.error('문서 Storage 저장 실패:', error);
        notify(isPermissionError(error) ? '로그인 권한이 없어 문서를 저장할 수 없습니다.' : '문서 업로드에 실패했습니다. 파일 형식과 Storage 정책을 확인해주세요.');
      }
    };
    document.addEventListener('change', onFileChange, true);
    return () => document.removeEventListener('change', onFileChange, true);
  }, []);
  useEffect(()=>{const f=()=>setPathState(location.pathname+location.search);f();addEventListener("popstate",f);return()=>removeEventListener("popstate",f)},[]);
  useEffect(()=>{const openReference=(event:MouseEvent)=>{const target=event.target as Element|null;const card=target?.closest('.causal-analysis') as HTMLElement|null;if(!card)return;const rect=card.getBoundingClientRect();if(event.clientX<rect.right-210||event.clientY>rect.top+62)return;const referenceTab=[...document.querySelectorAll<HTMLButtonElement>('.figma-case-detail .tabs button')].find(button=>button.textContent?.trim()==='참고정보');referenceTab?.click();window.scrollTo({top:0,behavior:'smooth'})};document.addEventListener('click',openReference);return()=>document.removeEventListener('click',openReference)},[]);
  const go=(p:string)=>{history.pushState({},"",p);setPathState(p);scrollTo(0,0)};
  // setCases와 똑같이 배열이나 업데이터 함수(xs=>xs.map(...))를 그대로 받아 CaseWorkspace/NewCase의
  // 기존 호출부를 하나도 바꾸지 않고 끼워 넣는다. Supabase 저장은 화면 상태 갱신을 막지 않는
  // best-effort로 처리한다 — 실패해도 로컬 UI는 그대로 반영하고 토스트로만 알린다.
  const setCasesAndPersist: React.Dispatch<React.SetStateAction<CaseItem[]>> = (action) => {
    const prev = casesRef.current;
    const next = typeof action === 'function' ? (action as (p: CaseItem[]) => CaseItem[])(prev) : action;
    const fresh = next.find(item => !prev.some(existing => existing.id === item.id));
    if (fresh) {
      const [origin, destination] = fresh.route.split(' → ');
      createSupabaseCase({
        case_number: fresh.id,
        title: fresh.item,
        origin: origin ?? fresh.route,
        destination: destination ?? '',
        cargo_type: fresh.item,
      }).catch(error => { console.error('Case DB 저장 실패:', error); notify(isPermissionError(error) ? '로그인 권한이 없어 Case를 저장할 수 없습니다.' : 'Case 저장에 실패했습니다. 다시 시도해주세요.'); });
    }
    next.forEach(item => {
      const previous = prev.find(existing => existing.id === item.id);
      if (previous && previous.status !== item.status) {
        updateCaseStatus(item.id, item.status).catch(error => { console.error('Case 상태 DB 저장 실패:', error); notify(isPermissionError(error) ? '로그인 권한이 없어 상태를 저장할 수 없습니다.' : 'Case 상태 저장에 실패했습니다.'); });
        if (item.status === '계약') saveContract({ caseId: item.id, terms: { route: item.route, item: item.item, price: item.price, currency: 'USD' }, signStatus: 'signed' }).catch(error => console.error('계약 저장 실패:', error));
      }
    });
    setCases(next);
  };
  // 사이드바 "계약"/"정산"에서 Case로 들어올 때 어느 탭을 먼저 보여줄지는 ?tab= 쿼리로 넘긴다.
  // 이 앱은 별도 라우터 없이 path 문자열을 그대로 쓰므로, 쿼리 파싱도 직접 처리한다.
  const [pathBase,queryString]=path.split('?');
  const queryParams=new URLSearchParams(queryString);
  const initialTab=queryParams.get('tab')||undefined;
  const initialContractDraft=queryParams.get('contractDraft')==='1';
  const selected = pathBase.startsWith("/cases/") && pathBase!=="/cases/new" ? cases.find(c=>c.id===decodeURIComponent(pathBase.split("/")[2])) || cases[0] : cases[0];
  const needsAttention = cases.filter(c=>c.status==='검토 필요').length;
  const contractCount = cases.filter(c=>c.status==='계약').length;
  const documentCount = cases.filter(c=>c.status==='계약').length;
  const settlementCount = cases.filter(c=>c.status==='정산').length;
  const displayName = '사용자';
  return <div className={`app${navCollapsed?' nav-collapsed':''}`}>
    <Sidebar path={pathBase} go={go} needsAttention={needsAttention} contractCount={contractCount} documentCount={documentCount} settlementCount={settlementCount} displayName={displayName}/>
    <div className="stage"><Topbar collapsed={navCollapsed} toggleNav={()=>setNavCollapsed(v=>!v)}/>
      <main>
        {pathBase==="/" && <Dashboard cases={cases} go={go} displayName={displayName}/>}
        {pathBase==="/cases" && <CaseList cases={cases} go={go}/>}
        {pathBase==="/cases/new" && <NewCase cases={cases} setCases={setCasesAndPersist} go={go} notify={notify}/>}
        {pathBase.startsWith("/cases/") && pathBase!=="/cases/new" && <CaseWorkspace key={selected?.id} item={selected} initialTab={initialTab} initialContractDraft={initialContractDraft} setCases={setCasesAndPersist} notify={notify}/>} 
        {pathBase==="/search" && <GlobalSearch cases={cases} notify={notify}/>}
        {(pathBase==="/contracts" || pathBase==="/documents" || pathBase==="/settlements") && <ModuleList type={pathBase==="/contracts"?"계약":pathBase==="/documents"?"문서":"정산"} cases={cases} go={go}/>}
      </main>
    </div>
    {toast && <div className="toast"><Icon name="check"/>{toast}</div>}
  </div>
}

// 사이드바 조직 축을 "운임 인텔리전스 vs 업무 연결"에서 파이프라인 단계 순서로 재편한다 —
// 리서치(홈·검색)와 파이프라인(견적 생성 → 화물 운송 하위에 계약·문서·정산)으로 구분.
// 계약·문서·정산은 화물 운송(Case)에 속한 뷰라 별도 상위 항목이 아니라 화물 운송의 아코디언
// 하위로 둔다.
function Sidebar({path,go,needsAttention,contractCount,documentCount,settlementCount,displayName}:{path:string;go:(p:string)=>void;needsAttention:number;contractCount:number;documentCount:number;settlementCount:number;displayName:string}){
 const shipmentActive = path.startsWith('/cases')||path==='/contracts'||path==='/documents'||path==='/settlements';
 // manualOpen이 null이면 현재 경로가 화물운송 계열인지에 따라 자동으로 펼침/접힘이 결정되고,
 // 사용자가 화살표를 눌러 한 번이라도 직접 토글하면 그 선택을 우선한다.
 const [manualOpen,setManualOpen]=useState<boolean|null>(null);
 const open = manualOpen===null?shipmentActive:manualOpen;
 const subItems:[string,string,number][]=[['/contracts','계약',contractCount],['/documents','문서',documentCount],['/settlements','정산',settlementCount]];
 return <aside className="sidebar"><button className="brand" onClick={()=>go('/')}><span className="brandmark">K</span><span><b>KORAIL</b> LINK<small>GLOBAL LOGISTICS</small></span></button><nav>
  <div className="sidebar-group"><span className="sidebar-group-label">리서치</span>
   <button className={path==='/'?'active':''} onClick={()=>go('/')}><NavIcon name="home"/>홈</button>
   <button className={path==='/search'?'active':''} onClick={()=>go('/search')}><NavIcon name="search"/>시황·정보 검색</button>
  </div>
  <div className="sidebar-group"><span className="sidebar-group-label">파이프라인</span>
   <button className={path==='/cases/new'?'active':''} onClick={()=>go('/cases/new')}><Icon name="spark"/>견적 생성</button>
   <div className="sidebar-expand-row">
    <button className={shipmentActive?'active':''} onClick={()=>{go('/cases');setManualOpen(true)}}><NavIcon name="case"/>화물 운송{needsAttention>0&&<em>{needsAttention}</em>}</button>
    <button type="button" className="sidebar-chev" aria-label={open?'접기':'펼치기'} onClick={()=>setManualOpen(!open)}>{open?'▴':'▾'}</button>
   </div>
   {open&&<div className="sidebar-sub">{subItems.map(([p,l,c])=><button key={p} className={path===p?'active':''} onClick={()=>go(p)}>{l}{c>0&&<em>{c}</em>}</button>)}</div>}
  </div>
 </nav><div className="side-bottom"><button><Icon name="settings"/>설정</button><div className="profile"><span>{displayName.slice(0,1)}</span><div><b>{displayName}</b></div></div></div></aside>
}

// 능동적 알림 우선 원칙(4장) — 상단 환율 배지도 목업이 아니라 실제 시계열의 최신값·전일 대비 변동을 그대로 노출한다.
function Topbar({collapsed,toggleNav}:{collapsed:boolean;toggleNav:()=>void}){
 const usdKrw=detectAnomaly(marketSeries.usdKrw);
 return <header className="topbar"><div className="top-brand"><button type="button" aria-label={collapsed?'사이드 메뉴 펼치기':'사이드 메뉴 접기'} aria-expanded={!collapsed} onClick={toggleNav}>☰</button><img className="korail-logo" src="/korail-link-logo.svg" alt="KORAIL LINK"/></div><div className="top-actions"><div className="fx">USD/KRW <b>{(usdKrw?.latestValue??0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</b> <span>{(usdKrw?.changePct??0)>=0?'+':''}{(usdKrw?.changePct??0).toFixed(1)}%</span></div><span className="date">2026년 8월 10일 월요일</span></div></header>
}

function PageTitle({eyebrow,title,desc,action}:{eyebrow?:string,title:string,desc?:string,action?:React.ReactNode}){return <div className="page-title"><div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{desc&&<p>{desc}</p>}</div>{action}</div>}
function Badge({children,tone="blue"}:{children:React.ReactNode,tone?:string}){return <span className={`badge ${tone}`}><i/>{children}</span>}

// 도넛(링) 차트 — Case 상태별 분포처럼 "전체 대비 구성비"를 보여줄 때 쓴다.
// stroke-dasharray로 세그먼트를 이어붙이는 방식이라 값이 0인 세그먼트는 자동으로 생략된다.
function DonutChart({segments,size=140,thickness=20}:{segments:{label:string;value:number;color:string}[];size?:number;thickness?:number}){
 const total=segments.reduce((s,x)=>s+x.value,0);
 const arcTotal=total||1;
 const r=(size-thickness)/2;
 const c=2*Math.PI*r;
 const arcs=segments.filter(s=>s.value>0).reduce<Array<{label:string;color:string;dash:number;offset:number}>>((acc,s)=>{
  const dash=(s.value/arcTotal)*c;
  const offset=acc.length?acc[acc.length-1].offset+acc[acc.length-1].dash:0;
  return [...acc,{label:s.label,color:s.color,dash,offset}];
 },[]);
 return <div className="donut-wrap" style={{width:size,height:size}}>
  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
   <g transform={`rotate(-90 ${size/2} ${size/2})`}>
    {arcs.map(s=><circle key={s.label} cx={size/2} cy={size/2} r={r} fill="none" stroke={s.color} strokeWidth={thickness} strokeDasharray={`${s.dash} ${c-s.dash}`} strokeDashoffset={-s.offset}/>)}
   </g>
  </svg>
  <div className="donut-center"><b>{total}</b><span>전체 건</span></div>
 </div>
}

const toneColor=(tone:string)=>tone==='green'?'#1f8a5b':tone==='amber'?'#d78516':'#d93d42';

// 대시보드 "KORAIL LINK 종합 지수" 차트 — 과거 견적을 노선별로 표준화(z-score)해 만든
// 월별 지수 추이(선+영역)에, 진행 중인 Case 5건의 오늘 시점 위치(σ 단위, 판정 색상)를
// 오른쪽에 별도 구간으로 분리해 점으로 찍는다. 시계열(과거)과 스냅샷(오늘)을 같은 선 위에
// 잇지 않도록 "오늘" 구간을 세로선으로 분리한 것이 포인트.
function MarketIndexChart({monthly,todayPoints}:{monthly:{month:string;avgZ:number}[];todayPoints:{id:string;z:number;tone:string}[]}){
 const W=560,H=150,pad=14;
 const allZ=[...monthly.map(m=>m.avgZ),...todayPoints.map(p=>p.z),1,-1];
 const maxAbs=Math.max(...allZ.map(Math.abs),1.5);
 const y=(z:number)=>H/2-(z/maxAbs)*(H/2-pad);
 const histW=W*0.6,todayW=W-histW-24;
 const xOf=(i:number)=>monthly.length>1?(i/(monthly.length-1))*(histW-20)+10:histW/2;
 const linePts=monthly.map((m,i)=>`${xOf(i).toFixed(1)},${y(m.avgZ).toFixed(1)}`).join(' ');
 const areaPts=monthly.length?`${xOf(0).toFixed(1)},${y(0).toFixed(1)} ${linePts} ${xOf(monthly.length-1).toFixed(1)},${y(0).toFixed(1)}`:'';
 const todayX=(i:number)=>histW+24+(todayPoints.length>1?(i/(todayPoints.length-1))*(todayW-20):todayW/2);
 return <svg viewBox={`0 0 ${W} ${H+18}`} className="index-chart">
  <rect x={0} y={y(1)} width={W} height={Math.max(y(-1)-y(1),1)} fill="#eef4fd" opacity={0.6}/>
  <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="#dde3ea" strokeDasharray="3 3"/>
  <line x1={histW+10} x2={histW+10} y1={pad} y2={H-pad} stroke="#e5eaf1"/>
  {monthly.length>0&&<polygon points={areaPts} fill="#c7d9f5" opacity={0.5}/>}
  {monthly.length>0&&<polyline points={linePts} fill="none" stroke="#2c4870" strokeWidth={2}/>}
  {monthly.map((m,i)=><circle key={m.month} cx={xOf(i)} cy={y(m.avgZ)} r={3} fill="#2c4870"/>)}
  {todayPoints.map((p,i)=><circle key={p.id} cx={todayX(i)} cy={y(p.z)} r={4.5} fill={toneColor(p.tone)} stroke="white" strokeWidth={1.5}/>)}
  {monthly.map((m,i)=><text key={m.month} x={xOf(i)} y={H+13} textAnchor="middle" className="index-x-label">{Number(m.month.slice(5))}월</text>)}
  <text x={histW+24+todayW/2} y={H+13} textAnchor="middle" className="index-x-label index-today-label">오늘</text>
 </svg>
}

function Dashboard({cases,go,displayName}:{cases:CaseItem[];go:(p:string)=>void;displayName:string}){
 const [drawer,setDrawer]=useState<DrawerState|null>(null);
 const [chatOpen,setChatOpen]=useState(false);
 const usdKrw=detectAnomaly(marketSeries.usdKrw);
 const brent=detectAnomaly(marketSeries.brent);
 const cnyKrw=detectAnomaly(marketSeries.cnyKrw);
 const kztUsd=detectAnomaly(marketSeries.kztUsd);
 const uzsUsd=detectAnomaly(marketSeries.uzsUsd);
 const kgsUsd=detectAnomaly(marketSeries.kgsUsd);
 const kcci=detectAnomaly(marketSeries.kcci);
 const kci=detectAnomaly(marketSeries.kci);
 const pctLabel=(p:number)=>`${p>=0?'+':'−'}${Math.abs(p).toFixed(1)}%`;
 const markets:{label:string;indicator:'usdKrw'|'cnyKrw'|'kztUsd'|'uzsUsd'|'kgsUsd'|'kcci'|'kci'|'brent';value:string;pct:string;trend:'up'|'down';series?:MarketPoint[]}[]=[
   {label:'USD/KRW',indicator:'usdKrw',value:(usdKrw?.latestValue??0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}),pct:pctLabel(usdKrw?.changePct??0),trend:(usdKrw?.changePct??0)>=0?'up':'down',series:marketSeries.usdKrw},
   {label:'CNY/KRW',indicator:'cnyKrw',value:(cnyKrw?.latestValue??0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}),pct:pctLabel(cnyKrw?.changePct??0),trend:(cnyKrw?.changePct??0)>=0?'up':'down',series:marketSeries.cnyKrw},
   {label:'USD/KZT',indicator:'kztUsd',value:(kztUsd?.latestValue??0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}),pct:pctLabel(kztUsd?.changePct??0),trend:(kztUsd?.changePct??0)>=0?'up':'down',series:marketSeries.kztUsd},
   {label:'USD/UZS',indicator:'uzsUsd',value:(uzsUsd?.latestValue??0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0}),pct:pctLabel(uzsUsd?.changePct??0),trend:(uzsUsd?.changePct??0)>=0?'up':'down',series:marketSeries.uzsUsd},
   {label:'USD/KGS',indicator:'kgsUsd',value:(kgsUsd?.latestValue??0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}),pct:pctLabel(kgsUsd?.changePct??0),trend:(kgsUsd?.changePct??0)>=0?'up':'down',series:marketSeries.kgsUsd},
   {label:'KCCI',indicator:'kcci',value:(kcci?.latestValue??0).toLocaleString(),pct:pctLabel(kcci?.changePct??0),trend:(kcci?.changePct??0)>=0?'up':'down',series:marketSeries.kcci},
   {label:'KCI(한중항로)',indicator:'kci',value:(kci?.latestValue??0).toLocaleString(),pct:pctLabel(kci?.changePct??0),trend:(kci?.changePct??0)>=0?'up':'down',series:marketSeries.kci},
   {label:'BRENT',indicator:'brent',value:`$${(brent?.latestValue??0).toFixed(2)}`,pct:pctLabel(brent?.changePct??0),trend:(brent?.changePct??0)>=0?'up':'down',series:marketSeries.brent},
 ];
 const needsAttention=cases.filter(c=>c.status==='검토 필요').length;
 const processed=cases.filter(c=>c.status==='견적 확정'||c.status==='계약'||c.status==='정산').length;
 const contractPending=cases.filter(c=>c.status==='계약').length;
 const documentCount=cases.filter(c=>c.status==='계약').length;
 const settlementPending=cases.filter(c=>c.status==='정산').length;
 // 세 개 섹션(브리핑 리스트/오늘의 업무/진행 중인 견적)이 모두 Case별 σ 판정 결과가 필요하므로
 // buildValidation을 한 번씩만 호출해 재사용한다.
 const validations = cases.map(c => ({ item: c, validation: buildValidation(c) }));
 const progressPct=cases.length?Math.round(processed/cases.length*100):0;
 // 노선(목적지)에 따라 실제로 TCR 환적을 거치는지가 갈리므로(routeData.ts), 하드코딩 없이
 // 각 Case의 실제 route로 다시 계산한다 — 운임 인텔리전스 탭과 같은 판정 로직을 재사용.
 const tcrCount=cases.filter(c=>{const{origin,destination}=parseRoute(c.route);return buildRoutePath(origin,destination).relevantFactors.includes('tcr')}).length;
 const directCount=cases.length-tcrCount;
 const parseDate=(s:string)=>new Date(s.replace(/\./g,'-'));
 const avgLeadDays=cases.length?Math.round(cases.reduce((sum,c)=>sum+(parseDate(c.departure).getTime()-parseDate(c.date).getTime())/86400000,0)/cases.length):0;
 const statusOrder:{status:CaseStatus;color:string}[]=[{status:'검증 대기',color:'#8b95a4'},{status:'검토 필요',color:'#bd7217'},{status:'견적 확정',color:'#2865ba'},{status:'계약',color:'#6a4fb0'},{status:'정산',color:'#207c56'}];
 const statusSegments=statusOrder.map(s=>({label:s.status,value:cases.filter(c=>c.status===s.status).length,color:s.color}));
 // 노선·건수 합계처럼 Case를 그냥 더하거나 나열하는 방식은 표본이 5건뿐이라 의미 있는
 // 비교가 되지 않는다 — 대신 44건의 과거 견적을 노선·컨테이너 버킷별로 표준화(z-score)해
 // 월별 추이로 만든 "자체 종합 지수"를 보여주고, 진행 중인 Case 5건은 같은 σ 단위로
 // 오늘 시점의 점으로 찍는다(과거 시계열과 오늘 스냅샷을 구간을 나눠 분리 표시).
 const marketIndex=buildMarketIndexSeries(historicalQuotes);
 const todayPoints=validations.map(({item,validation:v})=>({id:item.id.replace('KORAIL-2026-',''),z:v.verdict.sigma===0?0:v.verdict.diffPct/v.verdict.sigma,tone:v.verdict.tone}));
 // 조사된 실제 영향력 순서(정책·화차공급·지정학이 유가·환율보다 직접적)를 그대로 따른다.
 // WeeklyBriefing(정보 검색 화면)과 동일한 원칙이며, 대시보드 홈 화면에도 같은 우선순위를 반영한다.
 const briefPriorityCats: NewsCategory[] = ['규제','TCR','지정학','연운항'];
 const eventBriefs = briefPriorityCats.map(cat => {
   const items = newsArticles.filter(n=>n.category===cat).sort((a,b)=>b.date.localeCompare(a.date));
   return items.length ? { cat, title: items[0].title, count: items.length } : null;
 }).filter((x): x is { cat: NewsCategory; title: string; count: number } => x !== null);
 // "능동적 알림"을 대체하는 로직 — 벨 아이콘 트리거 대신, 홈 화면 진입 즉시 어떤 Case가
 // 왜 확인이 필요한지를 보여준다. '검토 필요' 상태의 Case에 대해 σ 판정 결과를 사유로
 // 보여준다.
 const attentionItems = validations
   .filter(({item}) => item.status === '검토 필요')
   .map(({item,validation:v}) => {
     const dir = v.verdict.diffPct >= 0 ? '높음' : '낮음';
     const reason = v.verdict.tone === 'red'
         ? `시장가 대비 크게 ${dir} (${v.verdict.diffPct>=0?'+':''}${v.verdict.diffPct.toFixed(1)}%)`
         : v.verdict.tone === 'amber'
           ? `시장가 대비 다소 ${dir} (${v.verdict.diffPct>=0?'+':''}${v.verdict.diffPct.toFixed(1)}%)`
           : '검토 대기 중';
     return { item, reason, tone: v.verdict.tone };
   });
 const idxLast=marketIndex[marketIndex.length-1],idxPrev=marketIndex[marketIndex.length-2];
 const idxTrendUp=idxLast&&idxPrev?idxLast.avgZ>idxPrev.avgZ:null;
 const brentUp=windowChangePct(marketSeries.brent)>=0;
 const indexCaption=idxTrendUp===null?'':`최근 지수 ${idxTrendUp?'상승':'하락'} 흐름${idxTrendUp===brentUp?` · Brent 유가 ${brentUp?'상승':'하락'}과 동행`:''}`;
 return <div className="page dashboard"><div className="figma-hero"><PageTitle title={`좋은 아침입니다, ${displayName}님`} desc="오늘 확인이 필요한 견적과 국제물류 변동 사항을 정리했어요."/><button className="primary compact" onClick={()=>go('/cases/new')}><Icon name="spark"/> AI 견적 생성</button></div>
 <div className="quick-actions">
  <button className="quick-card" onClick={()=>go('/contracts')}><b>계약 {contractPending}건 대기</b><span>AI가 구현한 원가로 추천</span></button>
  <button className="quick-card" onClick={()=>go('/documents')}><b>문서 {documentCount}건 대기</b><span>AI 분석 자동 매칭 및 이상 검증</span></button>
  <button className="quick-card" onClick={()=>go('/settlements')}><b>정산 {settlementPending}건 대기</b><span>AI 생성 내역 대조 및 오류 검증</span></button>
 </div>
 <h2 className="dashboard-label">환율</h2>
 <div className="market-strip">{markets.map((m,i)=><button className="market" key={m.label} onClick={()=>setDrawer({title:INDICATOR_LABELS[m.indicator],indicator:m.indicator})}><span>{m.label}</span><b>{m.value}</b><em className={m.trend}>{m.pct}</em>{m.series?<TrendChart series={m.series} height={25}/>:<svg viewBox="0 0 72 25"><polyline points={i%2?"0,7 12,10 24,8 36,16 48,14 60,20 72,18":"0,19 12,16 24,18 36,10 48,13 60,6 72,8"}/></svg>}</button>)}</div>
 <h2 className="dashboard-label">운송 현황</h2>
 <div className="kpi-row">
  <div className="stat-mini"><span>TCR 환적 경유 노선</span><b>{tcrCount}<em>건</em></b></div>
  <div className="stat-mini"><span>중국 내륙 직통 노선</span><b>{directCount}<em>건</em></b></div>
  <div className="stat-mini"><span>평균 리드타임(등록→출발)</span><b>{avgLeadDays}<em>일</em></b></div>
 </div>
 <h2 className="dashboard-label spaced">KORAIL LINK 종합 지수</h2>
 <section className="card chart-card index-card"><MarketIndexChart monthly={marketIndex} todayPoints={todayPoints}/><div className="legend index-legend"><span><i className="legend-band"/>정상범위(±1σ)</span><span><i className="legend-dot" style={{background:'#1f8a5b'}}/>정상</span><span><i className="legend-dot" style={{background:'#d78516'}}/>다소 높음</span><span><i className="legend-dot" style={{background:'#d93d42'}}/>높음</span></div></section>
 <section className="card active-work"><div className="card-head"><h2>진행 중인 업무</h2><button className="text-btn" onClick={()=>go('/cases')}>전체 업무 보기 <Icon name="arrow"/></button></div><div className="active-work-grid"><div className="work-donut"><DonutChart segments={statusSegments} size={132} thickness={22}/><div className="donut-legend">{statusSegments.filter(s=>s.value>0).map(s=><div className="donut-legend-row" key={s.label}><i style={{background:s.color}}/><span>{s.label}</span><b>{s.value}</b></div>)}</div></div><div className="work-table" aria-label={`진행 중인 업무 ${cases.length}건`}><table><thead><tr><th>CASE 번호</th><th>화주 / 품목</th><th>노선</th><th>견적</th><th>상태</th><th>등록일</th></tr></thead><tbody>{cases.map(c=><tr key={c.id} onClick={()=>go(caseHref(c.id,c.status))}><td>{c.id}</td><td><b>{c.shipper}</b><small>{c.item} · {c.container}</small></td><td>{c.route}</td><td><b>{money(c.price)}</b></td><td><Badge tone={statusClass(c.status)}>{c.status}</Badge></td><td>{c.date}</td></tr>)}</tbody></table></div></div></section>
 <section className="card briefing figma-briefing"><div className="card-head"><h2>오늘의 국제물류 브리핑</h2><button className="text-btn" onClick={()=>go('/search')}>전체 정보 보기 <Icon name="arrow"/></button></div>
  <div className="brief-list">
   {eventBriefs.map(({cat,title,count}) => (
     <Brief key={cat} tone={CATEGORY_TONE[cat]} cat={cat} title={title} meta={`관련도 높음 · 이번 주 ${count}건`} onClick={()=>setDrawer({title,category:cat})}/>
   ))}
   <Brief tone={usdKrw?.isAnomaly?'red':'amber'} cat="FX" title={`원/달러 환율 전일 대비 ${Math.abs(usdKrw?.changePct??0).toFixed(1)}% ${(usdKrw?.changePct??0)>=0?'상승':'하락'}`} meta="주요 변동 · 09:00" onClick={()=>setDrawer({title:INDICATOR_LABELS.usdKrw,indicator:'usdKrw'})}/>
   <Brief tone={brent?.isAnomaly?'red':'amber'} cat="ENERGY" title={`Brent 유가 전일 대비 ${Math.abs(brent?.changePct??0).toFixed(1)}% ${(brent?.changePct??0)>=0?'상승':'하락'}`} meta="시장 지표 · 08:40" onClick={()=>setDrawer({title:INDICATOR_LABELS.brent,indicator:'brent'})}/>
  </div>
 </section>
 <button className="chatbot" onClick={()=>setChatOpen(true)}><img src="/icons/chatbot-train.svg" alt="" aria-hidden/><span>챗봇</span></button>
 {chatOpen&&<HomeChatbot item={cases[0]} close={()=>setChatOpen(false)}/>} 
 {drawer&&<EvidenceDrawer state={drawer} close={()=>setDrawer(null)}/>}</div>
}

function HomeChatbot({item,close}:{item:CaseItem;close:()=>void}){
 const welcome='안녕하세요. KORAIL LINK AI 챗봇입니다. 운송 견적, 계약 및 정산 내역에 대해 궁금한 내용을 질문해 주세요.';
 const [messages,setMessages]=useState<ChatMessage[]>([{role:'bot',text:welcome}]);
 const [input,setInput]=useState('');
 const logRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')close()};addEventListener('keydown',onKey);return()=>removeEventListener('keydown',onKey)},[close]);
 useEffect(()=>{logRef.current?.scrollTo({top:logRef.current.scrollHeight,behavior:'smooth'})},[messages]);
 const send=()=>{
  const question=input.trim();
  if(!question)return;
  const validation=buildValidation(item);
  const answer=answerDispute(question,item,validation.verdict,buildPressure(validation),buildInvoiceComparison(item));
  setMessages(m=>[...m,{role:'user',text:question},{role:'bot',text:answer}]);
  setInput('');
 };
 return <><button className="chat-overlay" aria-label="챗봇 닫기" onClick={close}/><section className="home-chat-modal" role="dialog" aria-modal="true" aria-labelledby="home-chat-title">
  <header><h2 id="home-chat-title">AI 챗봇</h2><button type="button" aria-label="닫기" onClick={close}>×</button></header>
  <div className="home-chat-log" ref={logRef}>{messages.map((m,i)=><div key={i} className={`home-chat-message ${m.role}`}>{m.text}</div>)}</div>
  <div className="home-chat-input"><input autoFocus value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')send()}} placeholder="질문을 입력하세요"/><button type="button" aria-label="전송" onClick={send}><Icon name="arrow"/></button></div>
 </section></>;
}
const BRIEF_ICONS: Record<string,string> = {규제:'§',TCR:'⇄',지정학:'⚑',연운항:'⚓',FX:'₩',ENERGY:'◒'};
function Brief({tone,cat,title,meta,onClick}:{tone:string;cat:string;title:string;meta:string;onClick?:()=>void}){return <button className="brief" onClick={onClick}><span className={`brief-icon ${tone}`}>{BRIEF_ICONS[cat] ?? '◒'}</span><div><Badge tone={tone}>{cat}</Badge><b>{title}</b><small>{meta}</small></div><Icon name="arrow"/></button>}

function CaseList({cases,go}:{cases:CaseItem[];go:(p:string)=>void}){const [q,setQ]=useState('');const [filter,setFilter]=useState('전체');const filtered=cases.filter(c=>(filter==='전체'||c.status===filter)&&Object.values(c).join(' ').toLowerCase().includes(q.toLowerCase()));return <div className="page figma-case-list"><PageTitle eyebrow="SHIPMENT MANAGEMENT" title="화물 운송 건 목록" desc="화물 운송 건을 등록해 견적 검증부터 계약·정산까지 한 곳에서 관리하세요." action={<button className="primary case-create" onClick={()=>go('/cases/new')}><Icon name="plus"/> 신규 등록</button>}/><div className="filters"><label className="searchbox"><Icon name="search"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="화주, 노선, Case 번호 검색"/></label><div className="chips">{['전체','계약','검토 필요','견적 확정','검증 대기'].map(x=><button type="button" className={filter===x?'active':''} onClick={()=>setFilter(x)} key={x}>{x}</button>)}</div></div><div className="table-card card"><div className="table-summary"><b>전체 견적</b><span>{filtered.length}건</span><button type="button">등록일 순 <i aria-hidden>↕</i></button></div><div className="case-table-scroll"><table><thead><tr><th>CASE 번호</th><th>화주 / 품목</th><th>노선</th><th>견적</th><th>상태</th><th>등록일</th></tr></thead><tbody>{filtered.map(c=><tr key={c.id} onClick={()=>go(caseHref(c.id,c.status))}><td>{c.id}</td><td><b>{c.shipper}</b><small>{c.item}<br/>{c.container}</small></td><td>{c.route.split(' → ').map((part,i)=><span key={part}>{part}{i===0?' →':''}</span>)}</td><td><strong>{money(c.price)}</strong></td><td><Badge tone={statusClass(c.status)}>{c.status.replace(' ','')}</Badge></td><td>{c.date}</td></tr>)}</tbody></table></div>{!filtered.length&&<div className="empty"><span>⌕</span><b>검색 결과가 없습니다.</b><small>검색어나 필터를 다시 확인해주세요.</small></div>}</div><QuotePageChatbot/></div>}

function NewCase({cases,setCases,go,notify}:{cases:CaseItem[];setCases:(x:CaseItem[])=>void;go:(p:string)=>void;notify:(m:string)=>void}){const [form,setForm]=useState({shipper:'ABC Motors',item:'자동차부품',from:'오봉역',to:'알마티',container:'40FT',qty:'3',weight:'58',departure:'2026-08-24',forwarder:'코레일',price:'3400',currency:'USD',received:'2026-08-10',valid:'7',memo:''});const change=(k:string,v:string)=>setForm({...form,[k]:v});const submit=(e:FormEvent)=>{e.preventDefault();const id=`KORAIL-2026-${String(cases.length+1).padStart(3,'0')}`;const n:CaseItem={id,shipper:form.shipper,route:`${form.from.replace('역','')} → ${form.to}`,item:form.item,container:`${form.container} × ${form.qty}`,forwarder:form.forwarder,price:+form.price,status:'검토 필요',date:'2026.08.10',departure:form.departure,weight:+form.weight};setCases([n,...cases]);notify('화물 운송 건이 등록되고 AI 검증이 완료되었습니다.');go('/cases/'+id)};return <div className="page form-page"><button className="back" onClick={()=>go('/cases')}>← 화물 운송으로</button><PageTitle eyebrow="NEW SHIPMENT" title="화물 운송 건 등록" desc="화물 운송에 필요한 기본 정보와 포워더 견적을 함께 입력해주세요."/><form onSubmit={submit}><FormSection n="01" title="기본 운송정보" desc="화물 및 운송 구간을 입력하세요."><div className="form-grid"><Field label="화주명" value={form.shipper} set={v=>change('shipper',v)}/><Field label="품목" value={form.item} set={v=>change('item',v)}/><Field label="출발지" value={form.from} set={v=>change('from',v)}/><Field label="도착지" value={form.to} set={v=>change('to',v)}/><Select label="컨테이너 타입" value={form.container} set={v=>change('container',v)} opts={['40FT','20FT','40FT HC']}/><Field label="컨테이너 수량" value={form.qty} set={v=>change('qty',v)} type="number" suffix="대"/><Field label="총 중량" value={form.weight} set={v=>change('weight',v)} type="number" suffix="ton"/><Field label="출발 예정일" value={form.departure} set={v=>change('departure',v)} type="date"/></div></FormSection><FormSection n="02" title="포워더 견적" desc="수신한 견적서의 주요 내용을 입력하세요."><QuoteAutoFill form={form} change={change}/><div className="form-grid"><Field label="포워더명" value={form.forwarder} set={v=>change('forwarder',v)}/><div className="compound"><Field label="견적금액" value={form.price} set={v=>change('price',v)} type="number"/><Select label="통화" value={form.currency} set={v=>change('currency',v)} opts={['USD','KRW','CNY']}/></div><Field label="견적 수신일" value={form.received} set={v=>change('received',v)} type="date"/><Field label="견적 유효기간" value={form.valid} set={v=>change('valid',v)} type="number" suffix="일"/><label className="field full"><span>메모 <small>선택</small></span><textarea value={form.memo} onChange={e=>change('memo',e.target.value)} placeholder="포워더 전달사항이나 특이사항을 입력하세요."/></label></div></FormSection><div className="form-actions"><span><Icon name="info"/> 등록 즉시 내부 유사 견적 및 시장정보 분석이 시작됩니다.</span><div><button type="button" className="secondary" onClick={()=>go('/cases')}>취소</button><button className="primary" type="submit"><Icon name="spark"/> 화물 운송 건 등록 및 AI 검증 시작</button></div></div></form></div>}
// 견적서 자동생성(신규) — "포워더 견적" 수동 입력 위에 얹는 보조 도구. 코레일은 경쟁하는
// 여러 포워더가 아니라 노선의 실제 구간(routeData.ts의 routePath.stages)마다 다른
// 용역업체(선사·CR·통관대행 등)의 원가가 발생하는 구조라, "여러 업체 견적을 비교"하는 게
// 아니라 "구간별 원가 문서를 업로드하면 AI가 합산해서 견적서 초안을 만든다."
// 실제 파일은 읽지 않고(documentEngine.ts와 동일한 결정론적 시뮬레이션), 이미 입력된
// 노선·컨테이너·화물 정보로 quoteDraftEngine.ts가 과거 유사 견적 중앙값을 구간별로 쪼갠다.
function QuoteAutoFill({form,change}:{form:Record<string,string>;change:(k:string,v:string)=>void}){
  const [open,setOpen]=useState(false);
  const [uploaded,setUploaded]=useState<Record<string,'idle'|'loading'|'done'>>({});
  const [draft,setDraft]=useState<QuoteDraft|null>(null);
  const origin=form.from.replace('역','');
  const routePath=buildRoutePath(origin,form.to);
  const stages=costBearingStages(routePath.stages);
  const allUploaded=stages.length>0&&stages.every(s=>uploaded[s.name]==='done');

  const uploadOne=(name:string)=>{
    setUploaded(u=>({...u,[name]:'loading'}));
    setTimeout(()=>setUploaded(u=>({...u,[name]:'done'})),700);
  };

  const generate=()=>{
    const query={origin,destination:form.to,containerType:form.container,cargoCategory:form.item,transportMonth:toTransportMonth(form.departure)};
    setDraft(buildQuoteDraft(query,Number(form.qty)||1,historicalQuotes,routePath));
  };

  // 이 노선에 실제로 관련 있는 시황 지표만(견적 검증 탭과 동일한 relevantFactors 필터링)
  // 이상탐지 여부를 한 줄로 요약한다 — 금액을 바꾸는 게 아니라 "왜 이 금액이 지금 시점에
  // 적정한지"를 설명하는 용도라, 검증 탭의 σ 판정과 항상 같은 기준(과거 유사 견적 중앙값)을
  // 쓰는 것과 모순되지 않는다.
  const marketChecks:{key:MarketFactorKey;label:string;series:typeof marketSeries.usdKrw}[]=[
    {key:'usdKrw',label:'USD/KRW 환율',series:marketSeries.usdKrw},
    {key:'cnyKrw',label:'CNY/KRW 환율',series:marketSeries.cnyKrw},
    {key:'seaFreight',label:'KCI(한중항로) 운임',series:marketSeries.kci},
  ];
  const marketNotes=marketChecks
    .filter(c=>routePath.relevantFactors.includes(c.key))
    .map(c=>{
      const a=detectAnomaly(c.series);
      if(!a)return null;
      return a.isAnomaly?`${c.label}이(가) 최근 평균 대비 벗어난 변동입니다(z=${a.z.toFixed(1)}).`:`${c.label}은(는) 안정적인 범위입니다.`;
    })
    .filter((x):x is string=>!!x);

  const applyDraft=()=>{ if(!draft)return; change('price',String(draft.total)); setOpen(false); };

  if(!open) return <button type="button" className="secondary quote-autofill-toggle" onClick={()=>setOpen(true)}><Icon name="spark"/> 문서 업로드로 자동 채우기</button>;

  return <div className="quote-autofill quote-autofill-open">
    <div className="card-head autofill-open-head">
      <h3>구간별 원가 문서 업로드</h3>
      <button type="button" className="text-btn" onClick={()=>setOpen(false)}>닫기</button>
    </div>
    <ul className="quote-autofill-list">
      {stages.map(s=>
        <li key={s.name}>
          <div><b>{s.mode}</b><span>{s.name}</span></div>
          {uploaded[s.name]==='done'
            ? <Badge tone="green">업로드 완료</Badge>
            : uploaded[s.name]==='loading'
              ? <span className="spinner"/>
              : <button type="button" onClick={()=>uploadOne(s.name)}><Icon name="download"/> 문서 업로드</button>}
        </li>
      )}
    </ul>
    {!draft && <button type="button" className="primary autofill-generate" disabled={!allUploaded} onClick={generate}><Icon name="spark"/> 견적 초안 생성</button>}
    {draft &&
      <div className="quote-draft-result">
        <table><thead><tr><th>구간</th><th>금액</th></tr></thead><tbody>
          {draft.lines.map(l=><tr key={l.label}><td>{l.mode} ({l.label})</td><td>{money(l.amount)}</td></tr>)}
        </tbody><tfoot><tr><td>합계 (계약금액)</td><td><b>{money(draft.total)}</b></td></tr></tfoot></table>
        <button type="button" className="primary apply-draft-button" onClick={applyDraft}>이 금액으로 견적 채우기</button>
      </div>}
  </div>
}
function Field({label,value,set,type='text',suffix}:{label:string,value:string,set:(v:string)=>void,type?:string,suffix?:string}){return <label className="field"><span>{label}</span><div><input required type={type} value={value} onChange={e=>set(e.target.value)}/>{suffix&&<em>{suffix}</em>}</div></label>}
function Select({label,value,set,opts}:{label:string,value:string,set:(v:string)=>void;opts:string[]}){return <label className="field"><span>{label}</span><select value={value} onChange={e=>set(e.target.value)}>{opts.map(o=><option key={o}>{o}</option>)}</select></label>}
function BasicInfoAutoFill(){
 const [open,setOpen]=useState(false);
 const [generated,setGenerated]=useState(false);
 const [states,setStates]=useState<Record<string,'idle'|'loading'|'done'>>({});
 const documents=[
  {name:'화물 의뢰서',desc:'화주명 · 품목 · 중량 정보'},
  {name:'운송 요청서',desc:'출발지 · 도착지 · 출발 예정일'},
  {name:'Packing List',desc:'컨테이너 타입 · 수량 정보'},
 ];
 const extracted=[['화주명','ABC Motors'],['품목','자동차부품'],['운송 구간','오봉역 → 알마티'],['컨테이너','40FT × 3'],['총 중량','58 ton'],['출발 예정일','2026-08-24']];
 const upload=(name:string)=>{setStates(s=>({...s,[name]:'loading'}));setTimeout(()=>setStates(s=>({...s,[name]:'done'})),700)};
 const complete=documents.every(d=>states[d.name]==='done');
 if(!open)return <button type="button" className="secondary quote-autofill-toggle" onClick={()=>setOpen(true)}><Icon name="spark"/> 문서 업로드로 자동 채우기</button>;
 return <div className="basic-autofill-open">
  <div className="autofill-open-head"><h3>기본 운송정보 문서 업로드</h3><button type="button" onClick={()=>setOpen(false)}>닫기</button></div>
  <div className="autofill-upload-list">{documents.map(doc=><div className="autofill-upload-row" key={doc.name}><div><b>{doc.name}</b><span>{doc.desc}</span></div>{states[doc.name]==='done'?<Badge tone="green">업로드 완료</Badge>:states[doc.name]==='loading'?<span className="spinner"/>:<button type="button" onClick={()=>upload(doc.name)}>문서 업로드</button>}</div>)}</div>
  {!generated?<button type="button" className="primary autofill-generate" disabled={!complete} onClick={()=>setGenerated(true)}><Icon name="spark"/> 기본 운송정보 자동 채우기</button>:<div className="basic-extract-result"><table><thead><tr><th>항목</th><th>추출 정보</th></tr></thead><tbody>{extracted.map(([key,value])=><tr key={key}><td>{key}</td><td>{value}</td></tr>)}</tbody></table><button type="button" className="primary apply-draft-button" onClick={()=>setOpen(false)}>이 정보로 기본 운송정보 채우기</button></div>}
 </div>;
}
function QuotePageChatbot(){const [open,setOpen]=useState(false);return <><button type="button" className="chatbot" onClick={()=>setOpen(true)}><img src="/icons/chatbot-train.svg" alt="" aria-hidden/><span>챗봇</span></button>{open&&<HomeChatbot item={initialCases[0]} close={()=>setOpen(false)}/>}</>}
function FormSection({n,title,desc,children}:{n:string,title:string,desc:string,children:React.ReactNode}){return <section className="form-section card"><header><span>{n}</span><div><h2>{title}</h2><p>{desc}</p></div></header>{n==='01'&&<BasicInfoAutoFill/>}{children}{n==='02'&&<QuotePageChatbot/>}</section>}


function CaseWorkspace({item,initialTab,initialContractDraft=false,setCases,notify}:{item:CaseItem;initialTab?:string;initialContractDraft?:boolean;setCases:React.Dispatch<React.SetStateAction<CaseItem[]>>;notify:(m:string)=>void}){const [tab,setTab]=useState(initialTab??'개요');const [drawer,setDrawer]=useState<DrawerState|null>(null);const [modal,setModal]=useState(false);const [quoteDeferred,setQuoteDeferred]=useState(false);const [draft,setDraft]=useState(initialContractDraft);const [loading,setLoading]=useState(false);const [clauses,setClauses]=useState<ContractClause[]>(()=>initialContractDraft?buildContractClauses(item,buildValidation(item).routePath):[]);const [docs,setDocs]=useState<Record<DocumentType,DocState>>({계약서:{status:'idle'},"Packing List":{status:'idle'},화물운송장:{status:'idle'},"B/L":{status:'idle'},Invoice:{status:'idle'}});
// 계약서·Packing List·화물운송장은 이 운송 건의 데이터를 채워나가는 "서류 처리" 목적이고,
// Invoice만 이미 확정된 계약금액과 실제 청구액을 맞춰보는 "정산 대조" 목적이라 성격이 다르다.
// 그래서 Invoice는 문서 탭이 아니라 정산 탭에서 직접 업로드한다.
const uploadDoc=(type:DocumentType,fileName:string)=>{
 setDocs(d=>({...d,[type]:{status:'loading',fileName}}));
 setTimeout(()=>{setDocs(d=>({...d,[type]:{status:'done',fileName}}));notify(`${type} 문서에서 정보를 추출했습니다.`)},900);
};// 3장 두 축(① 운임 인텔리전스 / ② Single Data Entry+업무 연결)을 탭바에서도 시각적으로 구분한다.
const tabGroups:[string|null,string[]][]=[[null,['개요']],['운임 인텔리전스',['견적 검증','참고정보']],['업무 연결',['계약','문서','정산']]];
useEffect(()=>{const locked=item.status==='검증 대기'||item.status==='검토 필요';document.querySelectorAll<HTMLButtonElement>('.figma-case-detail .tabs button').forEach(button=>{const name=button.textContent?.trim();button.disabled=locked&&(quoteDeferred?['정산']:['계약','문서','정산']).includes(name??'')})},[item.status,tab,quoteDeferred]);
const validation=useMemo(()=>buildValidation(item),[item]);const confirm=()=>{setCases(xs=>xs.map(x=>x.id===item.id?{...x,status:'견적 확정'}:x));setModal(false);setTab('계약');notify('견적이 확정되었습니다. 계약 특약을 검토해주세요.')};const deferQuote=()=>{setQuoteDeferred(true);setTab('계약');notify('견적 검토를 미뤘습니다. 견적 상태를 유지한 채 계약서 초안과 문서를 먼저 작성할 수 있습니다.')};const confirmContract=()=>{setCases(xs=>xs.map(x=>x.id===item.id?{...x,status:'계약'}:x));notify('계약이 체결되었습니다. 이제 문서를 업로드해 데이터를 채워보세요.');setTab('문서')};return <div className="case-workspace figma-case-detail"><section className="case-hero"><div className="case-breadcrumb">화물 운송 <span>/</span> {item.id}</div><div className="case-heading"><div><div><Badge tone={statusClass(item.status)}>{item.status}</Badge><span className="case-id">{item.id}</span></div><h1>{item.route}</h1><p>{item.shipper} · {item.item} · {item.container}</p></div><div className="quote"><span>현재 포워더 견적</span><b>{money(item.price)}</b><small>{item.forwarder} · USD</small></div></div><Stepper status={item.status}/></section><div className="tabs">{tabGroups.map(([label,group],gi)=><div className="tab-group" key={label??'intro'}>{gi>0&&<i className="tab-divider"/>}{label&&<span className="tab-group-label">{label}</span>}{group.map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}</div>)}</div><div className="workspace-body">{tab==='개요'&&<Overview item={item}/>} {tab==='견적 검증'&&<Validation item={item} validation={validation} setDrawer={setDrawer} onConfirm={()=>setModal(true)} onDefer={deferQuote}/>} {tab==='참고정보'&&<References setDrawer={setDrawer}/>} {tab==='계약'&&<Contract clauses={clauses} setClauses={setClauses} draft={draft} loading={loading} generate={()=>{setLoading(true);setTimeout(()=>{setClauses(buildContractClauses(item,validation.routePath));setLoading(false);setDraft(true)},1200)}} onConfirm={confirmContract} item={item} routePath={validation.routePath}/>} {tab==='문서'&&<Documents item={item} docs={docs} onUpload={uploadDoc} routePath={validation.routePath}/>} {tab==='정산'&&<Settlement item={item} docs={docs} onUpload={uploadDoc} notify={notify} validation={validation}/>}</div><QuotePageChatbot/>{drawer&&<EvidenceDrawer state={drawer} close={()=>setDrawer(null)}/>} {modal&&<ConfirmModal close={()=>setModal(false)} confirm={confirm}/>}</div>}
function Stepper({status}:{status:CaseStatus}){const steps=['견적 등록','AI 검증','계약','문서','정산'];const idx=status==='검증 대기'||status==='검토 필요'?1:status==='견적 확정'||status==='계약'?2:4;return <div className="stepper">{steps.map((s,i)=><div className={i<idx?'done':i===idx?'current':''} key={s}><span>{i<idx?'✓':i+1}</span><b>{s}</b>{i<steps.length-1&&<i/>}</div>)}</div>}
function Overview({item}:{item:CaseItem}){
 const {origin,destination}=parseRoute(item.route);
 const {stages}=buildRoutePath(origin,destination);
 return <div className="overview-grid"><section className="card route-card"><div className="card-head"><div><span className="section-kicker">TRANSPORT</span><h2>운송정보</h2></div><Badge>{stages.length}개 구간</Badge></div><div className="route-line">{stages.map((s,i)=>{const label=s.name.match(/^([^（(]+)([（(].+)$/);return <div className={label?'border-stage':''} key={s.name}><span>{i===0?'K':i===stages.length-1?'◎':s.mode.includes('해상')?'⚓':'⇄'}</span><b>{label?<>{label[1]}<br/><span>{label[2]}</span></>:s.name}</b><small>{s.mode}</small>{i<stages.length-1&&<i/>}</div>})}</div></section><section className="card quote-detail"><span className="section-kicker">FORWARDER QUOTE</span><h2>포워더 견적</h2><strong>{money(item.price)}</strong><b>{item.forwarder}</b><dl><div><dt>견적 수신일</dt><dd>2026.08.10</dd></div><div><dt>유효기간</dt><dd>2026.08.17</dd></div><div><dt>결제 통화</dt><dd>USD</dd></div></dl></section><section className="card full status-log"><div className="card-head"><h2>주요 진행상태</h2><span>최근 업데이트 28분 전</span></div>{[['견적 등록 완료','2026.08.10 · 09:12'],['AI 검증 완료','2026.08.10 · 09:14'],['견적 확정 대기','담당자 확인 필요']].map((x,i)=><div key={x[0]}><span className={i===2?'warn':''}>{i<2?'✓':'!'}</span><b>{x[0]}</b><small>{x[1]}</small></div>)}</section></div>}

function Validation({item,validation,setDrawer,onConfirm,onDefer}:{item:CaseItem;validation:ValidationResult;setDrawer:(x:DrawerState)=>void;onConfirm:()=>void;onDefer:()=>void}){
 const {query,matches,verdict,usdKrw,brent,cnyKrw,kztUsd,uzsUsd,kgsUsd,kci,seasonality,routePath}=validation;
 const {origin,destination}=query;
 const prices=matches.map(m=>m.quote.price);
 const baseline=Math.round(verdict.baseline);
 const pct=(f:(m:typeof matches[number])=>boolean)=>matches.length?Math.round(matches.filter(f).length/matches.length*100):0;
 const originPct=pct(m=>m.breakdown.routeMatch);
 const containerPct=pct(m=>m.breakdown.containerMatch);
 const cargoPct=pct(m=>m.breakdown.cargoMatch);
 const timingPct=matches.length?Math.round(matches.reduce((a,m)=>a+m.breakdown.timingScore,0)/matches.length*100):0;
 const avgScore=matches.length?Math.round(matches.reduce((a,m)=>a+m.score,0)/matches.length*100):0;
 const usdKrwWindowPct=windowChangePct(marketSeries.usdKrw);
 const brentWindowPct=windowChangePct(marketSeries.brent);
 const cnyKrwWindowPct=windowChangePct(marketSeries.cnyKrw);
 const kztUsdWindowPct=windowChangePct(marketSeries.kztUsd);
 const uzsUsdWindowPct=windowChangePct(marketSeries.uzsUsd);
 const kgsUsdWindowPct=windowChangePct(marketSeries.kgsUsd);
 const kciWindowPct=windowChangePct(marketSeries.kci);
 const pressure_sub=buildSubstitutionSignal(kciWindowPct,verdict.diffPct);
 const newsCount=(cat:NewsCategory)=>newsArticles.filter(n=>n.category===cat).length;
 // 노선의 실제 구간 구성(routeData.ts)에 따라 관련 있는 시황 지표만 골라 보여준다 —
 // 부산→시안처럼 TCR 국경환적 구간이 없는 노선엔 이 카드들을 띄우지 않는다.
 //
 // 카드 순서는 조사된 실제 영향력 순위를 따른다(아이디어 문서 3장 "시황 요인 우선순위"):
 // 정책(보조금)·화차공급·지정학 리스크가 유가·환율보다 운임을 더 직접적으로 흔드는 것으로
 // 확인됐다. 앞의 세 개는 시계열이 없는 뉴스/이벤트 기반 신호라 tone을 항상 "red"로 고정하고
 // (이상탐지 여부와 무관하게 항상 확인이 필요한 요인), 유가·환율은 이상탐지됐을 때만 "red"로
 // 격상한다.
 const factorDefs:{key:MarketFactorKey;node:React.ReactNode}[]=[
  {key:'tcr',node:<Factor key="policy" icon="§" tone="red" title="중국 철도 보조금 정책" value={`${newsCount('규제')}건`} label="관련 뉴스" desc="TCR 활성화를 위한 SOC 컨테이너 보조금이 축소되면 COC 컨테이너 공급이 줄어 운임이 급등하는 패턴이 있습니다(2021년 연운항 루트: 약 $4,000 → $7,500~8,000 사례)." onClick={()=>setDrawer({title:'중국 철도 보조금 정책',category:'규제'})}/>},
  {key:'tcr',node:<Factor key="tcr" icon="⇄" tone="red" title="화차·컨테이너 공급" value={`${newsCount('TCR')}건`} label="관련 뉴스" desc="중국–카자흐스탄 국경(아라산커우 등)의 화차 부족·컨테이너 적체로 대기일수가 10일에서 45~50일까지 늘어난 사례가 있어, 체화료·운임 상승으로 이어질 수 있습니다." onClick={()=>setDrawer({title:'화차·컨테이너 공급',category:'TCR'})}/>},
  {key:'tcr',node:<Factor key="geo" icon="⚑" tone="red" title="지정학 리스크(TSR→TCR 전환)" value={`${newsCount('지정학')}건`} label="관련 뉴스" desc="러시아-우크라이나 전쟁 이후 TSR 이용이 제재·보험 부보 제한으로 위축되며 물량이 TCR로 쏠리는 흐름이 있어, TCR 운임에도 간접 영향을 줄 수 있습니다." onClick={()=>setDrawer({title:'지정학 리스크(TSR→TCR 전환)',category:'지정학'})}/>},
  {key:'yeonyungang',node:<Factor key="yeonyungang" icon="⚓" tone="red" title="연운항 환적 이슈" value={`${newsCount('연운항')}건`} label="관련 뉴스" desc="최근 해당 구간에서 환적 지연 관련 이슈가 확인되었습니다." onClick={()=>setDrawer({title:'연운항 환적 이슈',category:'연운항'})}/>},
  {key:'brent',node:<Factor key="brent" icon="◒" tone={brent?.isAnomaly?'red':'amber'} title="Brent 유가" value={`${brentWindowPct>=0?'+':''}${brentWindowPct.toFixed(1)}%`} label="최근 30일" desc="부산–연운항 해상 구간은 선박 운항비의 20~30%가 연료비라, 유가 변동이 곧바로 유류할증료(BAF)에 반영됩니다." onClick={()=>setDrawer({title:'Brent 유가',indicator:'brent'})}/>},
  {key:'usdKrw',node:<Factor key="usdKrw" icon="₩" tone={usdKrw?.isAnomaly?'red':'amber'} title="USD/KRW 환율" value={`${usdKrwWindowPct>=0?'+':''}${usdKrwWindowPct.toFixed(1)}%`} label="최근 30일" desc={`${usdKrw?.isAnomaly?`최근 평균 대비 벗어난 변동입니다(z=${usdKrw.z.toFixed(1)}). `:''}운임이 대부분 달러(USD)로 표시되는 통화할증료(CAF) 구조라, 노선이 미국을 지나지 않아도 원화 환산 청구액에 직접 영향을 줍니다.`} onClick={()=>setDrawer({title:'USD/KRW 환율',indicator:'usdKrw'})}/>},
  {key:'cnyKrw',node:<Factor key="cnyKrw" icon="¥" tone={cnyKrw?.isAnomaly?'red':'amber'} title="CNY/KRW 환율" value={`${cnyKrwWindowPct>=0?'+':''}${cnyKrwWindowPct.toFixed(1)}%`} label="최근 30일" desc={cnyKrw?.isAnomaly?`최근 평균 대비 벗어난 변동입니다(z=${cnyKrw.z.toFixed(1)}). TCR 통과 구간 비용에 영향을 줄 수 있습니다.`:'중국 통과 구간 환산비용에 참고할 수 있는 정상 범위 변동입니다.'} onClick={()=>setDrawer({title:'CNY/KRW 환율',indicator:'cnyKrw'})}/>},
  {key:'kztUsd',node:<Factor key="kztUsd" icon="₸" tone={kztUsd?.isAnomaly?'red':'amber'} title="USD/KZT 환율" value={`${kztUsdWindowPct>=0?'+':''}${kztUsdWindowPct.toFixed(1)}%`} label="최근 30일" desc={kztUsd?.isAnomaly?`최근 평균 대비 벗어난 변동입니다(z=${kztUsd.z.toFixed(1)}). 최종 도착지 통화 환산비용에 영향을 줄 수 있습니다.`:'최종 도착지(카자흐스탄) 통화의 달러 대비 환율로, 현지 통관·내륙 운송비 정산 시 참고할 수 있는 지표입니다.'} onClick={()=>setDrawer({title:'USD/KZT 환율',indicator:'kztUsd'})}/>},
  {key:'uzsUsd',node:<Factor key="uzsUsd" icon="₸" tone={uzsUsd?.isAnomaly?'red':'amber'} title="USD/UZS 환율" value={`${uzsUsdWindowPct>=0?'+':''}${uzsUsdWindowPct.toFixed(1)}%`} label="최근 30일" desc={uzsUsd?.isAnomaly?`최근 평균 대비 벗어난 변동입니다(z=${uzsUsd.z.toFixed(1)}). 최종 도착지 통화 환산비용에 영향을 줄 수 있습니다.`:'최종 도착지(우즈베키스탄) 통화의 달러 대비 환율로, 현지 통관·내륙 운송비 정산 시 참고할 수 있는 지표입니다.'} onClick={()=>setDrawer({title:'USD/UZS 환율',indicator:'uzsUsd'})}/>},
  {key:'kgsUsd',node:<Factor key="kgsUsd" icon="₸" tone={kgsUsd?.isAnomaly?'red':'amber'} title="USD/KGS 환율" value={`${kgsUsdWindowPct>=0?'+':''}${kgsUsdWindowPct.toFixed(1)}%`} label="최근 30일" desc={kgsUsd?.isAnomaly?`최근 평균 대비 벗어난 변동입니다(z=${kgsUsd.z.toFixed(1)}). 최종 도착지 통화 환산비용에 영향을 줄 수 있습니다.`:'최종 도착지(키르기스스탄) 통화의 달러 대비 환율로, 현지 통관·내륙 운송비 정산 시 참고할 수 있는 지표입니다.'} onClick={()=>setDrawer({title:'USD/KGS 환율',indicator:'kgsUsd'})}/>},
  {key:'seaFreight',node:<Factor key="seaFreight" icon="≋" tone={kci?.isAnomaly?'red':'amber'} title="부산–중국 항로 수급 · KCI" value={`${kciWindowPct>=0?'+':''}${kciWindowPct.toFixed(1)}%`} label="최근 30일 · KCI(한중항로) 참고 벤치마크" desc={pressure_sub} onClick={()=>setDrawer({title:'KCI(한중항로) 운임',indicator:'kci'})}/>},
 ];
 const seasonalityCard=<Factor key="seasonality" icon="◷" tone={seasonality.level==='high'?'red':'amber'} title="계절성" value={seasonality.label} label="캘린더 기반 신호" desc={seasonality.reason}/>;
 const factors=[...factorDefs.filter(f=>routePath.relevantFactors.includes(f.key)).map(f=>f.node),seasonalityCard];
 const throughTCR=routePath.relevantFactors.includes('tcr');
 const absDiff=Math.abs(verdict.diffPct);
 const position=absDiff<=0.5*verdict.sigma?'중간':absDiff<=1.5*verdict.sigma?(verdict.diffPct>=0?'상단':'하단'):(verdict.diffPct>=0?'최상단':'최하단');
 // AI는 판정을 내리는 게 아니라 서술한다 — "재협상이 필요합니다" 같은 지시형 대신
 // "과거 대비 높은 견적입니다"처럼 사실을 서술하는 문구로 통일한다.
 const resultTitle=verdict.tone==='green'?'과거 대비 적정한 견적입니다':verdict.tone==='amber'?(verdict.diffPct>=0?'과거에 비해 다소 높은 견적입니다':'과거에 비해 다소 낮은 견적입니다 — 비용 항목을 확인하세요'):(verdict.diffPct>=0?'과거에 비해 높은 견적입니다':'과거에 비해 낮은 견적입니다 — 비용 항목 누락 가능성을 확인하세요');
 const diffLabel=`${verdict.diffPct>=0?'+':''}${verdict.diffPct.toFixed(1)}%`;
 // 견적이 과거 대비 왜 높거나 낮은지, 노선에 실제로 관련 있는 지표들을 종합해 인과분석한다.
 const pressure=buildPressure(validation);
 useEffect(()=>{
  const action=document.querySelector<HTMLElement>('.figma-case-detail .validation .next-action');
  if(!action) return;
  const description=action.querySelector('span');
  if(description) description.textContent='견적 검토를 유지한 채 계약서와 관련 문서를 먼저 작성할 수 있습니다.';
  const confirmButton=action.querySelector<HTMLButtonElement>('button');
  if(!confirmButton) return;
  action.querySelector('.defer-quote')?.remove();
  action.querySelector('.next-action-buttons')?.replaceWith(confirmButton);
  confirmButton.textContent='계약서 작성하기  →';
  const openContract=(event:MouseEvent)=>{event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();onDefer()};
  confirmButton.addEventListener('click',openContract);
  return()=>confirmButton.removeEventListener('click',openContract);
 },[onDefer]);
 return <div className="validation"><div className="validation-title"><div><span className="section-kicker"><Icon name="spark"/> AI QUOTE VALIDATION</span><h2>AI 견적 검증</h2><p>코레일 내부 유사 견적과 현재 시장정보를 함께 분석한 결과입니다.</p></div><span className="analyzed"><i/> 분석 완료 · 방금 전</span></div><section className="result-card"><div className="result-main"><span className="result-icon">{verdict.tone==='green'?'✓':'!'}</span><div><Badge tone={verdict.tone}>{verdict.label.split(' — ')[0]}</Badge><h2>{resultTitle}</h2><p>내부 유사 견적 분포에서 <b>{position} 수준</b>이며,<br/>최근 시장 변동요인도 함께 확인되었습니다.</p></div></div><div className="result-price"><span>현재 포워더 견적</span><b>{money(item.price)}</b><small>유사 견적 중앙값 대비 <em>{diffLabel}</em></small></div></section><div className="analysis-grid"><section className="card comparison"><div className="card-head"><div><span className="section-kicker">INTERNAL DATA</span><h2>코레일 내부 유사 견적 비교</h2></div><button className="more">···</button></div><div className="legend"><span><i className="dot-gray"/> 과거 유사 견적</span><span><i className="tri"/> 현재 견적</span></div><PriceChart current={item.price} values={prices} baseline={baseline}/><div className="compare-note"><span>↗</span><div><b>내부 유사 Case의 가격 분포 중 {position}에 위치합니다.</b><p>중앙값 {money(baseline)} 대비 {money(Math.abs(item.price-baseline))} {item.price>=baseline?'높은':'낮은'} 수준입니다.</p></div></div><footer><div><b>{matches.length}건</b><span>유사 Case</span></div><div><b>{origin} → {destination}</b><span>동일 목적지</span></div><div><b>{query.containerType}</b><span>컨테이너 타입</span></div><div><b>σ={verdict.sigma.toFixed(1)}%</b><span>가격 분산(σ, 최근 6개월)</span></div></footer></section><section className="card why"><span className="section-kicker">WHY IT MATTERS</span><h2>비교 조건</h2><div className="match-score"><b>{avgScore}</b><span>%<small>{avgScore>=80?'높은 유사도':avgScore>=60?'보통 유사도':'낮은 유사도'}</small></span></div><ul><li><Icon name="check"/><span>출발·도착 구간 일치</span><b>{originPct}%</b></li><li><Icon name="check"/><span>컨테이너 조건 일치</span><b>{containerPct}%</b></li><li><Icon name="check"/><span>운송 시기 유사</span><b>{timingPct}%</b></li><li><Icon name="check"/><span>화물 특성 유사</span><b>{cargoPct}%</b></li></ul><p><Icon name="info"/> 비교 결과는 내부 유사성 기준(3장 구체화 C: 노선 40%·컨테이너 25%·시기 20%·화물특성 15%)을 바탕으로 산출됩니다. 이 가중치는 코레일 실거래 이력으로 검증된 값이 아닌 MVP 초기 휴리스틱입니다.</p></section></div><div className="factor-heading"><div><span className="section-kicker">EXTERNAL SIGNALS</span><h2>현재 시장정보</h2><p>{origin} → {destination} 경로 기준으로 함께 확인할 외부 변동요인입니다.</p></div><span>관련도 순</span></div><div className="factors">{factors}</div><section className="card causal-analysis"><span className="section-kicker">CAUSAL ANALYSIS</span><h2>{pressure.direction==='neutral'?'운임 변동 요인 분석':`운임 ${pressure.direction==='up_pressure'?'상승':'하락'} 요인 분석`}</h2><div className="causal-box"><Icon name="spark"/><div><small>{pressure.drivers.length>0?`근거: ${pressure.drivers.map(d=>d.label).join(', ')}`:'참고용 추정'}</small><p>{pressure.explanation}</p></div></div>{pressure.matchedNews.length>0&&<p className="doc-note"><Icon name="info"/>관련 뉴스: {pressure.matchedNews.map(n=>n.title).join(' · ')}</p>}{routePath.relevantFactors.includes('seaFreight')&&<p className="doc-note"><Icon name="info"/>{pressure_sub}</p>}</section><section className="ai-summary"><div className="ai-label"><span><Icon name="spark"/></span><div><small>KORAIL LINK AI</small><h2>검증 요약</h2></div></div><p>현재 포워더 견적 <b>{money(item.price)}</b>은 코레일 내부 유사 견적 {matches.length}건 분포에서 <b>{position}에 위치</b>합니다(중앙값 대비 {diffLabel}, 가격 분산 σ={verdict.sigma.toFixed(1)}%). 동시에 {usdKrw?.isAnomaly?'최근 원/달러 환율 변동':'환율은 안정적이나'}{throughTCR?' 및 연운항·TCR 관련 운송 이슈가':', 중국 통과 구간의 위안화 환율 변동이'} 확인됩니다. 따라서 이 수치만으로 판단하기보다는 {throughTCR?<><mark>TCR 구간 운임 변동 여부</mark>와 <mark>환적 관련 추가비용 포함 여부</mark></>:<><mark>중국 내륙철도 구간 운임 변동 여부</mark>와 <mark>위안화 환산 기준일</mark></>}를 확인할 필요가 있습니다.</p><div className="next-action"><div><b>다음 권장 업무</b><span>검증 결과를 확인했다면 견적을 확정하세요.</span></div><button onClick={onConfirm}>견적 확정하기 <Icon name="arrow"/></button></div><small className="disclaimer"><Icon name="info"/> 본 분석은 코레일 내부 유사 견적과 공개 시장정보를 활용한 참고용 검증이며 포워더의 가격 산정 원가를 의미하지 않습니다.</small></section></div>}
function PriceChart({current,values,baseline}:{current:number;values:number[];baseline:number}){
 const all=[...values,current,baseline];
 const dataMin=Math.min(...all),dataMax=Math.max(...all);
 const pad=Math.max((dataMax-dataMin)*0.2,100);
 const lo=Math.floor((dataMin-pad)/100)*100,hi=Math.ceil((dataMax+pad)/100)*100;
 const pos=(n:number)=>Math.max(4,Math.min(96,((n-lo)/(hi-lo))*100));
 const ticks=Array.from({length:6},(_,i)=>Math.round(lo+((hi-lo)/5)*i));
 const rangeMin=values.length?Math.min(...values):current;
 const rangeMax=values.length?Math.max(...values):current;
 return <div className="chart"><div className="current-label" style={{left:`${pos(current)}%`}}><b>{money(current)}</b><span>현재</span></div><div className="axis"><i className="range"/><span className="median" style={{left:`${pos(baseline)}%`}}/><span className="current-mark" style={{left:`${pos(current)}%`}}>▲</span>{values.map((v,i)=><span className="history-dot" key={i} style={{left:`${pos(v)}%`,top:`${i%2?43:35}px`}} title={money(v)}/>)}</div><div className="ticks">{ticks.map((t,i)=><span key={i}>${t.toLocaleString()}</span>)}</div><div className="distribution"><span style={{left:`${pos(rangeMin)}%`,width:`${pos(rangeMax)-pos(rangeMin)}%`,whiteSpace:'nowrap'}}>{rangeMin===rangeMax?`유사 견적 ${money(rangeMin)} (1건)`:`유사 견적 범위 ${money(rangeMin)} – ${money(rangeMax)}`}</span></div></div>}
function Factor({icon,tone,title,value,label,desc,onClick}:{icon:string;tone:string;title:string;value:string;label:string;desc:string;onClick?:()=>void}){return <section className="factor card"><div className="factor-top"><span className={`factor-icon ${tone}`}>{icon}</span><Badge tone={tone}>{tone==='red'?'관련도 높음':'관련도 보통'}</Badge></div><h3>{title}</h3><div className="factor-value"><b>{value}</b><span>{label}</span></div><p>{desc}</p>{onClick&&<button onClick={onClick}>근거 보기 <Icon name="external"/></button>}</section>}

function References({setDrawer}:{setDrawer:(x:DrawerState)=>void}){
 const [f,setF]=useState('전체');
 const visible=newsArticles.filter(n=>f==='전체'||n.category===f);
 const relevance=(index:number)=>index===0?'높음':index===1?'보통':'낮음';
 return <div className="figma-reference-page">
  <div className="reference-toolbar">
   <div className="chips reference-chips">{['전체','규제','TCR','지정학','연운항','환율','유가','통관','과거견적'].map(x=><button className={f===x?'active':''} onClick={()=>setF(x)} key={x}>{x}</button>)}</div>
   <button className="reference-sort">관련도 순 ↕</button>
  </div>
  <div className="news-list">{visible.map((n,index)=>{const level=relevance(index);return <button className="card news-card" onClick={()=>setDrawer({title:n.title,category:n.category,indicator:n.indicator})} key={n.id}>
   <div><span className={`reference-relevance ${level==='높음'?'high':level==='보통'?'medium':'low'}`}><i/>{n.category} · {level==='높음'?'관련도 높음':level==='보통'?'보통 관련도':'낮은 관련도'}</span><h3>{n.title}</h3><p>{n.summary}</p><small>{n.source} · {n.date}</small></div>
  </button>})}</div>
 </div>
}
function Contract({clauses,setClauses,draft,loading,generate,onConfirm,item,routePath}:{clauses:ContractClause[];setClauses:React.Dispatch<React.SetStateAction<ContractClause[]>>;draft:boolean;loading:boolean;generate:()=>void;onConfirm:()=>void;item:CaseItem;routePath:RoutePath}){
 const [editingIndex,setEditingIndex]=useState<number|null>(null);
 const [draftTitle,setDraftTitle]=useState('');
 const [draftBody,setDraftBody]=useState('');
 const [signStatus,setSignStatus]=useState<'none'|'pending'|'signed'>('none');
 const [signedAt,setSignedAt]=useState('');
 const [smgsRefOpen,setSmgsRefOpen]=useState(false);
 const startEdit=(i:number)=>{setEditingIndex(i);setDraftTitle(clauses[i].title);setDraftBody(clauses[i].body)};
 const saveEdit=()=>{if(editingIndex===null)return;setClauses(cs=>cs.map((c,i)=>i===editingIndex?{title:draftTitle,body:draftBody}:c));setEditingIndex(null)};
 const cancelEdit=()=>setEditingIndex(null);
 // 실제 전자서명 SDK 연동 없이 "요청 → (약간의 지연) → 서명 완료" 상태 전환만 시뮬레이션한다.
 // 다른 시뮬레이션(문서 업로드 등)과 동일하게 setTimeout으로 로딩 구간을 흉내낸다.
 const requestSign=()=>{setSignStatus('pending');setTimeout(()=>{setSignStatus('signed');setSignedAt(new Date().toLocaleString('ko-KR'))},900)};
 const scheduleLines=useMemo(()=>splitCostByStages(item.price,costBearingStages(routePath.stages)),[item.price,routePath]);
 return <div><div className="validation-title"><div><span className="section-kicker">CONTRACT WORKSPACE</span><h2>계약 특약 초안</h2><p>확정된 견적 및 운송조건을 바탕으로 특약을 작성합니다.</p></div>{!draft&&!loading&&<button className="primary" onClick={generate}><Icon name="spark"/> 특약 초안 생성</button>}</div><div className="notice"><Icon name="info"/><span><b>담당자 검토가 필요합니다.</b> AI가 생성한 초안이며 실제 계약 적용 전 법무 및 담당자의 확인이 필요합니다.</span></div>{loading&&<div className="card loading"><span className="spinner"/><b>견적 및 운송조건을 기반으로 특약을 작성하고 있습니다...</b><small>운송구간과 확인사항을 반영하고 있어요.</small></div>}{!draft&&!loading&&<div className="card contract-empty"><span>◇</span><h3>아직 생성된 특약 초안이 없습니다.</h3><p>확정된 견적정보와 포워더 확인사항을 바탕으로 초안을 생성하세요.</p></div>}{draft&&<div className="clauses">{clauses.map((c,i)=>{const editing=editingIndex===i;return <section className="card" key={i}><header><span>{String(i+1).padStart(2,'0')}</span>{editing?<input className="clause-title-input" value={draftTitle} onChange={e=>setDraftTitle(e.target.value)}/>:<h3>{c.title}</h3>}{editing?<div className="clause-edit-actions"><button onClick={saveEdit}>저장</button><button onClick={cancelEdit}>취소</button></div>:<button onClick={()=>startEdit(i)}>수정</button>}</header>{editing?<textarea className="clause-body-input" value={draftBody} onChange={e=>setDraftBody(e.target.value)} rows={3}/>:<p>{c.body}</p>}{!editing&&c.title==='SMGS 협약 준수'&&<div className="smgs-reference"><button className="text-btn" onClick={()=>setSmgsRefOpen(o=>!o)}>{smgsRefOpen?'근거 조항 접기 ▴':'근거 조항 보기 ▾'}</button>{smgsRefOpen&&<ul className="smgs-reference-list">{SMGS_REFERENCE_ITEMS.map(item=><li key={item.requirement}><b>{item.article}</b><span>{item.requirement}</span>{item.note&&<small>{item.note}</small>}</li>)}</ul>}</div>}</section>})}</div>}
 {draft&&<section className="card rate-schedule">
  <div className="card-head"><div><span className="section-kicker">SCHEDULE OF RATES</span><h3>별첨 1 — 구간별 운임 명세</h3></div></div>
  <p className="schedule-desc">구간별 운임은 계약 본문이 아닌 별첨으로 명시하는 것이 국제복합운송계약의 일반적인 방식입니다. 견적 확정 시 산출된 구간별 원가 구성을 그대로 옮겼습니다.</p>
  <table className="schedule-table"><thead><tr><th>구간</th><th>운송 방식</th><th>금액</th></tr></thead><tbody>{scheduleLines.map(l=><tr key={l.label}><td>{l.label}</td><td>{l.mode}</td><td>{money(l.amount)}</td></tr>)}</tbody><tfoot><tr><td colSpan={2}>합계</td><td><b>{money(item.price)}</b></td></tr></tfoot></table>
 </section>}
 {draft&&<section className="card e-signature">
  <div className="card-head"><div><span className="section-kicker">E-SIGNATURE</span><h3>전자서명</h3></div>{signStatus==='signed'&&<Badge tone="green">서명 완료</Badge>}</div>
  {signStatus==='none'&&<div className="sign-empty"><p>화주({item.shipper})와 포워더({item.forwarder}) 양측의 전자서명이 필요합니다.</p><button className="primary" onClick={requestSign}><Icon name="spark"/> 전자서명 요청</button></div>}
  {signStatus==='pending'&&<div className="doc-loading"><span className="spinner"/>화주·포워더 서명을 요청하고 있습니다...</div>}
  {signStatus==='signed'&&<div className="sign-done"><div><b>{item.shipper}</b><small>화주 · 서명 완료 · {signedAt}</small></div><div><b>{item.forwarder}</b><small>포워더 · 서명 완료 · {signedAt}</small></div></div>}
  <small className="hint">법적 효력이 있는 전자서명이 아니라 데모용 시뮬레이션입니다.</small>
 </section>}
 {draft&&<div className="form-actions"><span><Icon name="info"/> {signStatus==='signed'?'서명이 완료되었습니다. 계약을 확정하세요.':'전자서명을 완료해야 계약을 확정할 수 있습니다.'}</span><div><button className="primary" disabled={signStatus!=='signed'} onClick={onConfirm}><Icon name="check"/> 계약 확정</button></div></div>}</div>}
// 계약서·Packing List·화물운송장 3종만 다룬다 — 이 운송 건의 데이터를 채워나가는 "서류 처리" 문서.
// Invoice는 성격이 달라(이미 확정된 금액과의 정산 대조) 정산 탭에서 별도로 처리한다.
const DATA_ENTRY_DOCUMENT_TYPES = DOCUMENT_TYPES.filter((t): t is Exclude<DocumentType,'Invoice'> => t!=='Invoice');

function Documents({item,docs,onUpload,routePath}:{item:CaseItem;docs:Record<DocumentType,DocState>;onUpload:(type:DocumentType,fileName:string)=>void;routePath:RoutePath}){
 const {origin,destination}=parseRoute(item.route);
 const throughTCR=routePath.relevantFactors.includes('tcr');
 return <div><div className="validation-title"><div><span className="section-kicker">DOCUMENT PIPELINE</span><h2>문서</h2><p>{origin} → {destination} 노선 기준으로 계약서·Packing List·화물운송장·B/L을 업로드하면 AI가 정보를 추출해 이 운송 건의 데이터로 자동 반영합니다. 화물운송장은 통상 운송인(코레일)이 구간별 확인·발행에 관여하는 서류로 알려져 있어(정확한 작성 주체 구분은 실제 계약조건에 따라 다를 수 있음), 업로드 대신 AI가 참고용 초안을 직접 작성할 수도 있습니다. {throughTCR?'연운항에서 TCR로 환적되어 국경을 통과하는 구간이라, 화물운송장은 SMGS 필수기재사항 준수 여부도 함께 확인하며, 부산항→연운항 해상 구간은 B/L로 별도 커버합니다.':'중국 내륙철도로 직접 연결되는 구간입니다.'} Invoice 대조는 정산 탭에서 진행합니다.</p></div></div><div className="notice"><Icon name="info"/><span><b>AI 추출 결과 · 확인 필요.</b> 100% 정확도를 가정하지 않으며, 이미 등록된 정보와 다른 값이 나오면(표기 형식 차이 제외) 완전일치 기준으로 확인 필요 표시를 합니다.</span></div><div className="doc-grid">{DATA_ENTRY_DOCUMENT_TYPES.map(type=><DocumentCard key={type} type={type} item={item} state={docs[type]} onUpload={onUpload} routePath={routePath}/>)}</div></div>
}

function DocumentCard({type,item,state,onUpload,routePath}:{type:Exclude<DocumentType,'Invoice'>;item:CaseItem;state:DocState;onUpload:(type:DocumentType,fileName:string)=>void;routePath:RoutePath}){
 const inputId=`upload-${type}`;
 const info=DOCUMENT_INFO[type];
 const extraction=state.status==='done'?buildDocumentExtraction(type,item,routePath):null;
 const mismatchCount=extraction?.fields.filter(f=>f.status==='mismatch').length??0;
 const checklistFailCount=extraction?.checklist?.filter(c=>!c.pass).length??0;
 const needsAttention=mismatchCount>0||checklistFailCount>0;
 return <section className="card doc-card"><div className="doc-card-head"><div><b><Icon name={info.icon}/> {type}</b>{state.fileName&&<small>{state.fileName}</small>}</div>{state.status==='done'&&<Badge tone={needsAttention?'red':'green'}>{needsAttention?'확인 필요':'정보 반영됨'}</Badge>}</div>
 {state.status==='idle'&&<div className="doc-idle"><p className="doc-desc">{info.description}</p><div className="doc-fields-preview"><b>추출 예정 항목</b><div className="doc-chip-list">{info.expectedFields.map(f=><span className="doc-chip" key={f}>{f}</span>)}</div></div>{type==='화물운송장'?<><button type="button" className="primary doc-generate-btn" onClick={()=>onUpload(type,'AI 생성 초안')}><Icon name="spark"/> AI로 초안 생성</button><label className="doc-upload doc-upload-secondary" htmlFor={inputId}><Icon name="plus"/>이미 작성된 문서가 있다면 업로드<input id={inputId} type="file" hidden onChange={e=>{const f=e.target.files?.[0];if(f)onUpload(type,f.name)}}/></label></>:<label className="doc-upload" htmlFor={inputId}><Icon name="plus"/>파일 업로드<input id={inputId} type="file" hidden onChange={e=>{const f=e.target.files?.[0];if(f)onUpload(type,f.name)}}/></label>}<small className="doc-format-note">{info.formats.join(' · ')}</small></div>}
 {state.status==='loading'&&<div className="doc-loading"><span className="spinner"/>{state.fileName==='AI 생성 초안'?'AI가 화물운송장 초안을 작성하고 있습니다...':'AI가 문서에서 정보를 추출하고 있습니다...'}</div>}
 {extraction&&<table className="doc-fields"><tbody>{extraction.fields.map(f=><tr key={f.label} className={f.status}><td>{f.label}</td><td>{f.extracted}</td><td><Badge tone={f.status==='match'?'green':f.status==='mismatch'?'red':'blue'}>{f.status==='match'?'반영됨':f.status==='mismatch'?'확인 필요':'참고용'}</Badge></td></tr>)}</tbody></table>}
 {extraction?.checklist&&<div className="doc-checklist"><b>통일규칙 체크리스트</b>{extraction.checklist.map(c=><div className={c.pass?'pass':'fail'} key={c.label}><span>{c.pass?'✓':'✕'}</span><div><b>{c.label}</b>{c.note&&<small>{c.note}</small>}</div></div>)}</div>}
 {extraction?.note&&<p className="doc-note"><Icon name="info"/>{extraction.note}</p>}
 </section>
}

function DisputeChat({item,verdict,pressure,invoice}:{item:CaseItem;verdict:Verdict;pressure:QuotePressureAnalysis;invoice:InvoiceComparison}){
 const [messages,setMessages]=useState<ChatMessage[]>([{role:'bot',text:'정산 결과에 대해 궁금한 점을 물어보세요. (예: "왜 이렇게 비싸요?", "차액이 얼마예요?")'}]);
 const [input,setInput]=useState('');
 const send=()=>{
  if(!input.trim())return;
  const answer=answerDispute(input,item,verdict,pressure,invoice);
  saveDisputeMessage({caseId:item.id,role:'user',content:input}).catch(error=>console.error('채팅 저장 실패:',error));
  saveDisputeMessage({caseId:item.id,role:'assistant',content:answer}).catch(error=>console.error('채팅 저장 실패:',error));
  setMessages(m=>[...m,{role:'user',text:input},{role:'bot',text:answer}]);
  setInput('');
 };
 return <section className="card dispute-chat">
  <div className="card-head"><div><span className="section-kicker">DISPUTE CHATBOT</span><h3>이의제기 챗봇</h3></div></div>
  <div className="chat-log">{messages.map((m,i)=><div key={i} className={`chat-msg ${m.role}`}>{m.text}</div>)}</div>
  <div className="chat-input"><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')send()}} placeholder="질문을 입력하세요"/><button onClick={send}><Icon name="arrow"/></button></div>
  <small className="hint">실시간 AI 응답이 아니라, 이미 계산된 판정 근거를 바탕으로 답하는 규칙 기반 챗봇입니다.</small>
 </section>}

function Settlement({item,docs,onUpload,notify,validation}:{item:CaseItem;docs:Record<DocumentType,DocState>;onUpload:(type:DocumentType,fileName:string)=>void;notify:(m:string)=>void;validation:ValidationResult}){
 const invoiceState=docs.Invoice;
 const [taxInvoiceGenerated,setTaxInvoiceGenerated]=useState(false);
 const scheduleLines=useMemo(()=>splitCostByStages(item.price,costBearingStages(validation.routePath.stages)),[item.price,validation.routePath]);
 const invoice=invoiceState.status==='done'?buildInvoiceComparison(item):null;
 const pressure=buildPressure(validation);
 return <div>
  <div className="validation-title"><div><span className="section-kicker">SETTLEMENT DRAFT</span><h2>정산 내역서</h2><p>코레일이 계약금액을 기준으로 먼저 작성한 정산 내역서입니다. 실제 Invoice가 도착하면 업로드해서 대조할 수 있습니다.</p></div>{invoice&&<div className="export"><button onClick={()=>notify('PDF 내보내기 데모가 실행되었습니다.')}><Icon name="download"/> PDF</button><button onClick={()=>notify('CSV 내보내기 데모가 실행되었습니다.')}><Icon name="download"/> CSV</button><button onClick={()=>notify('인쇄 화면을 준비했습니다.')}><Icon name="print"/> 인쇄</button></div>}</div>
  <section className="card settlement-draft">
   <div className="card-head"><div><span className="section-kicker">코레일 작성</span><h3>정산 내역서 초안</h3></div></div>
   <table className="schedule-table"><thead><tr><th>구간</th><th>운송 방식</th><th>금액</th></tr></thead><tbody>{scheduleLines.map(l=><tr key={l.label}><td>{l.label}</td><td>{l.mode}</td><td>{money(l.amount)}</td></tr>)}</tbody><tfoot><tr><td colSpan={2}>합계(계약금액)</td><td><b>{money(item.price)}</b></td></tr></tfoot></table>
  </section>
  {!invoice&&<section className="card doc-card">
   <div className="doc-card-head"><div><b>Invoice 대조</b>{invoiceState.fileName&&<small>{invoiceState.fileName}</small>}</div></div>
   <p className="doc-desc">실제 포워더 Invoice가 도착하면 업로드해서 위 정산 내역서와 대조하세요.</p>
   {invoiceState.status==='idle'&&<label className="doc-upload" htmlFor="upload-invoice-settlement"><Icon name="plus"/>Invoice 업로드<input id="upload-invoice-settlement" type="file" hidden onChange={e=>{const f=e.target.files?.[0];if(f)onUpload('Invoice',f.name)}}/></label>}
   {invoiceState.status==='loading'&&<div className="doc-loading"><span className="spinner"/>AI가 Invoice에서 청구내역을 추출하고 있습니다...</div>}
  </section>}
  {invoice&&<>
   {invoice.isMismatch&&<div className="notice"><Icon name="info"/><span><b>계약금액과 Invoice 청구액이 일치하지 않습니다.</b> 차액 {invoice.diff>=0?'+':''}{money(invoice.diff)} — 신규 항목(BAF·서류비 등) 포함 여부를 포워더에 확인하세요.</span></div>}
   <section className="card settlement-info"><h3>정산정보</h3><dl><div><dt>Case</dt><dd>{item.id}</dd></div><div><dt>화주</dt><dd>{item.shipper}</dd></div><div><dt>노선</dt><dd>{item.route}</dd></div><div><dt>포워더</dt><dd>{item.forwarder}</dd></div></dl></section>
   <section className="card cost-table"><table><thead><tr><th>비용 항목</th><th>금액</th><th>통화</th><th>구분</th></tr></thead><tbody>{invoice.lineItems.map(l=><tr key={l.label}><td>{l.label}</td><td>{l.amount.toLocaleString()}</td><td>{l.currency}</td><td>{l.isNew?<Badge tone="amber">신규 항목</Badge>:<Badge tone="blue">계약 대응</Badge>}</td></tr>)}</tbody></table><footer><span>Invoice 총액 vs 계약금액 {money(invoice.contractAmount)}<small>완전일치 기준 — 허용오차 없음</small></span><b style={{color:invoice.isMismatch?'#c84449':'#207c56'}}>{money(invoice.invoiceTotal)} ({invoice.diff>=0?'+':''}{money(invoice.diff)})</b></footer></section>
   <section className="card tax-invoice">
    <div className="card-head"><div><span className="section-kicker">TAX INVOICE</span><h3>세금계산서</h3></div>{taxInvoiceGenerated&&<Badge tone="green">발행 완료</Badge>}</div>
    {!taxInvoiceGenerated?<div className="tax-invoice-empty"><p>정산 대조 결과를 기준으로 세금계산서를 자동 생성합니다.</p><button className="primary" onClick={()=>{const tax=buildTaxInvoice(item,invoice);saveTaxInvoice({caseId:item.id,supplyAmount:tax.supplyAmount,vatAmount:tax.taxAmount,totalAmount:tax.totalAmount,currency:'USD',status:'issued'}).catch(error=>console.error('세금계산서 저장 실패:',error));setTaxInvoiceGenerated(true)}}><Icon name="spark"/> 세금계산서 발행</button></div>
    :(()=>{const tax=buildTaxInvoice(item,invoice);return <dl className="tax-invoice-fields">
      <div><dt>작성일자</dt><dd>{tax.issueDate}</dd></div>
      <div><dt>공급자</dt><dd>{tax.supplierName} ({tax.supplierBizNo})</dd></div>
      <div><dt>공급받는자</dt><dd>{tax.buyerName} ({tax.buyerBizNo})</dd></div>
      <div><dt>품목</dt><dd>{tax.itemDescription}</dd></div>
      <div><dt>과세유형</dt><dd>{tax.taxType}{tax.taxType==='영세율'&&<small className="tax-type-hint"> · 국제운송용역 기준(실제 적용은 세무 담당자 확인 필요)</small>}</dd></div>
      <div><dt>공급가액</dt><dd>${tax.supplyAmount.toLocaleString()}</dd></div>
      <div><dt>세액</dt><dd>${tax.taxAmount.toLocaleString()}</dd></div>
      <div><dt>합계금액</dt><dd><b>${tax.totalAmount.toLocaleString()}</b></dd></div>
     </dl>})()}
    <small className="hint">실제 국세청 홈택스 연동이 아닌 데모용 시뮬레이션입니다.</small>
   </section>
   <DisputeChat item={item} verdict={validation.verdict} pressure={pressure} invoice={invoice}/>
  </>}
 </div>;
}

// 30일 시계열을 그대로 그리는 SVG 라인차트. 차트 라이브러리 없이 이 파일의 기존 SVG 스파크라인과
// 같은 방식(수동 polyline)으로 만들어, 대시보드 목업 스파크라인과 달리 실제 데이터를 반영한다.
function TrendChart({series,height=70}:{series:MarketPoint[];anomaly?:boolean;height?:number}){
 const values=series.map(p=>p.value);
 const lo=Math.min(...values),hi=Math.max(...values);
 const pad=(hi-lo)*0.15||1;
 const min=lo-pad,max=hi+pad;
 const W=300;
 const pts=series.map((p,i)=>`${((i/(series.length-1))*W).toFixed(1)},${(height-((p.value-min)/(max-min))*height).toFixed(1)}`).join(' ');
 return <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="trend-svg"><polyline points={pts} fill="none" stroke="#5a87d4" strokeWidth="1.6" vectorEffect="non-scaling-stroke"/></svg>
}

// 인과분석 문장의 주어는 항상 지표의 정식 명칭이어야 한다 — Drawer 제목(state.title)은
// 참고정보에서 뉴스 기사를 클릭했을 때 그 기사 헤드라인으로도 채워지므로, 그대로 쓰면
// "그 뉴스 제목이(가) 상승했습니다... 같은 기간 그 뉴스 제목이 확인되어" 같은 자기참조 문장이 된다.
const INDICATOR_LABELS:Record<'usdKrw'|'brent'|'cnyKrw'|'kztUsd'|'uzsUsd'|'kgsUsd'|'kcci'|'kci',string>={usdKrw:'USD/KRW 환율',brent:'Brent 유가',cnyKrw:'CNY/KRW 환율',kztUsd:'USD/KZT 환율',uzsUsd:'USD/UZS 환율',kgsUsd:'USD/KGS 환율',kcci:'KCCI(종합, 자체 산출)',kci:'KCI(한중항로, 자체 산출)'};

function EvidenceDrawer({state,close}:{state:DrawerState;close:()=>void}){
 const series=state.indicator?marketSeries[state.indicator]:null;
 const anomaly=state.indicator?detectAnomaly(marketSeries[state.indicator]):null;
 const causal=state.indicator?buildCausalAnalysis(INDICATOR_LABELS[state.indicator],state.indicator,anomaly,newsArticles):null;
 const categoryNews=state.category?newsArticles.filter(n=>n.category===state.category):newsArticles.slice(0,3);
 const relatedNews=causal?causal.matchedNews:(state.articleId?[...categoryNews].sort((a,b)=>a.id===state.articleId?-1:b.id===state.articleId?1:0).slice(0,6):categoryNews);
 const isArticle=!!state.articleId;
 return <><div className="overlay" onClick={close}/><div className={`drawer ${isArticle?'article-drawer':''}`} role="dialog" aria-modal="true">
  <header><h2>{state.title}</h2><button onClick={close} aria-label="팝업 닫기">×</button></header>
  {series&&anomaly&&<div className="drawer-chart"><TrendChart series={series} anomaly={anomaly.isAnomaly}/><div className="drawer-stats"><div><b>{series[series.length-1].value.toLocaleString(undefined,{maximumFractionDigits:2})}</b><span>현재값</span></div><div><b>{anomaly.z.toFixed(1)}</b><span>z-score</span></div><div><b style={{color:anomaly.isAnomaly?'#c84449':'#207c56'}}>{anomaly.isAnomaly?'이상탐지됨':'정상 범위'}</b><span>30일 기준</span></div></div></div>}
  {causal?<div className="causal-box"><Icon name="spark"/><div><small>AI 인과분석 · {causal.confidence==='news_based'?'뉴스 근거':'추정'}</small><p>{causal.explanation}</p></div></div>:!isArticle&&<p className="drawer-intro">현재 견적의 운송구간과 시점을 기준으로 관련성이 높은 근거를 정리했습니다.</p>}
  <h3>근거 뉴스</h3>
  {relatedNews.length?relatedNews.map((n,i)=><article key={n.id}><span>0{i+1}</span><div><b>{n.title}</b><p>{n.summary}</p><small>{n.source} · {n.date} <Icon name="external"/></small></div></article>):<p className="doc-note"><Icon name="info"/>관련된 뉴스가 확인되지 않았습니다.</p>}
  <footer><div><b>근거 자료 확인 완료</b><span>필요 시 검증·포워더 문의 자료로 참고하세요.</span></div></footer>
 </div></>
}
function ConfirmModal({close,confirm}:{close:()=>void;confirm:()=>void}){return <><div className="overlay"/><div className="modal"><span className="modal-icon">✓</span><h2>해당 견적을 최종 확정하시겠습니까?</h2><p>확정 후 계약 특약 초안 작성 단계로 이동합니다.<br/>견적 정보는 이후에도 확인할 수 있습니다.</p><div><button className="secondary" onClick={close}>취소</button><button className="primary" onClick={confirm}>견적 확정</button></div></div></>}
// 시장지표 이상탐지 + 이번 주 뉴스 카테고리 요약을 한 카드로 모은다.
// 검색 결과 목록(뉴스 24건)을 처음부터 스크롤하지 않아도 "지금 뭐가 중요한지"를
// 바로 파악할 수 있도록 정보 검색 화면 맨 위에 배치한다.
const WEEKLY_BRIEFING_WEEK_START = "2026-08-04"; // TODAY(2026-08-10) 기준 최근 7일
const WEEKLY_INDICATORS:{key:'usdKrw'|'cnyKrw'|'brent'|'kztUsd'|'uzsUsd'|'kgsUsd'|'kcci'|'kci';label:string}[]=[
 {key:'usdKrw',label:'USD/KRW 환율'},{key:'cnyKrw',label:'CNY/KRW 환율'},{key:'brent',label:'Brent 유가'},{key:'kztUsd',label:'USD/KZT 환율'},{key:'uzsUsd',label:'USD/UZS 환율'},{key:'kgsUsd',label:'USD/KGS 환율'},{key:'kcci',label:'KCCI(종합)'},{key:'kci',label:'KCI(한중항로)'},
];
const CATEGORY_TONE:Record<NewsCategory,string>={TCR:'red',연운항:'red',환율:'blue',유가:'green',통관:'blue',규제:'red',지정학:'red'};
type RelevanceLevel='높음'|'보통'|'낮음';
const RELEVANCE_TONE:Record<RelevanceLevel,string>={높음:'red',보통:'amber',낮음:'green'};
const DEFAULT_RELEVANCE:Record<string,RelevanceLevel>={'N-1':'높음','N-2':'낮음','N-3':'보통'};
function resultRelevance(article:NewsArticle,index:number):RelevanceLevel{
 return DEFAULT_RELEVANCE[article.id]??(['높음','낮음','보통'] as RelevanceLevel[])[index%3];
}
function relevanceLabel(level:RelevanceLevel){
 return level==='높음'?'관련도 높음':level==='낮음'?'낮은 관련도':'보통 관련도';
}
function WeeklyBriefing({setDrawer}:{setDrawer:(s:DrawerState)=>void}){
 const anomalies=WEEKLY_INDICATORS.map(d=>({...d,anomaly:detectAnomaly(marketSeries[d.key])})).filter((d):d is typeof d&{anomaly:NonNullable<typeof d.anomaly>}=>!!d.anomaly?.isAnomaly).slice(0,4);
 const weekNews=newsArticles.filter(n=>n.date>=WEEKLY_BRIEFING_WEEK_START);
 // 조사된 실제 영향력 순서(정책·화차공급·지정학 > 유가·환율 > 그 외)로 나열한다.
 const categorySummaries=(['규제','TCR','지정학','유가','환율','연운항','통관'] as NewsCategory[]).map(cat=>{
  const items=weekNews.filter(n=>n.category===cat).sort((a,b)=>b.date.localeCompare(a.date));
  return {cat,count:items.length,latest:items[0]};
 }).filter(c=>c.count>0);
 return <section className="card weekly-briefing"><div className="card-head"><div><span className="section-kicker"><Icon name="spark"/> WEEKLY BRIEFING</span><h2>이번 주 시황 브리핑</h2><p>8월 4일 – 8월 10일 시장지표 이상탐지와 주요 이슈를 모았습니다.</p></div></div>
  {anomalies.length>0?<div className="wb-indicators">{anomalies.map(a=><button className="wb-indicator" key={a.key} onClick={()=>setDrawer({title:a.label,indicator:a.key})}><span className={`wb-dir ${a.anomaly.direction}`}>{a.anomaly.direction==='up'?'▲':'▼'}</span><div><b>{a.label}</b><span>{a.anomaly.changePct>=0?'+':''}{a.anomaly.changePct.toFixed(1)}% · z={a.anomaly.z.toFixed(1)}</span></div><Icon name="arrow"/></button>)}</div>:<p className="wb-empty"><Icon name="check"/> 이번 주 이상탐지된 시장지표가 없습니다 — 안정적인 한 주입니다.</p>}
  <div className="wb-news">{categorySummaries.map(c=><button className="wb-news-row" key={c.cat} onClick={()=>setDrawer(c.cat==='환율'?{title:INDICATOR_LABELS[c.latest.indicator??'usdKrw'],indicator:c.latest.indicator??'usdKrw'}:{title:c.latest.title,category:c.cat,articleId:c.latest.id})}><Badge tone="red">{c.cat}</Badge><b>{c.latest.title}</b><span>이번 주 {c.count}건</span><Icon name="arrow"/></button>)}</div>
 </section>
}

function GlobalSearch({cases,notify}:{cases:CaseItem[];notify:(m:string)=>void}){
 const [q,setQ]=useState('');
 const [filter,setFilter]=useState('전체');
 const [drawer,setDrawer]=useState<DrawerState|null>(null);
 const [chatOpen,setChatOpen]=useState(false);
 const results=useMemo(()=>{
  const query=q.trim().toLowerCase();
  const tokens=query.split(/\s+/).filter(Boolean);
  return newsArticles.filter(n=>{
   const haystack=`${n.title} ${n.summary} ${n.category} ${n.source}`.toLowerCase();
   return (filter==='전체'||n.category===filter)&&(tokens.length===0||tokens.some(token=>haystack.includes(token)));
  }).sort((a,b)=>{
   if(tokens.length===0)return 0;
   const score=(n:NewsArticle)=>tokens.reduce((sum,token)=>sum+(`${n.title} ${n.summary} ${n.category}`.toLowerCase().includes(token)?1:0),0);
   return score(b)-score(a);
  }).slice(0,filter==='전체'?3:8);
 },[filter,q]);
 const caseResults=useMemo(()=>{
  if(filter!=='전체'&&filter!=='과거견적')return [];
  const query=q.trim().toLowerCase();
  const tokens=query.split(/\s+/).filter(Boolean);
  return cases.filter(c=>{const haystack=`${c.id} ${c.route} ${c.shipper} ${c.item}`.toLowerCase();return tokens.length===0||tokens.some(token=>haystack.includes(token));}).slice(0,filter==='과거견적'?8:1);
 },[cases,filter,q]);
 const resultCount=results.length+caseResults.length;
 return <div className="page search-page figma-search-page">
  <WeeklyBriefing setDrawer={setDrawer}/>
  <label className="hero-search"><Icon name="search"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="노선, 국가, 시장정보, 과거 견적을 검색하세요"/></label>
  <div className="chips reference-chips">{['전체','규제','TCR','지정학','연운항','환율','유가','통관','과거견적'].map(x=><button className={filter===x?'active':''} onClick={()=>setFilter(x)} key={x}>{x}</button>)}</div>
  {q.trim()&&<div className="search-result-heading"><b>‘{q.trim()}’ 검색 결과</b><span>{resultCount}건</span></div>}
  <div className="search-results figma-search-results">
   {results.map((n,index)=>{const relevance=resultRelevance(n,index);const openEvidence=()=>setDrawer(n.category==='환율'?{title:INDICATOR_LABELS[n.indicator??'usdKrw'],indicator:n.indicator??'usdKrw'}:{title:n.title,category:n.category,articleId:n.id});return <article className="card search-result searchable-article" key={n.id} role="button" tabIndex={0} onClick={openEvidence} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openEvidence();}}}><div><Badge tone={RELEVANCE_TONE[relevance]}>{n.category} · {relevanceLabel(relevance)}</Badge><h3>{n.title}</h3><p>{n.summary}</p><small>{n.source} · {n.date}</small></div><button onClick={e=>{e.stopPropagation();notify('KORAIL-2026-001 참고자료로 추가했습니다.')}}><Icon name="plus"/> Case에 추가</button></article>})}
   {caseResults.map(c=><article className="card search-result" key={c.id}><div><Badge>내부 Case</Badge><h3>{c.route} 운송 견적</h3><p>{c.shipper} · {c.item} · {c.container} · {money(c.price)}</p><small>{c.id} · {c.date}</small></div><button onClick={()=>notify('현재 Case 비교자료로 추가했습니다.')}><Icon name="plus"/> Case에 추가</button></article>)}
   {results.length===0&&caseResults.length===0&&<div className="card search-empty">검색 결과가 없습니다.</div>}
  </div>
  <button className="chatbot" onClick={()=>setChatOpen(true)}><img src="/icons/chatbot-train.svg" alt="" aria-hidden/><span>챗봇</span></button>
  {chatOpen&&<HomeChatbot item={cases[0]} close={()=>setChatOpen(false)}/>} 
  {drawer&&<EvidenceDrawer state={drawer} close={()=>setDrawer(null)}/>} 
 </div>;
}
const MODULE_META:Record<string,{eyebrow:string;pending:number}>={계약:{eyebrow:'CONTRACTS',pending:3},문서:{eyebrow:'DOCUMENTS',pending:2},정산:{eyebrow:'SETTLEMENTS',pending:2}};
function ModuleList({type,cases,go}:{type:string;cases:CaseItem[];go:(p:string)=>void}){const subset=cases.filter(c=>type==='계약'?['견적 확정','계약','정산'].includes(c.status):['계약','정산'].includes(c.status));const meta=MODULE_META[type]??MODULE_META['계약'];return <div className="page"><PageTitle eyebrow={meta.eyebrow} title={`${type} 업무`} desc={`견적 Case와 연결된 ${type} 진행상태를 확인하세요.`}/><div className="module-stats"><div className="card"><span>진행 대기</span><b>{meta.pending}</b><small>이번 주</small></div><div className="card"><span>검토 중</span><b>2</b><small>담당자 확인 필요</small></div><div className="card"><span>완료</span><b>8</b><small>이번 달</small></div></div><div className="table-card card"><div className="table-summary"><b>{type} 대상 Case</b><span>{subset.length}건</span></div><table><thead><tr><th>CASE 번호</th><th>화주 / 품목</th><th>노선</th><th>포워더</th><th>상태</th><th></th></tr></thead><tbody>{subset.map(c=><tr key={c.id} onClick={()=>go('/cases/'+c.id+'?tab='+encodeURIComponent(type))}><td><b>{c.id}</b></td><td><b>{c.shipper}</b><small>{c.item}</small></td><td>{c.route}</td><td>{c.forwarder}</td><td><Badge tone={statusClass(c.status)}>{c.status}</Badge></td><td><Icon name="arrow"/></td></tr>)}</tbody></table></div></div>}
