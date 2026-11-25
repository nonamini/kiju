import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseKif } from '../src/utils/kifParser';
import { INITIAL_HIRATE_SFEN, ShogiBoard } from '../src/utils/shogiBoard';
import { mergeGamesIntoTree } from '../src/utils/treeMerger';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/sample_kifs');

describe('ShogiBoard unit tests', () => {
  it('initializes to standard Hirate SFEN', () => {
    const board = new ShogiBoard();
    expect(board.toSfen()).toBe(INITIAL_HIRATE_SFEN);
  });

  it('updates board state and SFEN after 7g7f', () => {
    const board = new ShogiBoard();
    const move = {
      ply: 1,
      color: 'b' as const,
      from: { file: 7, rank: 7 },
      to: { file: 7, rank: 6 },
      piece: 'FU' as const,
      isDrop: false,
      kifString: '７六歩(77)',
      sfenMove: '7g7f',
    };
    board.applyMove(move);

    expect(board.getSquare(7, 7)).toBeNull();
    expect(board.getSquare(7, 6)).toBe('P');
    expect(board.toSfen()).toBe('lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2');
  });

  it('handles piece captures and promotions', () => {
    const board = new ShogiBoard();
    // 1. 7g7f
    board.applyMove({ ply: 1, color: 'b', from: { file: 7, rank: 7 }, to: { file: 7, rank: 6 }, piece: 'FU', isDrop: false, kifString: '7g7f', sfenMove: '7g7f' });
    // 2. 3c3d
    board.applyMove({ ply: 2, color: 'w', from: { file: 3, rank: 3 }, to: { file: 3, rank: 4 }, piece: 'FU', isDrop: false, kifString: '3c3d', sfenMove: '3c3d' });
    // 3. 8h2b+ (Bishop captures 2b bishop and promotes to Horse)
    board.applyMove({ ply: 3, color: 'b', from: { file: 8, rank: 8 }, to: { file: 2, rank: 2 }, piece: 'KA', promote: true, isDrop: false, kifString: '8h2b+', sfenMove: '8h2b+' });

    // Sente now holds captured Bishop 'B' in hand
    expect(board.getSquare(2, 2)).toBe('+B');
    expect(board.getSquare(8, 8)).toBeNull();
    const sfen = board.toSfen();
    expect(sfen).toContain(' B ');
  });
});

describe('mergeGamesIntoTree unit tests', () => {
  const plainKif = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_aigakari_plain.kif'));
  const shikenKif = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_shikenbisha_mate.kif'));
  const kakuKif = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_kakugawari_eval.kif'));
  const branchKif = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_branches.kif'));

  it('merges 2 games sharing move 1 (2g2f) and accumulates stats', () => {
    const plain = parseKif(plainKif);
    const shiken = parseKif(shikenKif);

    const tree = mergeGamesIntoTree([plain, shiken], {
      openingId: 'ibisha',
      openingName: 'Rook Opening',
    });

    expect(tree.totalGames).toBe(2);
    expect(tree.openingId).toBe('ibisha');
    expect(tree.rootNodes.length).toBe(1);

    const move1 = tree.rootNodes[0];
    expect(move1?.move.sfenMove).toBe('2g2f');
    expect(move1?.gameCount).toBe(2);
    expect(move1?.isMainline).toBe(true);
    expect(move1?.gameRefs.length).toBe(2);
    expect(move1?.comment).toContain('Games: 2');
  });

  it('correctly branches and marks highest adoption as mainline when merging diverse games', () => {
    const plain = parseKif(plainKif); // starts with 2g2f
    const shiken = parseKif(shikenKif); // starts with 2g2f
    const kaku = parseKif(kakuKif); // starts with 7g7f

    const tree = mergeGamesIntoTree([plain, shiken, kaku]);

    expect(tree.totalGames).toBe(3);
    // Root should have 2 candidates: 2g2f (count: 2) and 7g7f (count: 1)
    expect(tree.rootNodes.length).toBe(2);

    const candidate1 = tree.rootNodes[0];
    const candidate2 = tree.rootNodes[1];

    expect(candidate1?.move.sfenMove).toBe('2g2f');
    expect(candidate1?.gameCount).toBe(2);
    expect(candidate1?.isMainline).toBe(true);

    expect(candidate2?.move.sfenMove).toBe('7g7f');
    expect(candidate2?.gameCount).toBe(1);
    expect(candidate2?.isMainline).toBe(false);
  });

  it('preserves attached evaluations and aggregates win/loss results', () => {
    const shiken = parseKif(shikenKif); // Gote checkmated Sente
    const kaku = parseKif(kakuKif); // Sente won

    const tree = mergeGamesIntoTree([shiken, kaku]);

    // Kakugawari root node (7g7f) should have Sente win
    const kakuRoot = tree.rootNodes.find((n) => n.move.sfenMove === '7g7f');
    expect(kakuRoot).toBeDefined();
    expect(kakuRoot?.wins.sente).toBe(1);
    expect(kakuRoot?.wins.gote).toBe(0);

    // Node with evaluation retains evaluation data
    const shikenMove7 = tree.rootNodes[0]?.children[0]?.children[0]?.children[0]?.children[0]?.children[0]?.children[0];
    expect(shikenMove7?.evaluation).toBeDefined();
  });

  it('merges internal variation blocks from multi-branch KIF file', () => {
    const parsedBranch = parseKif(branchKif);
    const tree = mergeGamesIntoTree([parsedBranch]);

    expect(tree.totalGames).toBe(1);
    expect(tree.rootNodes.length).toBeGreaterThan(0);

    // At junction plies with variations, children count should be > 1
    let foundBranch = false;
    function checkBranches(nodes: typeof tree.rootNodes) {
      for (const n of nodes) {
        if (n.children.length > 1) {
          foundBranch = true;
          expect(n.children[0]?.isMainline).toBe(true);
          expect(n.children[1]?.isMainline).toBe(false);
          return;
        }
        checkBranches(n.children);
      }
    }
    checkBranches(tree.rootNodes);

    expect(foundBranch).toBe(true);
  }, 15000);
});
