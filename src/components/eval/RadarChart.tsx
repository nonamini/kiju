/**
 * 5-Axis Radar Chart SVG Component.
 * Visualizes 5 skills (opening, midgame, endgame, stability, tactics) on a 0-100 normalized pentagon.
 * Follows Rule 1: strictly English code, comments, and identifiers.
 */

import React from 'react';
import { RadarChartScores } from '../../types/evaluation';

export interface RadarChartProps {
  scores: RadarChartScores;
  labels?: {
    opening: string;
    midgame: string;
    endgame: string;
    stability: string;
    tactics: string;
  };
  size?: number; // width/height in px
  color?: string; // polygon accent color
  className?: string;
}

export const RadarChart: React.FC<RadarChartProps> = ({
  scores,
  labels = {
    opening: '序盤力',
    midgame: '中盤力',
    endgame: '終盤力',
    stability: '安定度',
    tactics: '勝負強さ',
  },
  size = 260,
  color = '#f59e0b', // Amber-500
  className = '',
}) => {
  const center = size / 2;
  const radius = center * 0.65;
  const numAxes = 5;

  // Angles: top = -90 deg (-pi/2)
  // 5 axes: opening(0), midgame(1), endgame(2), stability(3), tactics(4)
  const axisAngles = Array.from({ length: numAxes }, (_, i) => {
    return -Math.PI / 2 + (i * 2 * Math.PI) / numAxes;
  });

  // Helper to calculate coordinates from score (0-100) and angle
  const getCoordinates = (score: number, angle: number): [number, number] => {
    const clamped = Math.max(0, Math.min(100, score));
    const dist = (clamped / 100) * radius;
    const x = center + dist * Math.cos(angle);
    const y = center + dist * Math.sin(angle);
    return [x, y];
  };

  const scoreValues = [
    scores.opening,
    scores.midgame,
    scores.endgame,
    scores.stability,
    scores.tactics,
  ];

  const scoreLabels = [
    { key: 'opening', text: labels.opening, val: scores.opening },
    { key: 'midgame', text: labels.midgame, val: scores.midgame },
    { key: 'endgame', text: labels.endgame, val: scores.endgame },
    { key: 'stability', text: labels.stability, val: scores.stability },
    { key: 'tactics', text: labels.tactics, val: scores.tactics },
  ];

  // Polygon points string
  const polygonPoints = scoreValues
    .map((val, idx) => {
      const [x, y] = getCoordinates(val, axisAngles[idx]!);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  // Grid levels (20, 40, 60, 80, 100)
  const gridLevels = [25, 50, 75, 100];

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
      >
        {/* Background Grid Rings */}
        {gridLevels.map((lvl) => {
          const gridPoints = axisAngles
            .map((angle) => {
              const [x, y] = getCoordinates(lvl, angle);
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');

          return (
            <polygon
              key={lvl}
              points={gridPoints}
              fill={lvl === 100 ? '#0f172a' : 'transparent'}
              stroke="#334155"
              strokeWidth={lvl === 100 ? '1.5' : '0.8'}
              strokeDasharray={lvl === 100 ? undefined : '2,2'}
            />
          );
        })}

        {/* Axis Spokes from Center */}
        {axisAngles.map((angle, idx) => {
          const [x, y] = getCoordinates(100, angle);
          return (
            <line
              key={idx}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="#475569"
              strokeWidth="1"
            />
          );
        })}

        {/* Data Area Fill and Stroke */}
        <polygon
          points={polygonPoints}
          fill={color}
          fillOpacity="0.25"
          stroke={color}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        {/* Data Points (Dots on vertices) */}
        {scoreValues.map((val, idx) => {
          const [x, y] = getCoordinates(val, axisAngles[idx]!);
          return (
            <circle
              key={idx}
              cx={x}
              cy={y}
              r="4"
              fill={color}
              stroke="#0f172a"
              strokeWidth="1.5"
            />
          );
        })}

        {/* Outer Axis Labels */}
        {scoreLabels.map((item, idx) => {
          const angle = axisAngles[idx]!;
          // Place label slightly outside radius
          const labelDist = radius + 24;
          const lx = center + labelDist * Math.cos(angle);
          const ly = center + labelDist * Math.sin(angle);

          // Horizontal alignment based on cos(angle)
          let textAnchor: 'middle' | 'start' | 'end' = 'middle';
          if (Math.cos(angle) > 0.3) textAnchor = 'start';
          else if (Math.cos(angle) < -0.3) textAnchor = 'end';

          return (
            <g key={item.key}>
              <text
                x={lx}
                y={ly - 4}
                textAnchor={textAnchor}
                className="fill-slate-300 text-[11px] font-bold select-none"
              >
                {item.text}
              </text>
              <text
                x={lx}
                y={ly + 10}
                textAnchor={textAnchor}
                className="fill-amber-400 font-mono text-[11px] font-extrabold select-none"
              >
                {item.val}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
