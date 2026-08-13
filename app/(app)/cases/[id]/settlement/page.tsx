'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useCases } from '../../../../lib/state';
import type { InvoiceLineItem } from '../../../../lib/types';
import { buildInvoiceDraft, buildInvoiceSummary, MATCH_CATEGORY_LABEL, type MatchCategory } from '../../../../lib/settlementEngine';
import { buildTaxInvoice } from '../../../../lib/taxInvoiceEngine';
import { answerDispute } from '../../../../lib/disputeChatEngine';
import { requestDisputeChat } from '../../../../lib/disputeChatApi';
import { validateQuote } from '../../../../lib/quoteEngine';
import { historicalQuotes, SERIES, relevantIndicatorsForRoute } from '../../../../lib/marketData';
import { buildCausalAnalysis } from '../../../../lib/causalAnalysis';
import { getRoute } from '../../../../lib/routeData';
import { newsArticles } from '../../../../lib/newsData';
import { insertTaxInvoice, insertDisputeChatMessage, saveInvoiceComparison } from '../../../../lib/supabase';

const CATEGORY_COLOR: Record<MatchCategory, string> = {
  match: 'bg-green-100 text-green-700',
  confirm_needed: 'bg-amber-100 text-amber-700',
  new_item: 'bg-blue-100 text-blue-700',
  missing: 'bg-red-100 text-red-700',
  uncertain_match: 'bg-neutral-200 text-neutral-700',
};

