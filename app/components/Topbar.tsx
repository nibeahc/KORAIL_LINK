'use client';

import { detectAnomaly, SERIES } from '../lib/marketData';

export function Topbar() {
  const usdKrw = detectAnomaly(SERIES.usdKrw);
  const todayLabel = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  return (
    <header className="topbar">
      <div>
        <b>국제복합운송 견적 검증·업무지원</b>
        <span className="live">
          <i />
          시장 데이터 업데이트됨
        </span>
      </div>
      <div className="top-actions">
        <div className="fx">
          USD/KRW <b>{usdKrw.latest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>{' '}
          <span>
            {usdKrw.changePct >= 0 ? '+' : ''}
            {usdKrw.changePct.toFixed(1)}%
          </span>
        </div>
        <button className="circle" type="button" aria-label="알림">
          <span className="icon" aria-hidden>
            ♢
          </span>
          {usdKrw.isAnomaly && <i />}
        </button>
        <span className="date">{todayLabel}</span>
      </div>
    </header>
  );
}
