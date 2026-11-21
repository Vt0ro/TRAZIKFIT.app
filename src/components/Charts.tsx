import { useId, useState } from 'react';
import { fmt } from '../lib/metrics';

interface BarChartProps {
  vals: number[];
  labels: string[];
  height?: number;
}

export function BarChart({ vals, labels, height = 136 }: BarChartProps) {
  const gradId = useId();
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const mx = Math.max(...vals, 1);
  const w = Math.max(vals.length * 40, 300);
  const bw = Math.min(28, w / Math.max(1, vals.length) - 8);

  return (
    <svg viewBox={`0 0 ${w} ${height + 26}`} className="w-full max-h-[220px] select-none overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ac2)" />
          <stop offset="100%" stopColor="var(--ac)" stopOpacity="0.45" />
        </linearGradient>
      </defs>

      {/* Subtle baseline & mid reference hairlines */}
      <line x1={0} y1={height} x2={w} y2={height} stroke="var(--line)" strokeWidth="1" />
      <line
        x1={0}
        y1={Math.round(height * 0.5)}
        x2={w}
        y2={Math.round(height * 0.5)}
        stroke="var(--line)"
        strokeWidth="1"
        strokeDasharray="3 4"
        opacity="0.55"
      />

      {vals.map((v, i) => {
        const bh = (v / mx) * (height - 22);
        const x = ((i + 0.5) * w) / Math.max(1, vals.length);
        const isActive = activeIdx === i;
        return (
          <g
            key={`${labels[i]}-${i}`}
            onMouseEnter={() => setActiveIdx(i)}
            onMouseLeave={() => setActiveIdx(null)}
            onClick={() => setActiveIdx((cur) => (cur === i ? null : i))}
            className="cursor-pointer"
          >
            <rect
              x={x - bw / 2 - 4}
              y={0}
              width={bw + 8}
              height={height + 24}
              fill="transparent"
            />
            <rect
              x={x - bw / 2}
              y={height - bh}
              width={bw}
              height={Math.max(v > 0 ? 4 : 0, bh)}
              rx={6}
              fill={`url(#${gradId})`}
              opacity={activeIdx !== null && !isActive ? 0.55 : 1}
              style={{
                transition: 'y 0.32s cubic-bezier(0.16, 1, 0.3, 1), height 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.18s ease',
              }}
            />
            {v > 0 && (
              <text
                x={x}
                y={Math.max(11, height - bh - 6)}
                textAnchor="middle"
                fill={isActive ? 'var(--tx)' : 'var(--mut)'}
                fontSize={isActive ? '11' : '10'}
                fontWeight={isActive ? '700' : '500'}
                className="tabular-nums"
              >
                {fmt(v)}
              </text>
            )}
            <text
              x={x}
              y={height + 16}
              textAnchor="middle"
              fill={isActive ? 'var(--ac2)' : 'var(--mut)'}
              fontSize="10"
              fontWeight={isActive ? '700' : '500'}
            >
              {labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

interface LineChartProps {
  values: number[];
  labels: string[];
}

export function LineChart({ values, labels }: LineChartProps) {
  const areaGradId = useId();
  if (values.length < 2) return null;
  const W = 320;
  const H = 128;
  const p = 18;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const rg = mx - mn || 1;
  const X = (i: number) => p + (i * (W - 2 * p)) / (values.length - 1);
  const Y = (y: number) => H - 24 - ((y - mn) / rg) * (H - 46);
  const pts = values.map((y, i) => `${X(i)},${Y(y)}`).join(' ');
  const areaPts = `${X(0)},${H - 22} ${pts} ${X(values.length - 1)},${H - 22}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none">
      <defs>
        <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ac2)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--ac)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill={`url(#${areaGradId})`} points={areaPts} />
      <polyline
        fill="none"
        stroke="var(--ac2)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
      {values.map((y, i) => (
        <circle
          key={i}
          cx={X(i)}
          cy={Y(y)}
          r={i === values.length - 1 ? 4.5 : 3}
          fill={i === values.length - 1 ? 'var(--tx)' : 'var(--ac2)'}
          stroke="var(--ac)"
          strokeWidth={i === values.length - 1 ? '2' : '0'}
        />
      ))}
      <text x={p} y={H - 5} textAnchor="start" fill="var(--mut)" fontSize="10" className="tabular-nums">
        {labels[0]}
      </text>
      <text x={W - p} y={H - 5} textAnchor="end" fill="var(--mut)" fontSize="10" className="tabular-nums">
        {labels[labels.length - 1]}
      </text>
      <text x={p} y={12} textAnchor="start" fill="var(--mut)" fontSize="10" className="tabular-nums">
        máx {fmt(mx)} kg
      </text>
      <text x={W - p} y={12} textAnchor="end" fill="var(--mut)" fontSize="10" className="tabular-nums">
        mín {fmt(mn)} kg
      </text>
    </svg>
  );
}
