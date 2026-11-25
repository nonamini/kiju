import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { BatchAnalysisModal } from '../src/components/eval/BatchAnalysisModal';
import { EvaluationChart } from '../src/components/eval/EvaluationChart';
import { mockTree } from '../src/mock/mockData';
import '../src/locales/i18n';

describe('BatchAnalysisModal & EvaluationChart integration tests', () => {
  it('does not render when isOpen is false', () => {
    const html = renderToString(
      <BatchAnalysisModal
        isOpen={false}
        onClose={() => {}}
        isAnalyzing={false}
        progress={null}
        tree={mockTree}
        activePath={[]}
        onStartAnalysis={async () => {}}
        onCancelAnalysis={() => {}}
      />
    );
    expect(html).toBe('');
  });

  it('renders modal with scope, movetime options, and triggers when isOpen is true', () => {
    const html = renderToString(
      <BatchAnalysisModal
        isOpen={true}
        onClose={() => {}}
        isAnalyzing={false}
        progress={null}
        tree={mockTree}
        activePath={[mockTree.rootNodes[0]!]}
        onStartAnalysis={async () => {}}
        onCancelAnalysis={() => {}}
      />
    );
    expect(html).toContain('AI局面一括解析');
    expect(html).toContain('現在の棋譜手順');
    expect(html).toContain('定跡ツリー全体');
    expect(html).toContain('一括解析');
  });

  it('renders progress bar and live evaluation score while analyzing', () => {
    const html = renderToString(
      <BatchAnalysisModal
        isOpen={true}
        onClose={() => {}}
        isAnalyzing={true}
        progress={{
          analyzedCount: 5,
          totalCount: 10,
          skippedCount: 0,
          percent: 50,
          currentNodeId: 'node-5',
          currentMoveKif: '▲２五歩(26)',
          currentPly: 5,
          evaluation: {
            scoreCp: 120,
            depth: 14,
            bestMove: '3c3d',
            bestMoveKif: '△３四歩(33)',
            evaluatedAt: '2026-10-15T12:00:00Z',
          },
        }}
        tree={mockTree}
        activePath={[]}
        onStartAnalysis={async () => {}}
        onCancelAnalysis={() => {}}
      />
    );
    expect(html).toContain('50%');
    expect(html).toContain('▲２五歩(26)');
    expect(html).toContain('+120');
    expect(html).toContain('△３四歩(33)');
    expect(html).toContain('解析中断');
  });

  it('renders EvaluationChart with analysis trigger buttons and AI recommended move badge', () => {
    const html = renderToString(
      <EvaluationChart
        evaluations={[
          {
            ply: 1,
            scoreCp: 55,
            rawScoreCp: 55,
            moveText: '▲７六歩',
            depth: 18,
            bestMove: '8c8d',
            bestMoveKif: '△８四歩(83)',
          },
        ]}
        currentPly={1}
        onSelectPly={() => {}}
        onOpenBatchAnalysis={() => {}}
        onAnalyzeCurrentPosition={() => {}}
        isAnalyzing={false}
      />
    );
    expect(html).toContain('一括解析');
    expect(html).toContain('この局面をAI解析');
    expect(html).toContain('△８四歩(83)');
  });
});
