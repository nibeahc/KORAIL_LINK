'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useCases } from '../../../../lib/state';
import type { CaseDocument, DocumentType, FieldChange } from '../../../../lib/types';
import { DOCUMENT_TYPE_LABEL } from '../../../../lib/types';
import {
  buildComparison,
  buildWaybillDraft,
  simulateExtraction,
  VERDICT_LABEL,
  CASE_FIELD_DEFS,
  type FieldVerdict,
} from '../../../../lib/documentEngine';

const DOC_TYPES: DocumentType[] = ['contract', 'packing_list', 'waybill', 'bl'];

const VERDICT_COLOR: Record<FieldVerdict, string> = {
  match: 'bg-green-100 text-green-700',
  mismatch: 'bg-red-100 text-red-700',
  confirm_needed: 'bg-amber-100 text-amber-700',
};

export default function CaseDocumentsPage() {
  const params = useParams<{ id: string }>();
  const { cases, setCasesAndPersist } = useCases();
  const item = cases.find((c) => c.id === params.id);
  const [selectedType, setSelectedType] = useState<DocumentType>('packing_list');
  const [fileName, setFileName] = useState('');
  const [showWaybillDraft, setShowWaybillDraft] = useState(false);

  if (!item) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-8">
        <p className="text-sm text-neutral-500">Case를 찾을 수 없습니다.</p>
      </main>
    );
  }

  const documents = item.documents ?? [];

  function handleUpload() {
    const name = fileName.trim() || `${DOCUMENT_TYPE_LABEL[selectedType]}.pdf`;
    const snapshot = simulateExtraction(selectedType, item!.masterData);
    const doc: CaseDocument = {
      id: crypto.randomUUID(),
      documentType: selectedType,
      fileName: name,
      uploadedAt: new Date().toISOString(),
      extractedSnapshot: snapshot,
      resolutions: {},
    };
    setCasesAndPersist((prev) => prev.map((c) => (c.id === item!.id ? { ...c, documents: [...(c.documents ?? []), doc] } : c)));
    setFileName('');
  }

  function handleGenerateWaybillDraft() {
    const snapshot = simulateExtraction('waybill', item!.masterData);
    const doc: CaseDocument = {
      id: crypto.randomUUID(),
      documentType: 'waybill',
      fileName: 'AI 초안 생성',
      uploadedAt: new Date().toISOString(),
      extractedSnapshot: snapshot,
      resolutions: {},
    };
    setCasesAndPersist((prev) => prev.map((c) => (c.id === item!.id ? { ...c, documents: [...(c.documents ?? []), doc] } : c)));
    setShowWaybillDraft(true);
  }

  function resolveField(doc: CaseDocument, field: string, action: 'keep_current' | 'apply_document' | 'confirm_later') {
    setCasesAndPersist((prev) =>
      prev.map((c) => {
        if (c.id !== item!.id) return c;

        let masterData = c.masterData;
        if (action === 'apply_document') {
          const extractedValue = doc.extractedSnapshot[field];
          if (extractedValue !== null && extractedValue !== undefined) {
            const previousValue = (masterData as unknown as Record<string, unknown>)[field];
            const nextMasterData = { ...masterData } as unknown as Record<string, unknown>;
            nextMasterData[field] = field === 'containerCount' || field === 'totalWeightTon' ? Number(extractedValue) : extractedValue;
            const change: FieldChange = {
              id: crypto.randomUUID(),
              field,
              documentType: doc.documentType,
              fileName: doc.fileName,
              previousValue: String(previousValue),
              newValue: extractedValue,
              changedAt: new Date().toISOString(),
            };
            nextMasterData.changeHistory = [...masterData.changeHistory, change];
            masterData = nextMasterData as unknown as typeof masterData;
          }
        }

        const nextDocuments = (c.documents ?? []).map((d) =>
          d.id === doc.id ? { ...d, resolutions: { ...d.resolutions, [field]: action } } : d
        );
        return { ...c, masterData, documents: nextDocuments };
      })
    );
  }

  const waybillDraft = buildWaybillDraft(item.masterData);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-lg font-semibold text-neutral-900">문서</h1>
      <p className="mt-1 text-sm text-neutral-500">
        업로드된 문서는 실제 내용을 읽지 않고, Case 정보를 바탕으로 추출한 것처럼 시뮬레이션합니다.
      </p>

      <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-medium text-neutral-700">문서 업로드</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as DocumentType)}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
          >
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')} className="text-sm" />
          <button onClick={handleUpload} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
            업로드
          </button>
        </div>
        {selectedType === 'waybill' && (
          <button onClick={handleGenerateWaybillDraft} className="mt-3 text-sm text-neutral-600 underline hover:text-neutral-900">
            또는 Case 정보로 화물운송장 AI 초안 생성
          </button>
        )}
      </section>

      {showWaybillDraft && (
        <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-medium text-neutral-700">화물운송장 AI 초안</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            {waybillDraft.fields.map((f) => (
              <div key={f.label}>
                <dt className="text-xs text-neutral-400">{f.label}</dt>
                <dd className={f.value === null ? 'text-amber-600' : 'text-neutral-900'}>{f.value ?? '추가 입력 필요'}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4">
            <p className="text-xs font-medium text-neutral-400">SMGS 필수 확인 항목</p>
            <ul className="mt-2 space-y-1 text-sm text-neutral-600">
              {waybillDraft.checklist.map((c) => (
                <li key={c.title}>
                  {c.title} — {c.description}
                </li>
              ))}
            </ul>
          </div>
          <button
            onClick={() => window.print()}
            className="mt-4 rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
          >
            PDF 출력(데모)
          </button>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-medium text-neutral-700">업로드된 문서</h2>
        <div className="mt-3 space-y-4">
          {documents.length === 0 && <p className="text-sm text-neutral-400">업로드된 문서가 없습니다.</p>}
          {documents.map((doc) => {
            const rows = buildComparison(doc.documentType, item!.masterData, doc.extractedSnapshot);
            return (
              <div key={doc.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-neutral-900">
                    {DOCUMENT_TYPE_LABEL[doc.documentType]} · {doc.fileName}
                  </p>
                  <span className="text-xs text-neutral-400">{new Date(doc.uploadedAt).toLocaleString('ko-KR')}</span>
                </div>
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-xs text-neutral-400">
                      <th className="py-2">필드</th>
                      <th className="py-2">Case 값</th>
                      <th className="py-2">추출값</th>
                      <th className="py-2">판정</th>
                      <th className="py-2">처리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const resolvable = CASE_FIELD_DEFS.some((d) => d.field === row.field);
                      const resolution = doc.resolutions[row.field];
                      return (
                        <tr key={row.field} className="border-b border-neutral-100 last:border-0">
                          <td className="py-2">{row.label}</td>
                          <td className="py-2 text-neutral-600">{row.caseValue ?? '—'}</td>
                          <td className="py-2 text-neutral-600">{row.extractedValue ?? '확인 필요'}</td>
                          <td className="py-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs ${VERDICT_COLOR[row.verdict]}`}>
                              {VERDICT_LABEL[row.verdict]}
                            </span>
                          </td>
                          <td className="py-2">
                            {row.verdict !== 'match' && resolvable ? (
                              <div className="flex gap-1">
                                {(['keep_current', 'apply_document', 'confirm_later'] as const).map((action) => (
                                  <button
                                    key={action}
                                    onClick={() => resolveField(doc, row.field, action)}
                                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                                      resolution === action ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
                                    }`}
                                  >
                                    {action === 'keep_current' ? '현재 값 유지' : action === 'apply_document' ? '문서 값 반영' : '확인 필요로 보류'}
                                  </button>
                                ))}
                              </div>
                            ) : row.verdict !== 'match' ? (
                              <span className="text-xs text-neutral-400">Case 필드 아님</span>
                            ) : (
                              <span className="text-xs text-neutral-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </section>

      {documents.length > 0 && (
        <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-medium text-neutral-700">문서 정합성</h2>
          <p className="mt-1 text-xs text-neutral-400">같은 Case Master Data 필드를 문서별 추출값과 한 화면에서 비교합니다.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-400">
                  <th className="py-2 pr-4">필드</th>
                  <th className="py-2 pr-4">Case</th>
                  {documents.map((d) => (
                    <th key={d.id} className="py-2 pr-4">
                      {DOCUMENT_TYPE_LABEL[d.documentType]}
                    </th>
                  ))}
                  <th className="py-2">판정</th>
                </tr>
              </thead>
              <tbody>
                {CASE_FIELD_DEFS.map((def) => {
                  const relevantDocs = documents.filter((d) => d.extractedSnapshot[def.field] !== undefined);
                  if (relevantDocs.length === 0) return null;
                  const verdicts = relevantDocs.map(
                    (d) => buildComparison(d.documentType, item!.masterData, d.extractedSnapshot).find((r) => r.field === def.field)!.verdict
                  );
                  const overall: FieldVerdict = verdicts.includes('mismatch')
                    ? 'mismatch'
                    : verdicts.includes('confirm_needed')
                      ? 'confirm_needed'
                      : 'match';
                  return (
                    <tr key={def.field} className="border-b border-neutral-100 last:border-0">
                      <td className="py-2 pr-4">{def.label}</td>
                      <td className="py-2 pr-4 text-neutral-600">{item!.masterData[def.field as keyof typeof item.masterData] as string}</td>
                      {documents.map((d) => (
                        <td key={d.id} className="py-2 pr-4 text-neutral-600">
                          {d.extractedSnapshot[def.field] ?? (d.extractedSnapshot[def.field] === undefined ? '—' : '확인 필요')}
                        </td>
                      ))}
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${VERDICT_COLOR[overall]}`}>{VERDICT_LABEL[overall]}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {item.masterData.changeHistory.length > 0 && (
        <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-medium text-neutral-700">변경이력</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {item.masterData.changeHistory.map((h) => (
              <li key={h.id} className="text-neutral-600">
                [{DOCUMENT_TYPE_LABEL[h.documentType as DocumentType] ?? h.documentType}·{h.fileName}] {h.field}: {h.previousValue} →{' '}
                <span className="font-medium text-neutral-900">{h.newValue}</span> ({new Date(h.changedAt).toLocaleString('ko-KR')})
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
