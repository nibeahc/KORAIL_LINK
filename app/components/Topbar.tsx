'use client';

import { detectAnomaly, SERIES } from '../lib/marketData';

export function Topbar({ collapsed, toggleNav }: { collapsed: boolean; toggleNav: () => void }) {
  const usdKrw = detectAnomaly(SERIES.usdKrw);
  const todayLabel = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  return (
    <header className="topbar">
      <div className="top-brand">
        <button type="button" aria-label={collapsed ? '사이드 메뉴 펼치기' : '사이드 메뉴 접기'} aria-expanded={!collapsed} onClick={toggleNav}>
          ☰
        </button>
        <img className="korail-logo" src="/korail-link-logo.svg" alt="KORAIL LINK" />
      </div>
      <div className="top-actions">
        <div className="fx">
          USD/KRW <b>{usdKrw.latest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>{' '}
          <span>
            {usdKrw.changePct >= 0 ? '+' : ''}
            {usdKrw.changePct.toFixed(1)}%
          </span>
        </div>
        <span className="date">{todayLabel}</span>
      </div>
    </header>
  );
}
