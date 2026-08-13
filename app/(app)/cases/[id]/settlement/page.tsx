'use client';

import { useMemo, useState } from 'react';
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
import { CaseHeader } from '../../../../components/CaseHeader';
import { CaseTabs } from '../../../../components/CaseTabs';
import { Badge } from '../../../../components/Badge';
import { Icon } from '../../../../components/Icon';

const CATEGORY_TONE: Record<MatchCategory, 'green' | 'amber' | 'blue' | 'red'> = {
  match: 'green',
  confirm_needed: 'amber',
  new_item: 'blue',
  missing: 'red',
  uncertain_match: 'blue',
};

export default function CaseSettlementPage() {
  const params = useParams<{ id: string }>();
  const { cases, setCasesAndPersist } = useCases();
  const item = cases.find((c) => c.id === params.id);

  const [lines, setLines] = useState<InvoiceLineItem[]>([]);
  const [loadedItemId, setLoadedItemId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);

  if (item && item.id !== loadedItemId) {
    setLoadedItemId(item.id);
    setLines(item.invoiceLines ?? []);
  }

  const summary = useMemo(() => (item ? buildInvoiceSummary(item.costLedger, lines) : null), [item, lines]);
  const route = useMemo(() => (item ? getRoute(item.masterData.destination) : undefined), [item]);

  if (!item) {
    return (
      <div className="page">
        <p style={{ color: 'var(--muted)', fontSize: 12 }}>Case를 찾을 수 없습니다.</p>
      </div>
    );
  }

  if (item.contract?.signStatus !== 'signed') {
    return (
      <div className="case-workspace figma-case-detail">
        <CaseHeader item={item} />
        <CaseTabs caseId={item.id} />
        <div className="workspace-body">
          <p style={{ color: 'var(--muted)', fontSize: 12 }}>
            먼저 계약 서명을 완료해야 정산을 진행할 수 있습니다.{' '}
            <a href={`/cases/${item.id}/contract`} style={{ color: 'var(--blue)' }}>
              계약으로 이동
            </a>
          </p>
        </div>
      </div>
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
    try {
      const result = await requestDisputeChat({
        question,
        history: (item!.disputeMessages ?? []).slice(-10).map((m) => ({ role: m.role === 'assistant' ? 'bot' : 'user', text: m.text })),
        context: {
          scope: 'settlement',
          case: { id: item!.caseNumber, shipper: item!.shipperName, route: item!.route, price: item!.price, currency: 'USD' },
          quoteVerdict: { narrative: verdict.narrative },
          marketAnalysis: { explanations: causalNarratives },
          invoiceComparison: { contractAmount: summary.contractTotal, invoiceTotal: summary.invoiceTotal, diff: summary.totalDiff, lineItems: summary.comparison },
        },
      });
      answerText = result.answer;
    } catch {
      // rule-based fallback already set above
    } finally {
      setChatSending(false);
    }

    const now = new Date().toISOString();
    const userMsg = { id: crypto.randomUUID(), role: 'user' as const, text: question, evidence: [], createdAt: now };
    const assistantMsg = { id: crypto.randomUUID(), role: 'assistant' as const, text: answerText, evidence: [], createdAt: now };

    setCasesAndPersist((prev) => prev.map((c) => (c.id === item!.id ? { ...c, disputeMessages: [...(c.disputeMessages ?? []), userMsg, assistantMsg] } : c)));
    await insertDisputeChatMessage(item!.id, { role: 'user', content: question, evidenceRef: {} }).catch(() => {});
    await insertDisputeChatMessage(item!.id, { role: 'assistant', content: answerText, evidenceRef: {} }).catch(() => {});
  }

  const problemRows = summary?.comparison.filter((r) => r.category !== 'match') ?? [];

  return (
    <div className="case-workspace figma-case-detail">
      <CaseHeader item={item} />
      <CaseTabs caseId={item.id} />

      <div className="workspace-body">
        <div className="validation-title">
          <div>
            <span className="section-kicker">SETTLEMENT</span>
            <h2>정산</h2>
            <p>계약 기준 Cost Ledger ↔ Invoice 라인아이템을 항목별로 대조합니다.</p>
          </div>
        </div>

        {lines.length === 0 ? (
          <button className="primary" onClick={handleGenerateDraft}>
            <Icon name="spark" /> Invoice 초안 생성
          </button>
        ) : (
          <>
            {summary && problemRows.length > 0 && (
              <div className="notice">
                <Icon name="info" />
                <span>
                  <b>계약금액과 Invoice 청구액이 일치하지 않습니다.</b> 총 차액 {summary.totalDiff >= 0 ? '+' : ''}${summary.totalDiff.toLocaleString()} — 아래 항목별 비교에서 원인을 확인하세요.
                </span>
              </div>
            )}

            <section className="card settlement-info">
              <h3>정산정보</h3>
              <dl>
                <div>
                  <dt>Case</dt>
                  <dd>{item.caseNumber}</dd>
                </div>
                <div>
                  <dt>화주</dt>
                  <dd>{item.shipperName}</dd>
                </div>
                <div>
                  <dt>노선</dt>
                  <dd>{item.route}</dd>
                </div>
                <div>
                  <dt>운송인</dt>
                  <dd>코레일</dd>
                </div>
              </dl>
            </section>

            {summary && (
              <>
                <section className="card cost-table">
                  <table>
                    <thead>
                      <tr>
                        <th>항목</th>
                        <th>계약금액</th>
                        <th>Invoice</th>
                        <th>차액</th>
                        <th>판정</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.comparison.map((r, i) => (
                        <tr key={i}>
                          <td>{r.stageName ?? r.description}</td>
                          <td>{r.contractAmount !== undefined ? `$${r.contractAmount.toLocaleString()}` : '-'}</td>
                          <td>{r.invoiceAmount !== undefined ? `$${r.invoiceAmount.toLocaleString()}` : '-'}</td>
                          <td>{r.diff !== undefined ? `${r.diff > 0 ? '+' : ''}$${r.diff.toLocaleString()}` : '-'}</td>
                          <td>
                            <Badge tone={CATEGORY_TONE[r.category]}>{MATCH_CATEGORY_LABEL[r.category]}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <footer>
                    <span>
                      Invoice 총액 vs 계약금액 ${summary.contractTotal.toLocaleString()}
                      <small>완전일치 기준 — 허용오차 없음</small>
                    </span>
                    <b style={{ color: summary.totalDiff !== 0 ? '#c84449' : '#207c56' }}>
                      ${summary.invoiceTotal.toLocaleString()} ({summary.totalDiff >= 0 ? '+' : ''}${summary.totalDiff.toLocaleString()})
                    </b>
                  </footer>
                </section>

                <section className="card table-card">
                  <div className="table-summary">
                    <b>Invoice 라인아이템</b>
                    <span>편집 가능</span>
                    <button onClick={addLine}>항목 추가</button>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>항목</th>
                        <th>금액(USD)</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.id}>
                          <td>{l.description}</td>
                          <td>
                            <input
                              type="number"
                              value={l.amount}
                              onChange={(e) => updateLine(l.id, Number(e.target.value))}
                              style={{ width: 100, border: '1px solid #dce2e9', borderRadius: 6, padding: '4px 6px', textAlign: 'right' }}
                            />
                          </td>
                          <td>
                            <button onClick={() => removeLine(l.id)} style={{ color: '#a2acbb', fontSize: 9 }}>
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </>
            )}

            <section className="card tax-invoice">
              <div className="card-head">
                <div>
                  <span className="section-kicker">TAX INVOICE</span>
                  <h3>세금계산서</h3>
                </div>
                {item.taxInvoices && item.taxInvoices.length > 0 && <Badge tone="green">발행 완료</Badge>}
              </div>
              {(!item.taxInvoices || item.taxInvoices.length === 0) && (
                <div className="tax-invoice-empty">
                  <p>정산 대조 결과를 기준으로 세금계산서를 자동 생성합니다.</p>
                  <button className="primary" onClick={handleGenerateTaxInvoice}>
                    <Icon name="spark" /> 세금계산서 발행
                  </button>
                </div>
              )}
              {(item.taxInvoices ?? []).map((tax) => (
                <dl className="tax-invoice-fields" key={tax.id}>
                  <div>
                    <dt>작성일자</dt>
                    <dd>{tax.issuedDate}</dd>
                  </div>
                  <div>
                    <dt>공급자</dt>
                    <dd>{tax.supplierBusinessNumber}</dd>
                  </div>
                  <div>
                    <dt>공급받는자</dt>
                    <dd>{tax.customerBusinessNumber}</dd>
                  </div>
                  <div>
                    <dt>품목</dt>
                    <dd>{tax.item}</dd>
                  </div>
                  <div>
                    <dt>과세유형</dt>
                    <dd>
                      영세율<small className="tax-type-hint"> · 국제운송용역 기준(실제 적용은 세무 담당자 확인 필요)</small>
                    </dd>
                  </div>
                  <div>
                    <dt>공급가액</dt>
                    <dd>${tax.supplyAmount.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>세액</dt>
                    <dd>${tax.vatAmount.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>합계금액</dt>
                    <dd>
                      <b>${tax.totalAmount.toLocaleString()}</b>
                    </dd>
                  </div>
                </dl>
              ))}
              <small className="hint">실제 국세청 홈택스 연동이 아닌 데모용 시뮬레이션입니다.</small>
            </section>

            <section className="card dispute-chat">
              <div className="card-head">
                <div>
                  <span className="section-kicker">SETTLEMENT ASSISTANT</span>
                  <h3>정산 도우미</h3>
                </div>
              </div>
              <div className="chat-log">
                {(item.disputeMessages ?? []).length === 0 && (
                  <div className="chat-msg bot">정산 결과에 대해 궁금한 점을 물어보세요. (예: &quot;왜 이렇게 비싸요?&quot;, &quot;차액이 얼마예요?&quot;)</div>
                )}
                {(item.disputeMessages ?? []).map((m) => (
                  <div key={m.id} className={`chat-msg ${m.role === 'user' ? 'user' : 'bot'}`}>
                    {m.text}
                  </div>
                ))}
                {chatSending && <div className="chat-msg bot">답변 작성 중…</div>}
              </div>
              <div className="chat-input">
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="질문을 입력하세요" />
                <button onClick={handleSend} disabled={chatSending}>
                  <Icon name="arrow" />
                </button>
              </div>
              <small className="hint">이 Case의 정산 차액을 바탕으로 답합니다. 견적·계약·문서 전반은 우측 하단 KORAIL LINK 도우미에게 물어보세요.</small>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
