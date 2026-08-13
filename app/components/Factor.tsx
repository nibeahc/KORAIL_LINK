'use client';

import { Badge } from './Badge';
import { Icon } from './Icon';

export function Factor({
  icon,
  tone,
  title,
  value,
  label,
  desc,
  onClick,
}: {
  icon: string;
  tone: 'red' | 'amber';
  title: string;
  value: string;
  label: string;
  desc: string;
  onClick?: () => void;
}) {
  return (
    <section className="card factor">
      <div className="factor-top">
        <span className={`factor-icon ${tone}`}>{icon}</span>
        <Badge tone={tone}>{tone === 'red' ? '관련도 높음' : '관련도 보통'}</Badge>
      </div>
      <h3>{title}</h3>
      <div className="factor-value">
        <b>{value}</b>
        <span>{label}</span>
      </div>
      <p>{desc}</p>
      {onClick && (
        <button onClick={onClick}>
          근거 보기 <Icon name="external" />
        </button>
      )}
    </section>
  );
}
