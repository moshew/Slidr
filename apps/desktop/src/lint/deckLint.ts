import type { LintService } from '@slidr/agent-tools';
import { lintSlide, type LintFinding, type RuleSet } from '@slidr/lint';
import { findSlide, type Deck } from '@slidr/model';
import { measureSlide, renderSlideOffscreen, type AssetResolver } from '@slidr/renderer';

/**
 * The design lint of slides of a deck state (SPEC 9.2): each slide is rendered out of sight,
 * measured, and judged by the rules of `@slidr/lint`. The findings carry their fixes, for the
 * user's design check (LNT-03); a fix holds for the deck it was found on.
 *
 * `resolveAsset` gives the same URLs the Stage shows. Without it images do not load, and text
 * over them is judged against what is behind them.
 */
export async function lintSlides(
  deck: Deck,
  slideIds: readonly string[],
  rules: RuleSet,
  resolveAsset?: AssetResolver,
): Promise<LintFinding[]> {
  const findings: LintFinding[] = [];
  // One slide at a time: a write touches one or two, and a slide is out of the DOM again
  // before the next one goes in.
  for (const slideId of slideIds) {
    const slide = findSlide(deck, slideId);
    if (!slide) continue;
    // `thumbnail`: nothing plays and no script runs, and lint cannot see into a frame anyway.
    const rendered = await renderSlideOffscreen({ deck, slide, mode: 'thumbnail', resolveAsset });
    try {
      findings.push(...lintSlide(deck, slide, await measureSlide(rendered.root), rules));
    } finally {
      rendered.dispose();
    }
  }
  return findings;
}

/**
 * The Deck API's lint service (after every write, `slide_lint`, `deck_lint`). The deck is the
 * one the tool saw, which may be newer than what the Stage shows. The agent gets findings to
 * act on, not commands to run: the fixes stay behind.
 *
 * The service lives as long as the Deck API, so `resolveAsset` has to look up the open workspace
 * on every call, not be the resolver of one document.
 */
export function createLintService(resolveAsset?: AssetResolver): LintService {
  return {
    async lint(deck, slideIds, rules) {
      const findings = await lintSlides(deck, slideIds, rules, resolveAsset);
      return findings.map(({ rule, severity, slideId, elementIds, message }) => ({
        rule,
        severity,
        slideId,
        elementIds,
        message,
      }));
    },
  };
}
