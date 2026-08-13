import { NextResponse } from 'next/server';
import { classifyRelevantNews } from '../../lib/newsKeywords';

export const runtime = 'nodejs';
export const revalidate = 600;

type NewsCategory = 'TCR' | '연운항' | '환율' | '유가' | '통관' | '규제' | '지정학';
type TranslationStatus = 'translated' | 'not_configured' | 'failed' | 'not_needed';
type TranslationReport = { status: TranslationStatus; message?: string };
type Article = { id: string; title: string; summary: string; url: string; source: string; publishedAt: string; category: NewsCategory };
type Feed = { name: string; url: string; international: boolean };

const FEEDS: Feed[] = [
  { name: 'gCaptain', url: 'https://gcaptain.com/feed/', international: true },
  { name: 'Splash247', url: 'https://splash247.com/feed/', international: true },
  { name: 'FreightWaves', url: 'https://www.freightwaves.com/news/feed', international: true },
  { name: 'Maritime Executive', url: 'https://www.maritime-executive.com/rss/news', international: true },
];

const CACHE_MS = 10 * 60 * 1000;
let cache: { expiresAt: number; articles: Article[]; translation: TranslationReport } | null = null;

function decode(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code))).replace(/&#x([\da-f]+);/gi, (_m, code) => String.fromCodePoint(parseInt(code, 16))).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

function tag(xml: string, name: string) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? decode(match[1]) : '';
}

function parseFeed(xml: string, feed: Feed): Article[] {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0, 4).flatMap((match, index) => {
    const item = match[1];
    const title = tag(item, 'title');
    const url = tag(item, 'link');
    if (!title || !url) return [];
    const published = new Date(tag(item, 'pubDate') || tag(item, 'published'));
    const summary = tag(item, 'description').slice(0, 500);
    const category = classifyRelevantNews(`${title} ${summary}`);
    if (!category) return [];
    return [{
      id: `rss-${feed.name}-${index}-${url}`,
      title,
      summary,
      url,
      source: feed.name,
      publishedAt: Number.isNaN(published.getTime()) ? new Date().toISOString() : published.toISOString(),
      category,
    }];
  });
}

async function fetchRss(feed: Feed) {
  try {
    const response = await fetch(feed.url, { headers: { 'User-Agent': 'KORAIL-LINK/1.0 (+news dashboard)' }, next: { revalidate: 600 } });
    if (!response.ok) return [];
    return parseFeed(await response.text(), feed);
  } catch {
    return [];
  }
}

async function fetchNaver(): Promise<Article[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];
  try {
    const response = await fetch(`https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent('국제 물류 철도 해운')}&display=10&sort=date`, {
      headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret }, next: { revalidate: 600 },
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { items?: Array<{ title: string; description: string; originallink: string; link: string; pubDate: string }> };
    return (body.items ?? []).flatMap((item, index) => {
      const title = decode(item.title);
      const summary = decode(item.description);
      const category = classifyRelevantNews(`${title} ${summary}`);
      if (!category) return [];
      return [{
      id: `naver-${index}-${item.originallink || item.link}`,
      title, summary, url: item.originallink || item.link,
      source: 'Naver News', publishedAt: new Date(item.pubDate).toISOString(), category,
    }];
    });
  } catch { return []; }
}

async function translateInternational(articles: Article[]): Promise<{ articles: Article[]; report: TranslationReport }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (articles.length === 0) return { articles, report: { status: 'not_needed' } };
  if (!apiKey) return { articles, report: { status: 'not_configured', message: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' } };
  try {
    const payload = articles.map((article, index) => ({ index, title: article.title, summary: article.summary }));
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001', max_tokens: 2000, temperature: 0, system: 'Translate each English news title and summary into concise natural Korean. Return JSON only: {"items":[{"index":0,"title":"...","summary":"..."}]}. Do not translate names, figures, or URLs.', messages: [
        { role: 'user', content: JSON.stringify(payload) },
      ] }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 240);
      return { articles, report: { status: 'failed', message: `Claude 번역 요청 실패 (${response.status}): ${detail}` } };
    }
    const body = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
    const content = body.content?.find((block) => block.type === 'text')?.text ?? '';
    const json = content.match(/\{[\s\S]*\}/)?.[0] ?? '{}';
    const translated = JSON.parse(json) as { items?: Array<{ index: number; title: string; summary: string }> };
    if (!translated.items?.length) return { articles, report: { status: 'failed', message: 'Claude 응답에 번역 항목이 없습니다.' } };
    for (const item of translated.items ?? []) {
      if (articles[item.index]) articles[item.index] = { ...articles[item.index], title: item.title || articles[item.index].title, summary: item.summary || articles[item.index].summary };
    }
    return { articles, report: { status: 'translated' } };
  } catch (error) {
    return { articles, report: { status: 'failed', message: error instanceof Error ? error.message : '번역 응답을 처리하지 못했습니다.' } };
  }
}

export async function GET(request: Request) {
  const refresh = new URL(request.url).searchParams.get('refresh') === '1';
  if (!refresh && cache && cache.expiresAt > Date.now()) return NextResponse.json({ articles: cache.articles, translation: cache.translation, cached: true });
  const [rssLists, naver] = await Promise.all([Promise.all(FEEDS.map(fetchRss)), fetchNaver()]);
  const rss = rssLists.flat().sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 10);
  const { articles: translatedRss, report } = await translateInternational(rss);
  const articles = [...translatedRss, ...naver].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 12);
  cache = { expiresAt: Date.now() + CACHE_MS, articles, translation: report };
  return NextResponse.json({ articles, translation: report, cached: false });
}
