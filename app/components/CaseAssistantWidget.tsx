'use client';

import { useState } from 'react';
import { useCases } from '../lib/state';
import { answerDispute } from '../lib/disputeChatEngine';
import { requestDisputeChat } from '../lib/disputeChatApi';
import { validateQuote } from '../lib/quoteEngine';
import { historicalQuotes, SERIES, relevantIndicatorsForRoute } from '../lib/marketData';
import { buildCausalAnalysis } from '../lib/causalAnalysis';
import { buildInvoiceSummary } from '../lib/settlementEngine';
import { getRoute } from '../lib/routeData';
import { newsArticles } from '../lib/newsData';
import { insertDisputeChatMessage } from '../lib/supabase';

/** 정산 도우미(구 이의제기 챗봇) — Case 워크스페이스 어디서나 우측 하단 버튼으로 열 수 있는 팝업 챗봇. */
export function CaseAssistantWidget({ caseId }: { caseId: string }) {
  const { cases, setCasesAndPersist } = useCases();
  const item = cases.find((c) => c.id === caseId);
  const [open, setOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);

  if (!item) return null;

  const route = getRoute(item.masterData.destination);
  const summary = buildInvoiceSummary(item.costLedger, item.invoiceLines ?? []);

  async function handleSend() {
    const question = chatInput.trim();
    if (!question || chatSending || !item) return;
    setChatInput('');
    setChatSending(true);

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

    const fallback = answerDispute(question, {
      quoteVerdictNarrative: verdict.narrative,
      causalNarratives,
      invoiceSummary: summary,
      delayRelatedNews,
    });

    let answerText = fallback.text;
    let answerEvidence = fallback.evidence;
    try {
      const result = await requestDisputeChat({
        question,
        history: (item.disputeMessages ?? []).slice(-10).map((m) => ({ role: m.role === 'assistant' ? 'bot' : 'user', text: m.text })),
        context: {
          case: { id: item.caseNumber, shipper: item.shipperName, route: item.route, price: item.price, currency: 'USD', masterData: item.masterData },
          quoteVerdict: { narrative: verdict.narrative },
          marketAnalysis: { explanations: causalNarratives },
          contractClauses: item.contract?.clauses ?? [],
          documents: (item.documents ?? []).map((d) => ({ type: d.documentType, fileName: d.fileName, status: 'done', extraction: d.extractedSnapshot })),
          costLedger: item.costLedger.map((l) => ({ stageName: l.stageName, costItem: l.stageName, contractAmount: l.contractAmount, currency: l.currency })),
          invoiceComparison: { contractAmount: summary.contractTotal, invoiceTotal: summary.invoiceTotal, diff: summary.totalDiff, lineItems: summary.comparison },
          changeHistory: item.masterData.changeHistory,
        },
      });
      answerText = result.answer;
      answerEvidence = [`LLM model: ${result.model}`];
    } catch {
      answerEvidence = [...fallback.evidence, 'LLM unavailable; rule-based fallback used'];
    } finally {
      setChatSending(false);
    }

    const now = new Date().toISOString();
    const userMsg = { id: crypto.randomUUID(), role: 'user' as const, text: question, evidence: [], createdAt: now };
    const assistantMsg = { id: crypto.randomUUID(), role: 'assistant' as const, text: answerText, evidence: answerEvidence, createdAt: now };

    setCasesAndPersist((prev) =>
      prev.map((c) => (c.id === item.id ? { ...c, disputeMessages: [...(c.disputeMessages ?? []), userMsg, assistantMsg] } : c))
    );
    await insertDisputeChatMessage(item.id, { role: 'user', content: question, evidenceRef: {} }).catch(() => {});
    await insertDisputeChatMessage(item.id, { role: 'assistant', content: answerText, evidenceRef: { sources: answerEvidence } }).catch(() => {});
  }

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {open && (
        <div className="mb-3 flex h-[28rem] w-80 flex-col rounded-xl border border-neutral-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-neutral-900">정산 도우미</p>
              <p className="text-xs text-neutral-400">{item.caseNumber}의 견적·계약·문서·정산을 물어보세요</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-sm text-neutral-400 hover:text-neutral-700">
              닫기
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {(item.disputeMessages ?? []).length === 0 && (
              <p className="text-xs text-neutral-400">
                예: 이 견적이 왜 높게 나왔나요? / 이 특약은 왜 필요한가요? / 정산 차액이 왜 발생했나요?
              </p>
            )}
            {(item.disputeMessages ?? []).map((m) => (
              <div key={m.id} className={m.role === 'user' ? 'text-right' : ''}>
                <div
                  className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.role === 'user' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-800'
                  }`}
                >
                  {m.text}
                </div>
                {m.evidence.length > 0 && <p className="mt-1 text-xs text-neutral-400">근거: {m.evidence.join(', ')}</p>}
              </div>
            ))}
            {chatSending && <p className="text-xs text-neutral-400">답변 작성 중…</p>}
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
              disabled={chatSending}
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
        aria-label="정산 도우미 열기"
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
