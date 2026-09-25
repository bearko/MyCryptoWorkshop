import { describe, expect, it } from 'vitest';
import { lands } from '../src/game/catalog';
import { relocate } from '../src/game/prestige';
import { buy, canBuy } from '../src/game/purchase';
import { newSave, parseSave } from '../src/game/save';
import { CLEAR_COST } from '../src/game/skills5';
import { isAvailable, skillById, unlockConditions } from '../src/game/skills';
import { computeStats } from '../src/game/stats';
import { atLandId, bestTitle, cryptidVisitBoost, G5_RANK, TITLE_RANKS, titleCode, titleCodeLabel, titleCount, titleId, VERSE_PASS } from '../src/game/titles';
import { submission } from '../src/net/leaderboard';
import { validate } from '../api/leaderboard';

/** A save that has cleared a run on `land` with plenty of GUM. */
function clearedOn(land: string) {
  const save = newSave(0);
  save.levels = { ...save.levels, titleHall: 1, goldenExtension: 1 };
  save.levels[atLandId(land)] = 1;
  save.gum = 1e16;
  return save;
}

describe('titles (称号)', () => {
  it('the golden extension costs 5,000億 GUM', () => {
    expect(CLEAR_COST).toBe(5e11);
  });

  it('nine lands × six titles, Commander to King', () => {
    expect(TITLE_RANKS.map((r) => r.key)).toEqual(['commander', 'knightCommander', 'knight', 'g5', 'maestro', 'king']);
    for (const land of lands) for (let r = 0; r < TITLE_RANKS.length; r++) expect(skillById.get(titleId(land.key, r))).toBeTruthy();
  });

  it('a land\'s titles are earned in order, only after clearing a run on that land', () => {
    const save = clearedOn('Ocean');
    const commander = skillById.get(titleId('Ocean', 0))!;
    expect(isAvailable(commander, save.levels)).toBe(true);
    expect(isAvailable(skillById.get(titleId('Ocean', 1))!, save.levels)).toBe(false);
    expect(isAvailable(skillById.get(titleId('Strawberry', 0))!, save.levels)).toBe(false);
    expect(unlockConditions(skillById.get(titleId('Strawberry', 0))!, save.levels).some((c) => !c.met && c.text.includes('Strawberry'))).toBe(true);
    const notCleared = { ...save.levels, goldenExtension: 0 };
    expect(isAvailable(commander, notCleared)).toBe(false);
    for (let r = 0; r < 3; r++) expect(buy(save, skillById.get(titleId('Ocean', r))!)).toBe(true);
    expect(titleCount(save.levels, 'Ocean')).toBe(3);
    expect(bestTitle(save.levels)).toEqual({ land: 'Ocean', rank: 2 });
  });

  it('titles strengthen the land\'s cryptid: its blessing, and sales while it visits', () => {
    const save = clearedOn('Ocean');
    const before = computeStats(save.levels).spawnInterval;
    buy(save, skillById.get(titleId('Ocean', 0))!);
    expect(computeStats(save.levels).spawnInterval).toBeLessThan(before);
    expect(cryptidVisitBoost(save.levels, 'Ocean')).toBeCloseTo(1.25);
    expect(cryptidVisitBoost(save.levels, 'Ruby')).toBe(1);
  });

  it('titles are kept when relocating; the new land\'s titles open after clearing there', () => {
    const save = clearedOn('Ocean');
    save.prestige.home = 'Ocean';
    buy(save, skillById.get(titleId('Ocean', 0))!);
    relocate(save, 'Strawberry');
    expect(save.levels[titleId('Ocean', 0)]).toBe(1);
    expect(save.levels.titleHall).toBe(1);
    expect(save.levels[atLandId('Strawberry')]).toBe(1);
    expect(save.levels[atLandId('Ocean')]).toBeUndefined();
    expect(isAvailable(skillById.get(titleId('Strawberry', 0))!, save.levels)).toBe(false);
    save.levels.goldenExtension = 1;
    expect(isAvailable(skillById.get(titleId('Strawberry', 0))!, save.levels)).toBe(true);
    // Loading an older save marks the land it is on.
    const raw = JSON.parse(JSON.stringify(save));
    delete raw.levels[atLandId('Strawberry')];
    expect(parseSave(JSON.stringify(raw)).levels[atLandId('Strawberry')]).toBe(1);
  });

  it('MCH Verse Pass: G5 or above on three lands, and GUM, research, dust and emblems', () => {
    const save = clearedOn('Ocean');
    const pass = skillById.get(VERSE_PASS)!;
    const g5 = (land: string) => {
      for (let r = 0; r <= G5_RANK; r++) save.levels[titleId(land, r)] = 1;
    };
    g5('Ocean');
    g5('Lime');
    // A King on one land alone is not enough.
    for (let r = 0; r < TITLE_RANKS.length; r++) save.levels[titleId('Ocean', r)] = 1;
    expect(isAvailable(pass, save.levels)).toBe(false);
    g5('Ruby');
    expect(isAvailable(pass, save.levels)).toBe(true);
    save.resources.research = 0;
    expect(canBuy(save, pass)).toBe(false);
    Object.assign(save.resources, { research: 1e6, dust: 1e9, emblem: 1e6 });
    const before = { research: save.resources.research, emblem: save.resources.emblem };
    expect(buy(save, pass)).toBe(true);
    expect(save.resources.research).toBeLessThan(before.research);
    expect(save.resources.emblem).toBeLessThan(before.emblem);
    expect(titleCode(save.levels)).toBe('verse');
    expect(cryptidVisitBoost(save.levels, 'Ocean')).toBeCloseTo(1 + 0.25 * 6 * 2);
  });

  it('the leaderboard gets the best title, which the server accepts', () => {
    const save = clearedOn('Grape');
    save.ranking = { ...save.ranking, name: 'Tester' };
    for (let r = 0; r <= 3; r++) save.levels[titleId('Grape', r)] = 1;
    save.levels[titleId('Sage', 0)] = 1;
    const sent = submission(save, 0);
    expect(sent.title).toBe('Grape:g5');
    expect(titleCodeLabel(sent.title)).toContain('G5');
    const checked = validate(sent);
    expect(typeof checked === 'string' ? checked : checked.title).toBe('Grape:g5');
  });
});
