'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useCases } from '../../../../lib/state';
import type { CaseDocument, DocumentType, FieldChange } from '../../../../lib/types';
import { DOCUMENT_TYPE_LABEL } from '../../../../lib/types';
import { buildComparison, buildWaybillDraft, simulateExtraction, VERDICT_LABEL, CASE_FIELD_DEFS, type FieldVerdict } from '../../../../lib/documentEngine';
import { decideCaseFieldChange, updateDocumentExtractionResult, uploadCaseDocument } from '../../../../lib/supabase';
import { CaseHeader } from '../../../../components/CaseHeader';
import { CaseTabs } from '../../../../components/CaseTabs';
import { Badge } from '../../../../components/Badge';
import { Icon } from '../../../../components/Icon';

const DOC_TYPES: DocumentType[] = ['contract', 'packing_list', 'waybill', 'bl'];
const VERDICT_TONE: Record<FieldVerdict, 'green' | 'red' | 'amber'> = { match: 'green', mismatch: 'red', confirm_needed: 'amber' };

export default function CaseDocumentsPage() {
  const params = useParams<{ id: string }>();
  const { cases, setCasesAndPersist } = useCases();
  const item = cases.find((c) => c.id === params.id);
  const [pendingType, setPendingType] = useState<DocumentType | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWaybillDraft, setShowWaybillDraft] = useState(false);

  if (!item) {
    return (
      <div className="page">
        <p style={{ color: 'var(--muted)', fontSize: 12 }}>Case를 찾을 수 없습니다.</p>
      </div>
    );
  }

  const documents = item.documents ?? [];

  async function handleFileSelected(type: DocumentType, file: File) {
    setPendingType(type);
    setUploading(true);
    setError(null);
    const snapshot = simulateExtraction(type, item!.masterData);
    try {
      const uploaded = await uploadCaseDocument({ caseId: item!.id, documentType: type, file, extractionResult: { snapshot, resolutions: {} } });
      const doc: CaseDocument = { id: uploaded.id, documentType: type, fileName: file.name, uploadedAt: new Date().toISOString(), extractedSnapshot: snapshot, resolutions: {} };
      setCasesAndPersist((prev) => prev.map((c) => (c.id === item!.id ? { ...c, documents: [...(c.documents ?? []), doc] } : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : '문서 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
      setPendingType(null);
    }
  }

  function handleGenerateWaybillDraft() {
    const snapshot = simulateExtraction('waybill', item!.masterData);
    const doc: CaseDocument = {
      id: crypto.randomUUID(),
      documentType: 'waybill',
      fileName: 'AI 생성 초안',
      uploadedAt: new Date().toISOString(),
      extractedSnapshot: snapshot,
      resolutions: {},
    };
    setCasesAndPersist((prev) => prev.map((c) => (c.id === item!.id ? { ...c, documents: [...(c.documents ?? []), doc] } : c)));
    setShowWaybillDraft(true);
  }

  function resolveField(doc: CaseDocument, field: string, action: 'keep_current' | 'apply_document' | 'confirm_later') {
    const previousValue = (item!.masterData as unknown as Record<string, unknown>)[field];
    const proposedValue = doc.extractedSnapshot[field];
    void decideCaseFieldChange({
      caseId: item!.id,
      documentId: doc.id,
      fieldName: field,
      previousValue,
      proposedValue,
      decision: action === 'confirm_later' ? 'pending' : action,
    }).catch((err) => setError(err instanceof Error ? err.message : 'Could not save the field decision.'));
    setCasesAndPersist((prev) =>
      prev.map((c) => {
        if (c.id !== item!.id) return c;
        let masterData = c.masterData;
        if (action === 'apply_document') {
          const extractedValue = doc.extractedSnapshot[field];
          if (extractedValue !== null && extractedValue !== undefined) {
            const previous = (masterData as unknown as Record<string, unknown>)[field];
            const nextMasterData = { ...masterData } as unknown as Record<string, unknown>;
            nextMasterData[field] = field === 'containerCount' || field === 'totalWeightTon' ? Number(extractedValue) : extractedValue;
            const change: FieldChange = {
              id: crypto.randomUUID(),
              field,
              documentType: doc.documentType,
              fileName: doc.fileName,
              previousValue: String(previous),
              newValue: extractedValue,
              changedAt: new Date().toISOString(),
            };
            nextMasterData.changeHistory = [...masterData.changeHistory, change];
            masterData = nextMasterData as unknown as typeof masterData;
          }
        }
        const nextDocuments = (c.documents ?? []).map((d) => (d.id === doc.id ? { ...d, resolutions: { ...d.resolutions, [field]: action } } : d));
        return { ...c, masterData, documents: nextDocuments };
      })
    );
    void updateDocumentExtractionResult(doc.id, { snapshot: doc.extractedSnapshot, resolutions: { ...doc.resolutions, [field]: action } }).catch(() => {});
  }

  const waybillDraft = buildWaybillDraft(item.masterData);

  return (
    <div className="case-workspace">
      <CaseHeader item={item} />
      <CaseTabs caseId={item.id} />

      <div className="workspace-body">
        <div className="validation-title">
          <div>
            <span className="section-kicker">DOCUMENT PIPELINE</span>
            <h2>문서</h2>
            <p>계약서·Packing List·화물운송장·B/L을 업로드하면 AI가 정보를 추출해 이 운송 건의 데이터로 반영합니다. 실제 파일 내용은 읽지 않습니다.</p>
          </div>
        </div>

        <div className="notice">
          <Icon name="info" />
          <span>
            <b>AI 추출 결과 · 확인 필요.</b> 이미 등록된 정보와 다른 값이 나오면(표기 형식 차이 제외) 완전일치 기준으로 확인 필요 표시를 합니다.
          </span>
        </div>
        {error && <p style={{ color: '#c84449', fontSize: 11, marginBottom: 12 }}>{error}</p>}

        <div className="doc-grid">
          {DOC_TYPES.map((type) => {
            const typeDocs = documents.filter((d) => d.documentType === type);
            const inputId = `upload-${type}`;
            const isUploadingThis = uploading && pendingType === type;
            return (
              <section className="card doc-card" key={type}>
                <div className="doc-card-head">
                  <div>
                    <b>
                      <Icon name={type === 'bl' ? 'bl' : type === 'waybill' ? 'waybill' : 'copy'} /> {DOCUMENT_TYPE_LABEL[type]}
                    </b>
                    {typeDocs.length > 0 && <small>{typeDocs.length}건 업로드됨</small>}
                  </div>
                </div>

                {isUploadingThis && (
                  <div className="doc-loading">
                    <span className="spinner" />
                    AI가 문서에서 정보를 추출하고 있습니다...
                  </div>
                )}

                {typeDocs.length === 0 && !isUploadingThis && (
                  <div className="doc-idle">
                    {type === 'waybill' && (
                      <button type="button" className="primary doc-generate-btn" onClick={handleGenerateWaybillDraft}>
                        <Icon name="spark" /> AI로 초안 생성
                      </button>
                    )}
                    <label className={type === 'waybill' ? 'doc-upload doc-upload-secondary' : 'doc-upload'} htmlFor={inputId}>
                      <Icon name="plus" />
                      {type === 'waybill' ? '이미 작성된 문서가 있다면 업로드' : '파일 업로드'}
                      <input
                        id={inputId}
                        type="file"
                        hidden
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFileSelected(type, f);
                        }}
                      />
                    </label>
                    <small className="doc-format-note">PDF · JPG · PNG</small>
                  </div>
                )}

                {typeDocs.map((doc) => {
                  const rows = buildComparison(doc.documentType, item!.masterData, doc.extractedSnapshot);
                  return (
                    <div key={doc.id} style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <small style={{ color: 'var(--muted)' }}>{doc.fileName}</small>
                        <Badge tone={rows.some((r) => r.verdict !== 'match') ? 'red' : 'green'}>
                          {rows.some((r) => r.verdict !== 'match') ? '확인 필요' : '정보 반영됨'}
                        </Badge>
                      </div>
                      <table className="doc-fields">
                        <tbody>
                          {rows.map((row) => {
                            const resolvable = CASE_FIELD_DEFS.some((d) => d.field === row.field);
                            const resolution = doc.resolutions[row.field];
                            return (
                              <tr key={row.field} className={row.verdict === 'mismatch' ? 'mismatch' : ''}>
                                <td>{row.label}</td>
                                <td>{row.extractedValue ?? '확인 필요'}</td>
                                <td>
                                  <Badge tone={VERDICT_TONE[row.verdict]}>{VERDICT_LABEL[row.verdict]}</Badge>
                                </td>
                                <td>
                                  {row.verdict !== 'match' && resolvable ? (
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                      {(['keep_current', 'apply_document', 'confirm_later'] as const).map((action) => (
                                        <button
                                          key={action}
                                          onClick={() => resolveField(doc, row.field, action)}
                                          style={{
                                            fontSize: 9,
                                            padding: '3px 7px',
                                            borderRadius: 20,
                                            border: '1px solid var(--line)',
                                            background: resolution === action ? 'var(--navy)' : 'white',
                                            color: resolution === action ? 'white' : '#42698f',
                                          }}
                                        >
                                          {action === 'keep_current' ? '현재값 유지' : action === 'apply_document' ? '문서값 반영' : '보류'}
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>

        {showWaybillDraft && (
          <section className="card doc-card" style={{ marginTop: 14 }}>
            <div className="doc-card-head">
              <b>화물운송장 AI 초안 미리보기</b>
            </div>
            <table className="doc-fields">
              <tbody>
                {waybillDraft.fields.map((f) => (
                  <tr key={f.label} className={f.value === null ? 'mismatch' : ''}>
                    <td>{f.label}</td>
                    <td>{f.value ?? '추가 입력 필요'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="doc-checklist">
              <b>SMGS 필수 확인 항목</b>
              {waybillDraft.checklist.map((c) => (
                <div className="pass" key={c.title}>
                  <span>✓</span>
                  <div>
                    <b>{c.title}</b>
                    <small>{c.description}</small>
                  </div>
                </div>
              ))}
            </div>
            <button className="secondary" onClick={() => window.print()} style={{ marginTop: 10 }}>
              <Icon name="print" /> PDF 출력(데모)
            </button>
          </section>
        )}

        {documents.length > 0 && (
          <section className="card table-card" style={{ marginTop: 17 }}>
            <div className="table-summary">
              <b>문서 정합성</b>
              <span>같은 Case Master Data 필드를 문서별 추출값과 비교</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>필드</th>
                    <th>Case</th>
                    {documents.map((d) => (
                      <th key={d.id}>{DOCUMENT_TYPE_LABEL[d.documentType]}</th>
                    ))}
                    <th>판정</th>
                  </tr>
                </thead>
                <tbody>
                  {CASE_FIELD_DEFS.map((def) => {
                    const relevantDocs = documents.filter((d) => d.extractedSnapshot[def.field] !== undefined);
                    if (relevantDocs.length === 0) return null;
                    const verdicts = relevantDocs.map((d) => buildComparison(d.documentType, item!.masterData, d.extractedSnapshot).find((r) => r.field === def.field)!.verdict);
                    const overall: FieldVerdict = verdicts.includes('mismatch') ? 'mismatch' : verdicts.includes('confirm_needed') ? 'confirm_needed' : 'match';
                    return (
                      <tr key={def.field}>
                        <td>
                          <b>{def.label}</b>
                        </td>
                        <td>{item!.masterData[def.field as keyof typeof item.masterData] as string}</td>
                        {documents.map((d) => (
                          <td key={d.id}>{d.extractedSnapshot[def.field] ?? '확인 필요'}</td>
                        ))}
                        <td>
                          <Badge tone={VERDICT_TONE[overall]}>{VERDICT_LABEL[overall]}</Badge>
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
          <section className="card status-log" style={{ marginTop: 17 }}>
            <div className="card-head">
              <h2>변경이력</h2>
            </div>
            {item.masterData.changeHistory.map((h) => (
              <div key={h.id}>
                <span>✓</span>
                <b>
                  [{DOCUMENT_TYPE_LABEL[h.documentType as DocumentType] ?? h.documentType}·{h.fileName}] {h.field}: {h.previousValue} → {h.newValue}
                </b>
                <small>{new Date(h.changedAt).toLocaleString('ko-KR')}</small>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
