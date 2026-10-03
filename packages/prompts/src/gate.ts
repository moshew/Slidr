import type { LintFinding } from '@slidr/agent-tools';
import type { Deck } from '@slidr/model';
import { capped, json, slideRef } from './context';

/** The tag the app's design check speaks in. The role module says such text is the app's. */
export const QUALITY_GATE_TAG = 'slidr_quality_gate';

export interface QualityGateInput {
  /** The deck as it is when the follow-up is sent. */
  deck: Deck;
  /** This follow-up's number in the turn, from 1. */
  round: number;
  /** How many follow-ups a turn gets (QG-02: two). */
  rounds: number;
  /** Slides the agent changed in this turn and has not looked at since its last change. */
  unseen: readonly string[];
  /** Findings the turn may not end with, on slides the agent created or changed in it. */
  findings: readonly LintFinding[];
}

/** A lint message says what was measured and what would fix it: longer than a title. */
const MAX_FINDING = 400;

/**
 * The follow-up the app sends when a turn ends with slides the agent did not look at or with
 * findings it may not leave (SPEC 9.4, QG-01 to QG-03). It goes out as a turn of its own, in
 * place of a user message, inside a `<slidr_quality_gate>` tag: the system prompt teaches that
 * text in `<slidr_…>` tags is the app's, and already says what the design check holds a turn
 * for. Like the context block, every value is JSON on one line.
 */
export function qualityGateMessage(input: QualityGateInput): string {
  const { deck, round, rounds, unseen, findings } = input;
  const last = round >= rounds;
  const lines: string[] = [`round: ${json(round)}`, `rounds: ${json(rounds)}`];
  const say: string[] = [
    'The design check is holding this turn open: it is not over until the lists below are dealt with.',
  ];
  if (unseen.length > 0) {
    lines.push(`look: ${json(capped(unseen.map((id) => slideRef(deck, id))))}`);
    say.push(
      '`look`: slides you changed in this turn and have not seen since your last change to them. Render each one and judge the picture against the list that closes the design guidelines.',
    );
  }
  if (findings.length > 0) {
    lines.push(
      `fix: ${json(
        capped(
          findings.map((finding) => ({
            slide: slideRef(deck, finding.slideId),
            rule: finding.rule,
            severity: finding.severity,
            elements: finding.elementIds,
            finding: finding.message,
          })),
        ),
        { finding: MAX_FINDING },
      )}`,
    );
    say.push(
      '`fix`: what the design check measured on slides you created or changed in this turn. Fix each finding with the smallest change that does it, and look at the slide again afterwards.',
    );
  }
  say.push(
    last
      ? 'This is the last round. Whatever is left after it is shown to the user as it is, so if a finding cannot or should not be fixed, say why in one line.'
      : 'Start nothing new. When both lists are dealt with, end the turn with a line or two for the user, in their language.',
  );
  return [`<${QUALITY_GATE_TAG}>`, ...lines, ...say, `</${QUALITY_GATE_TAG}>`].join('\n');
}
