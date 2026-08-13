'use client';

import { useMemo, useState } from 'react';
import { newsArticles, thisWeekBriefingNews, type NewsCategory } from '../../lib/newsData';

const CATEGORIES: NewsCategory[] = ['TCR', '연운항', '환율', '유가', '통관', '규제', '지정학'];

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<NewsCategory | 'all'>('all');
  const briefing = useMemo(() => thisWeekBriefingNews(6), []);

  const results = useMemo(() => {
    return newsArticles
      .filter((a) => (category === 'all' ? true : a.category === category))
      .filter((a) => (query.trim() ? a.title.includes(query) || a.summary.includes(query) : true))
      .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  }, [query, category]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-lg font-semibold text-neutral-900">정보 검색</h1>

      <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-medium text-neutral-700">이번 주 시황 브리핑</h2>
        <p className="mt-1 text-xs text-neutral-400">정책·화차공급·지정학 이슈를 우선 표시합니다.</p>
        <ul className="mt-3 divide-y divide-neutral-100">
          {briefing.map((n) => (
            <li key={n.id} className="py-2.5 text-sm">
              <span className="mr-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">{n.category}</span>
              <span className="text-neutral-800">{n.title}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="뉴스 검색어를 입력하세요"
            className="w-64 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          />
          <button
            onClick={() => setCategory('all')}
            className={`rounded-full px-3 py-1 text-xs ${category === 'all' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}
          >
            전체
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1 text-xs ${category === c ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}
            >
              {c}
            </button>
          ))}
        </div>

        <ul className="mt-4 space-y-3">
          {results.map((n) => (
            <li key={n.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <p className="text-xs text-neutral-400">
                {n.category} · {n.publishedAt}
              </p>
              <p className="mt-1 text-sm font-medium text-neutral-900">{n.title}</p>
              <p className="mt-1 text-sm text-neutral-500">{n.summary}</p>
            </li>
          ))}
          {results.length === 0 && <p className="text-sm text-neutral-400">검색 결과가 없습니다.</p>}
        </ul>
      </section>
    </main>
  );
}
