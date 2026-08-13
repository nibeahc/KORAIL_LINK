'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useCases } from '../lib/state';
import { requestDisputeChat } from '../lib/disputeChatApi';
import { validateQuote } from '../lib/quoteEngine';
import { historicalQuotes, SERIES, relevantIndicatorsForRoute } from '../lib/marketData';
import { buildCausalAnalysis } from '../lib/causalAnalysis';
import { buildInvoiceSummary } from '../lib/settlementEngine';
import { getRoute } from '../lib/routeData';
import { CASE_STATUS_LABEL } from '../lib/types';

interface LocalMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

/**
 * KORAIL LINK 도우미 — 앱 전체(대시보드·시황·검색·모든 Case 화면)에서 열 수 있는 전체 기능 보조 챗봇.
 * 정산 탭의 "정산 도우미"와 같은 LLM(app/api/dispute-chat)을 쓰지만 역할이 다르다: 정산 도우미는
 * 그 Case의 정산 차액만 다루고, 이 위젯은 견적·계약·문서·정산을 포함해 보고 있는 화면 전체를 다룬다.
 * 대화 이력은 Case에 종속되지 않으므로 세션 동안만 유지한다(새로고침 시 초기화).
 */
export function AppAssistantWidget() {
  const pathname = usePathname();
  const { cases } = useCases();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);

  if (pathname === '/login') return null;

  const caseMatch = pathname.match(/^\/cases\/([^/]+)/);
  const activeCase = caseMatch ? cases.find((c) => c.id === caseMatch[1]) : undefined;

  function buildCaseContext(item: NonNullable<typeof activeCase>) {
    const route = getRoute(item.masterData.destination);
    const summary = buildInvoiceSummary(item.costLedger, item.invoiceLines ?? []);
    const target = {
      route: item.masterData.destination,
      containerType: item.masterData.containerType,
      cargoType: item.masterData.cargoType,
      shipmentDate: item.masterData.shipmentDate,
    };
    const verdict = validateQuote(
      item.costLedger.reduce((s, l) => s + l.contractAmount, 0),
      target,
      historicalQuotes
    );
    const causalNarratives = route
      ? relevantIndicatorsForRoute(route)
          .map((ind) => buildCausalAnalysis(ind, SERIES[ind]))
          .filter((a) => a.isAnomaly)
          .map((a) => a.narrative)
      : [];

    return {
      scope: 'case',
      case: {
        id: item.caseNumber,
        status: CASE_STATUS_LABEL[item.status],
        shipper: item.shipperName,
        route: item.route,
        price: item.price,
        currency: 'USD',
        masterData: item.masterData,
      },
      quoteVerdict: { narrative: verdict.narrative },
      marketAnalysis: { explanations: causalNarratives },
      contractClauses: item.contract?.clauses ?? [],
      documents: (item.documents ?? []).map((d) => ({ type: d.documentType, fileName: d.fileName, extraction: d.extractedSnapshot })),
      costLedger: item.costLedger.map((l) => ({ stageName: l.stageName, contractAmount: l.contractAmount, currency: l.currency })),
      invoiceComparison: { contractAmount: summary.contractTotal, invoiceTotal: summary.invoiceTotal, diff: summary.totalDiff, lineItems: summary.comparison },
      changeHistory: item.masterData.changeHistory,
    };
  }

  function buildGeneralContext() {
    return {
      scope: 'app',
      currentPage: pathname,
      caseList: cases.map((c) => ({ caseNumber: c.caseNumber, status: CASE_STATUS_LABEL[c.status], route: c.route, price: c.price })),
      appDescription:
        'KORAIL LINK는 코레일 국제복합운송 견적 검증(운임 인텔리전스)과 견적→계약→문서→정산 데이터 연결(Single Data Entry)을 지원하는 플랫폼이다.',
    };
  }

  async function handleSend() {
    const question = chatInput.trim();
    if (!question || sending) return;
    setChatInput('');
    setSending(true);

    const userMsg: LocalMessage = { id: crypto.randomUUID(), role: 'user', text: question };
    setMessages((prev) => [...prev, userMsg]);

    let answerText = '정확한 답변을 드리기 어렵습니다. 담당자에게 문의해주세요.';
    try {
      const result = await requestDisputeChat({
        question,
        history: messages.slice(-10).map((m) => ({ role: m.role === 'assistant' ? 'bot' : 'user', text: m.text })),
        context: activeCase ? buildCaseContext(activeCase) : buildGeneralContext(),
      });
      answerText = result.answer;
    } catch {
      answerText = '지금은 답변을 가져올 수 없습니다. 잠시 후 다시 시도해주세요.';
    } finally {
      setSending(false);
    }

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: answerText }]);
  }

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {open && (
        <div className="mb-3 flex h-[28rem] w-80 flex-col rounded-xl border border-neutral-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-neutral-900">KORAIL LINK 도우미</p>
              <p className="text-xs text-neutral-400">
                {activeCase ? `${activeCase.caseNumber} 전체 정보를 알고 있습니다` : '서비스 이용 전반을 안내합니다'}
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="text-sm text-neutral-400 hover:text-neutral-700">
              닫기
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <p className="text-xs text-neutral-400">
                예: 이 서비스는 뭘 도와주나요? / 이 Case는 지금 어느 단계인가요? / 이 견적이 왜 높게 나왔나요?
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={m.role === 'user' ? 'text-right' : ''}>
                <div
                  className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.role === 'user' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-800'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {sending && <p className="text-xs text-neutral-400">답변 작성 중…</p>}
          </div>

          <div className="flex gap-2 border-t border-neutral-200 p-3">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="질문을 입력하세요"
              className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
            <button
              disabled={sending}
              onClick={handleSend}
              className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              전송
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg hover:bg-neutral-800"
        aria-label="KORAIL LINK 도우미 열기"
      >
        {open ? (
          <span className="text-lg">×</span>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        )}
      </button>
    </div>
  );
}
