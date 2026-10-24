import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('design tokens', () => {
  it('src/ui/empire/tokens.css matches design/keieimode/tokens.json', () => {
    expect(() => execFileSync('node', ['scripts/design-tokens.mjs', '--check'], { stdio: 'pipe' })).not.toThrow();
  });
});
