import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseKif } from '../src/utils/kifParser';
import { classifyOpening } from '../src/utils/openingClassifier';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/sample_kifs');

describe('classifyOpening unit tests', () => {
  it('classifies Kakugawari from sample_kakugawari_eval.kif', () => {
    const buffer = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_kakugawari_eval.kif'));
    const parsed = parseKif(buffer);
    const category = classifyOpening(parsed.moves, parsed.game.openingId);

    expect(category.id).toBe('kakugawari');
  });

  it('classifies Shikenbisha from sample_shikenbisha_mate.kif (Gote plays 4二飛)', () => {
    const buffer = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_shikenbisha_mate.kif'));
    const parsed = parseKif(buffer);
    const category = classifyOpening(parsed.moves);

    expect(category.id).toBe('shikenbisha');
  });

  it('classifies Aigakari / Ibisha from sample_aigakari_plain.kif', () => {
    const buffer = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_aigakari_plain.kif'));
    const parsed = parseKif(buffer);
    const category = classifyOpening(parsed.moves);

    expect(['aigakari', 'ibisha_other']).toContain(category.id);
  });
});
