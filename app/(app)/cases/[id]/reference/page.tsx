'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useCases } from '../../../../lib/state';
import { newsArticles, type NewsCategory } from '../../../../lib/newsData';
import { CaseHeader } from '../../../../components/CaseHeader';
import { CaseTabs } from '../../../../components/CaseTabs';

const CATEGORIES: NewsCategory[] = ['TCR', '연운항', '환율', '유가', '통관', '규제', '지정학'];
const RELEVANCE = (index: number) => (index === 0 ? '높음' : index === 1 ? '보통' : '낮음');
const RELEVANCE_CLASS: Record<string, 'high' | 'medium' | 'low'> = { 높음: 'high', 보통: 'medium', 낮음: 'low' };

export default function CaseReferencePage() {
  const params = useParams<{ id: string }>();
  const { cases } = useCases();
  const item = cases.find((c) => c.id === params.id);
  const [filter, setFilter] = useState<'전체' | NewsCategory>('전체');

  if (!item) {
    return (
      <div className="page">
        <p style={{ color: 'var(--muted)', fontSize: 12 }}>Case를 찾을 수 없습니다.</p>
      </div>
    );
  }

  const visible = newsArticles.filter((n) => filter === '전체' || n.category === filter);

  return (
    <div className="case-workspace figma-case-detail">
      <CaseHeader item={item} />
      <CaseTabs caseId={item.id} />
      <div className="workspace-body">
        <div className="figma-reference-page">
          <div className="reference-toolbar">
            <div className="chips reference-chips">
              {(['전체', ...CATEGORIES] as const).map((x) => (
                <button key={x} className={filter === x ? 'active' : ''} onClick={() => setFilter(x)}>
                  {x}
                </button>
              ))}
            </div>
            <button type="button" className="reference-sort">
              관련도 순 ↕
            </button>
          </div>
          <div className="news-list">
            {visible.map((n, index) => {
              const level = RELEVANCE(index);
              return (
                <article className="card news-card" key={n.id}>
                  <div>
                    <span className={`reference-relevance ${RELEVANCE_CLASS[level]}`}>
                      <i />
                      {n.category} · {level === '높음' ? '관련도 높음' : level === '보통' ? '보통 관련도' : '낮은 관련도'}
                    </span>
                    <h3>{n.title}</h3>
                    <p>{n.summary}</p>
                    <small>{n.publishedAt}</small>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
