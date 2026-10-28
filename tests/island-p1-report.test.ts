import { describe, expect, it } from 'vitest';
import { reportTitle } from '../src/island/p1/report';

describe('月次報告のタイトル', () => {
  it('通算の月を「N年目・M月」にする', () => {
    expect(reportTitle(1)).toBe('月次報告（1年目・1月）');
    expect(reportTitle(12)).toBe('月次報告（1年目・12月）');
    expect(reportTitle(13)).toBe('月次報告（2年目・1月）');
    expect(reportTitle(25)).toBe('月次報告（3年目・1月）');
  });
});
