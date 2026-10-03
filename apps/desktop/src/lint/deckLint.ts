import type { LintService } from '@slidr/agent-tools';
import { lintSlide } from '@slidr/lint';
import { findSlide } from '@slidr/model';
import { measureSlide, renderSlideOffscreen, type AssetResolver } from '@slidr/renderer';

/**
 * The Deck API's lint service (after every write, `slide_lint`, `deck_lint`): each slide of the
 * given deck state is rendered out of sight, measured, and judged by the rules of `@slidr/lint`
 * (SPEC 9.2). The deck is the one the tool saw, which may be newer than what the Stage shows.
 *
 * `resolveAsset` gives the same URLs the Stage shows. The service lives as long as the Deck API,
 * so it has to look up the open workspace on every call, not be the resolver of one document.
 * Without it images do not load, and text over them is judged against what is behind them.
 */
export function createLintService(resolveAsset?: AssetResolver): LintService {
  return {
    async lint(deck, slideIds, rules) {
      const findings = [];
      // One slide at a time: a write touches one or two, and a slide is out of the DOM again
      // before the next one goes in.
      for (const slideId of slideIds) {
        const slide = findSlide(deck, slideId);
        if (!slide) continue;
        // `thumbnail`: nothing plays and no script runs, and lint cannot see into a frame anyway.
        const rendered = await renderSlideOffscreen({
          deck,
          slide,
          mode: 'thumbnail',
          resolveAsset,
        });
        try {
          findings.push(...lintSlide(deck, slide, await measureSlide(rendered.root), rules));
        } finally {
          rendered.dispose();
        }
      }
      return findings;
    },
  };
}
