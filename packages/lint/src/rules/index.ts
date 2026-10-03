import type { Rule } from '../rule';
import { L02, L03 } from './bounds';
import { L05 } from './contrast';
import { L07 } from './coverage';
import { L04 } from './fontSize';
import { L16 } from './noVisual';
import { L06 } from './overlap';
import { L01 } from './overflow';
import { L13 } from './textLoad';

/**
 * Every rule, in the order findings are reported. A new rule is one more entry here; `agent`
 * on the rule decides whether it is also in the set returned after every write.
 */
export const rules: readonly Rule[] = [L01, L02, L03, L04, L05, L06, L07, L13, L16];
