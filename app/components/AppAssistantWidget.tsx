'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useCases } from '../lib/state';
import { requestDisputeChat } from '../lib/disputeChatApi';
import { validateQuote } from '../lib/quoteEngine';
import { historicalQuotes, SERIES, relevantIndicatorsForRoute } from '../lib/marketData';
import { buildCausalAnalysis } from '../lib/causalAnalysis';
import { buildInvoiceSummary } from '../lib/settlementEngine';
import { answerDispute } from '../lib/disputeChatEngine';
import { newsArticles } from '../lib/newsData';
import { getRoute } from '../lib/routeData';
import { CASE_STATUS_LABEL, type CaseItem } from '../lib/types';
import { Icon } from './Icon';

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

  function analyzeCase(item: CaseItem) {
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
    const delayRelatedNews = newsArticles.filter((n) => n.category === 'TCR' || n.category === '연운항').slice(0, 3);

    return { route, summary, verdict, causalNarratives, delayRelatedNews };
  }

  function buildCaseContext(item: CaseItem, analysis: ReturnType<typeof analyzeCase>) {
    const { summary, verdict, causalNarratives } = analysis;
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

    const analysis = activeCase ? analyzeCase(activeCase) : null;
    let answerText = '정확한 답변을 드리기 어렵습니다. 담당자에게 문의해주세요.';
    if (analysis) {
      answerText = answerDispute(question, {
        quoteVerdictNarrative: analysis.verdict.narrative,
        causalNarratives: analysis.causalNarratives,
        invoiceSummary: analysis.summary,
        delayRelatedNews: analysis.delayRelatedNews,
      }).text;
    }

    try {
      const result = await requestDisputeChat({
        question,
        history: messages.slice(-10).map((m) => ({ role: m.role === 'assistant' ? 'bot' : 'user', text: m.text })),
        context: activeCase && analysis ? buildCaseContext(activeCase, analysis) : buildGeneralContext(),
      });
      answerText = result.answer;
    } catch {
      // keep the rule-based fallback (or the generic apology when there's no active case) computed above
    } finally {
      setSending(false);
    }

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: answerText }]);
  }

  return (
    <>
      <button type="button" className="chatbot" onClick={() => setOpen(true)} aria-label="KORAIL LINK 도우미 열기">
        <img src="/icons/chatbot-train.svg" alt="" aria-hidden />
        <span>챗봇</span>
      </button>
      {open && (
        <>
          <button type="button" className="chat-overlay" aria-label="챗봇 닫기" onClick={() => setOpen(false)} />
          <section className="home-chat-modal" role="dialog" aria-modal="true" aria-labelledby="assistant-chat-title">
            <header>
              <div>
                <h2 id="assistant-chat-title">KORAIL LINK 도우미</h2>
                <small style={{ display: 'block', color: 'var(--muted)', fontSize: 9, marginTop: 2 }}>
                  {activeCase ? `${activeCase.caseNumber} 전체 정보를 알고 있습니다` : '서비스 이용 전반을 안내합니다'}
                </small>
              </div>
              <button type="button" aria-label="닫기" onClick={() => setOpen(false)}>
                ×
              </button>
            </header>
            <div className="home-chat-log">
              {messages.length === 0 && (
                <div className="home-chat-message bot">예: 이 서비스는 뭘 도와주나요? / 이 Case는 지금 어느 단계인가요? / 이 견적이 왜 높게 나왔나요?</div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`home-chat-message ${m.role === 'user' ? 'user' : 'bot'}`}>
                  {m.text}
                </div>
              ))}
              {sending && <div className="home-chat-message bot">답변 작성 중…</div>}
            </div>
            <div className="home-chat-input">
              <input
                autoFocus
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="질문을 입력하세요"
              />
              <button type="button" disabled={sending} onClick={handleSend} aria-label="전송">
                <Icon name="arrow" />
              </button>
            </div>
          </section>
        </>
      )}
    </>
  );
}
