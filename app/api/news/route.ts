import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 600;

type NewsCategory = 'TCR' | '연운항' | '환율' | '유가' | '통관' | '규제' | '지정학';
type Article = { id: string; title: string; summary: string; url: string; source: string; publishedAt: string; category: NewsCategory };
type Feed = { name: string; url: string; international: boolean };

const FEEDS: Feed[] = [
  { name: 'gCaptain', url: 'https://gcaptain.com/feed/', international: true },
  { name: 'Splash247', url: 'https://splash247.com/feed/', international: true },
  { name: 'FreightWaves', url: 'https://www.freightwaves.com/news/feed', international: true },
  { name: 'Maritime Executive', url: 'https://www.maritime-executive.com/rss/news', international: true },
];

const CACHE_MS = 10 * 60 * 1000;
let cache: { expiresAt: number; articles: Article[] } | null = null;

function decode(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

function tag(xml: string, name: string) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? decode(match[1]) : '';
}

function categoryFor(text: string): NewsCategory {
  const value = text.toLowerCase();
  if (/brent|crude|oil|opec/.test(value)) return '유가';
  if (/customs|tariff|sanction|regulation/.test(value)) return '통관';
  if (/war|conflict|russia|ukraine|middle east/.test(value)) return '지정학';
  if (/exchange|currency|dollar|yuan/.test(value)) return '환율';
  if (/lianyungang|port congestion|port/.test(value)) return '연운항';
  return 'TCR';
}

function parseFeed(xml: string, feed: Feed): Article[] {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0, 4).flatMap((match, index) => {
    const item = match[1];
    const title = tag(item, 'title');
    const url = tag(item, 'link');
    if (!title || !url) return [];
    const published = new Date(tag(item, 'pubDate') || tag(item, 'published'));
    return [{
      id: `rss-${feed.name}-${index}-${url}`,
      title,
      summary: tag(item, 'description').slice(0, 500),
      url,
      source: feed.name,
      publishedAt: Number.isNaN(published.getTime()) ? new Date().toISOString() : published.toISOString(),
      category: categoryFor(`${title} ${tag(item, 'description')}`),
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
    return (body.items ?? []).map((item, index) => ({
      id: `naver-${index}-${item.originallink || item.link}`,
      title: decode(item.title), summary: decode(item.description), url: item.originallink || item.link,
      source: 'Naver News', publishedAt: new Date(item.pubDate).toISOString(), category: categoryFor(`${item.title} ${item.description}`),
    }));
  } catch { return []; }
}

async function translateInternational(articles: Article[]) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || articles.length === 0) return articles;
  try {
    const payload = articles.map((article, index) => ({ index, title: article.title, summary: article.summary }));
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENROUTER_MODEL ?? 'google/gemma-3-27b-it:free', response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: 'Translate each English news title and summary into concise natural Korean. Return JSON only: {"items":[{"index":0,"title":"...","summary":"..."}]}. Do not translate names, figures, or URLs.' },
        { role: 'user', content: JSON.stringify(payload) },
      ] }),
    });
    if (!response.ok) return articles;
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const translated = JSON.parse(body.choices?.[0]?.message?.content ?? '{}') as { items?: Array<{ index: number; title: string; summary: string }> };
    for (const item of translated.items ?? []) {
      if (articles[item.index]) articles[item.index] = { ...articles[item.index], title: item.title || articles[item.index].title, summary: item.summary || articles[item.index].summary };
    }
  } catch { /* Keep original text when translation is unavailable. */ }
  return articles;
}

export async function GET() {
  if (cache && cache.expiresAt > Date.now()) return NextResponse.json({ articles: cache.articles, cached: true });
  const [rssLists, naver] = await Promise.all([Promise.all(FEEDS.map(fetchRss)), fetchNaver()]);
  const rss = rssLists.flat().sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 10);
  const articles = [...(await translateInternational(rss)), ...naver].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 12);
  cache = { expiresAt: Date.now() + CACHE_MS, articles };
  return NextResponse.json({ articles, cached: false });
}
