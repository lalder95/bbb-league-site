// scripts/parseMarkdownRoundBoundarySanity.mjs
// Regression sanity check: ensure the last pick of a round doesn't render under the next round.

import { parseMarkdown } from '../src/utils/mockDraftUtils.js';

const md = `# Test Mock

## Round 1

### 1.12 - Team Alpha
**Projected Pick: Player One, RB**

Reason line one.

## Round 2

### 2.01 - Team Beta
**Projected Pick: Player Two, WR**

Reason line two.
`;

const html = parseMarkdown(md, []);

const round2Index = html.indexOf('Round 2');
const pick112Index = html.indexOf('1.12') !== -1
  ? html.indexOf('1.12')
  : html.indexOf('1.12 ');

if (round2Index === -1) {
  console.log(html.slice(0, 800));
  throw new Error('Could not find Round 2 header');
}
if (pick112Index === -1) {
  console.log(html.slice(0, 1200));
  throw new Error('Could not find pick 1.12 in HTML');
}

if (pick112Index > round2Index) {
  throw new Error('Pick 1.12 appears after Round 2 header: regression still present');
}

console.log('OK: Pick 1.12 rendered before Round 2 header');
