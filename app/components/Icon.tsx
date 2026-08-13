'use client';

const GLYPHS: Record<string, string> = {
  home: '⌂',
  case: '▤',
  search: '⌕',
  contract: '◇',
  bill: '▦',
  settings: '⚙',
  bell: '♢',
  plus: '＋',
  arrow: '→',
  check: '✓',
  info: 'i',
  spark: '✦',
  external: '↗',
  copy: '▣',
  download: '↓',
  print: '⌘',
  waybill: '⇄',
  bl: '⚓',
  time: '◷',
};

export function Icon({ name }: { name: string }) {
  return (
    <span className="icon" aria-hidden>
      {GLYPHS[name] ?? '•'}
    </span>
  );
}