export default function CaseSettlementPage() {
  const params = useParams<{ id: string }>();
  const { cases, setCasesAndPersist } = useCases();
  const item = cases.find((c) => c.id === params.id);

  const [lines, setLines] = useState<InvoiceLineItem[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);

  useEffect(() => {
    if (!item) return;
    setLines(item.invoiceLines ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  const summary = useMemo(() => (item ? buildInvoiceSummary(item.costLedger, lines) : null), [item, lines]);
  const route = useMemo(() => (item ? getRoute(item.masterData.destination) : undefined), [item]);

  if (!item) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-8">
        <p className="text-sm text-neutral-500">Case를 찾을 수 없습니다.</p>
      </main>
    );
  }

  if (item.contract?.signStatus !== 'signed') {
    return (
      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-lg font-semibold text-neutral-900">정산</h1>
        <p className="mt-3 text-sm text-neutral-500">
          먼저 계약 서명을 완료해야 정산을 진행할 수 있습니다.{' '}
          <a href={`/cases/${item.id}/contract`} className="underline">
            계약으로 이동
          </a>
        </p>
      </main>
    );
  }

  function persistLines(next: InvoiceLineItem[]) {
    setLines(next);
    setCasesAndPersist((prev) => prev.map((c) => (c.id === item!.id ? { ...c, invoiceLines: next } : c)));
    void saveInvoiceComparison({
      caseId: item!.id,
      lineItems: next.map((line) => ({ category: line.matchedStageId ?? 'manual', label: line.description, amount: line.amount, currency: 'USD' })),
    }).catch(() => {});
  }

  function handleGenerateDraft() {
    persistLines(buildInvoiceDraft(item!.costLedger));
  }

  function updateLine(id: string, amount: number) {
    persistLines(lines.map((l) => (l.id === id ? { ...l, amount } : l)));
  }

  function removeLine(id: string) {
    persistLines(lines.filter((l) => l.id !== id));
  }

  function addLine() {
    persistLines([...lines, { id: crypto.randomUUID(), description: '신규 항목', amount: 0 }]);
  }

  async function handleGenerateTaxInvoice() {
    if (!summary) return;
    const invoice = buildTaxInvoice(item!.masterData.shipperName, summary.invoiceTotal);
    setCasesAndPersist((prev) => prev.map((c) => (c.id === item!.id ? { ...c, taxInvoices: [...(c.taxInvoices ?? []), invoice] } : c)));
    await insertTaxInvoice(item!.id, invoice).catch(() => {});
  }

  async function handleSend() {
    const question = chatInput.trim();
    if (!question || !summary || chatSending) return;
    setChatInput('');
    setChatSending(true);

    const target = {
      route: item!.masterData.destination,
      containerType: item!.masterData.containerType,
      cargoType: item!.masterData.cargoType,
      shipmentDate: item!.masterData.shipmentDate,
    };
    const verdict = validateQuote(
      item!.costLedger.reduce((s, l) => s + l.contractAmount, 0),
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
        history: (item!.disputeMessages ?? []).slice(-10).map((message) => ({ role: message.role === 'assistant' ? 'bot' : 'user', text: message.text })),
        context: {
          case: { id: item!.caseNumber, shipper: item!.shipperName, route: item!.route, price: item!.price, currency: 'USD', masterData: item!.masterData },
          quoteVerdict: { narrative: verdict.narrative }, marketAnalysis: { explanations: causalNarratives },
          contractClauses: item!.contract?.clauses ?? [],
          documents: (item!.documents ?? []).map((document) => ({ type: document.documentType, fileName: document.fileName, status: 'done', extraction: document.extractedSnapshot })),
          costLedger: item!.costLedger.map((line) => ({ stageName: line.stageName, costItem: line.stageName, contractAmount: line.contractAmount, currency: line.currency })),
          invoiceComparison: { contractAmount: summary.contractTotal, invoiceTotal: summary.invoiceTotal, diff: summary.totalDiff, lineItems: summary.comparison },
          changeHistory: item!.masterData.changeHistory,
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
      prev.map((c) => (c.id === item!.id ? { ...c, disputeMessages: [...(c.disputeMessages ?? []), userMsg, assistantMsg] } : c))
    );
    await insertDisputeChatMessage(item!.id, { role: 'user', content: question, evidenceRef: {} }).catch(() => {});
    await insertDisputeChatMessage(item!.id, { role: 'assistant', content: answerText, evidenceRef: { sources: answerEvidence } }).catch(() => {});
  }

  const problemRows = summary?.comparison.filter((r) => r.category !== 'match') ?? [];

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-lg font-semibold text-neutral-900">정산</h1>
      <p className="mt-1 text-sm text-neutral-500">{item.caseNumber} · 계약 기준 Cost Ledger ↔ Invoice 라인아이템 항목별 대조</p>

      {lines.length === 0 ? (
        <button
          onClick={handleGenerateDraft}
          className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Invoice 초안 생성
        </button>
      ) : (
        <>
          {summary && (
            <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
              <h2 className="text-sm font-medium text-neutral-700">차액을 만든 항목</h2>
              {problemRows.length === 0 ? (
                <p className="mt-2 text-sm text-neutral-500">차액이나 신규/누락 항목이 없습니다.</p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {problemRows.map((r, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${CATEGORY_COLOR[r.category]}`}>
                        {MATCH_CATEGORY_LABEL[r.category]}
                      </span>
                      <span className="text-neutral-700">
                        {r.stageName ?? r.description}
                        {r.diff !== undefined && r.diff !== 0 ? ` (차액 ${r.diff > 0 ? '+' : ''}$${r.diff.toLocaleString()})` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-neutral-100 pt-4 text-sm sm:grid-cols-5">
                <div>
                  <dt className="text-xs text-neutral-400">Invoice 총액</dt>
                  <dd className="font-medium">${summary.invoiceTotal.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-400">계약 총액</dt>
                  <dd className="font-medium">${summary.contractTotal.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-400">총 차액</dt>
                  <dd className="font-medium">${summary.totalDiff.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-400">차액 발생 항목</dt>
                  <dd className="font-medium">{summary.diffCount}건</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-400">신규 청구 항목</dt>
                  <dd className="font-medium">{summary.newItemCount}건</dd>
                </div>
              </dl>
            </section>
          )}

          <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-neutral-700">Invoice 라인아이템 (편집 가능)</h2>
              <button onClick={addLine} className="text-xs text-neutral-500 underline hover:text-neutral-900">
                항목 추가
              </button>
            </div>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-400">
                  <th className="py-2">항목</th>
                  <th className="py-2 text-right">금액(USD)</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-neutral-100 last:border-0">
                    <td className="py-2">{l.description}</td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        value={l.amount}
                        onChange={(e) => updateLine(l.id, Number(e.target.value))}
                        className="w-28 rounded-md border border-neutral-300 px-2 py-1 text-right text-sm"
                      />
                    </td>
                    <td className="py-2 text-right">
                      <button onClick={() => removeLine(l.id)} className="text-xs text-neutral-400 hover:text-red-600">
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {summary && (
            <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
              <h2 className="text-sm font-medium text-neutral-700">항목별 비교</h2>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs text-neutral-400">
                    <th className="py-2">항목</th>
                    <th className="py-2 text-right">계약금액</th>
                    <th className="py-2 text-right">Invoice</th>
                    <th className="py-2 text-right">차액</th>
                    <th className="py-2">판정</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.comparison.map((r, i) => (
                    <tr key={i} className="border-b border-neutral-100 last:border-0">
                      <td className="py-2">{r.stageName ?? r.description}</td>
                      <td className="py-2 text-right">{r.contractAmount !== undefined ? `$${r.contractAmount.toLocaleString()}` : '-'}</td>
                      <td className="py-2 text-right">{r.invoiceAmount !== undefined ? `$${r.invoiceAmount.toLocaleString()}` : '-'}</td>
                      <td className="py-2 text-right">{r.diff !== undefined ? `${r.diff > 0 ? '+' : ''}$${r.diff.toLocaleString()}` : '-'}</td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${CATEGORY_COLOR[r.category]}`}>
                          {MATCH_CATEGORY_LABEL[r.category]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-neutral-700">세금계산서</h2>
              <button onClick={handleGenerateTaxInvoice} className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800">
                세금계산서 생성
              </button>
            </div>
            <p className="mt-1 text-xs text-neutral-400">국세청 홈택스 연동이 아닌 미리보기 시뮬레이션입니다.</p>
            <div className="mt-3 space-y-3">
              {(item.taxInvoices ?? []).map((inv) => (
                <div key={inv.id} className="rounded-md border border-neutral-200 p-3 text-sm">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Field label="작성일자" value={inv.issuedDate} />
                    <Field label="공급자" value={inv.supplierBusinessNumber} />
                    <Field label="공급받는자" value={inv.customerBusinessNumber} />
                    <Field label="품목" value={inv.item} />
                    <Field label="공급가액" value={`$${inv.supplyAmount.toLocaleString()}`} />
                    <Field label="세액" value={`$${inv.vatAmount.toLocaleString()}`} />
                    <Field label="합계금액" value={`$${inv.totalAmount.toLocaleString()}`} />
                    <Field label="과세유형" value="영세율" />
                  </div>
                  <p className="mt-2 text-xs text-neutral-400">국제운송용역 기준(실제 적용은 세무 담당자 확인 필요)</p>
                </div>
              ))}
              {(!item.taxInvoices || item.taxInvoices.length === 0) && (
                <p className="text-sm text-neutral-400">아직 생성된 세금계산서가 없습니다.</p>
              )}
            </div>
          </section>

          <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
            <h2 className="text-sm font-medium text-neutral-700">이의제기 챗봇</h2>
            <p className="mt-1 text-xs text-neutral-400">실시간 LLM 호출이 아니라, 이미 계산된 판정 근거를 규칙 기반으로 인용합니다.</p>
            <div className="mt-3 space-y-3">
              {(item.disputeMessages ?? []).map((m) => (
                <div key={m.id} className={m.role === 'user' ? 'text-right' : ''}>
                  <div
                    className={`inline-block max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      m.role === 'user' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-800'
                    }`}
                  >
                    {m.text}
                  </div>
                  {m.evidence.length > 0 && <p className="mt-1 text-xs text-neutral-400">근거: {m.evidence.join(', ')}</p>}
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="예: 왜 이렇게 비싸요? / 차액이 얼마예요? / 왜 늦어져요?"
                className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
              />
              <button disabled={chatSending} onClick={handleSend} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50">
                전송
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="font-medium text-neutral-900">{value}</p>
    </div>
  );
}
