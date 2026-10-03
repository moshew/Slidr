import { bindControls, toggleFullscreen } from './controls';
import { createPlayer, type Player, type PlayerSlide } from './player';
import type { AnimationStep, Transition } from './types';

/**
 * The runtime of an exported file (WG9-T10, T11). The file does not carry the model (SPEC 12):
 * each slide's transition and timeline travel as JSON in attributes of its `<section>`, and this
 * reads them back and starts the same player the editor uses.
 *
 *   <div class="slidr-viewport">
 *     <div class="slidr-stage" data-width="1920" data-height="1080">
 *       <section class="slide" data-slide=".." data-transition="{..}" data-timeline="[..]">
 */
export const VIEWPORT_CLASS = 'slidr-viewport';
export const STAGE_CLASS = 'slidr-stage';
export const SLIDE_CLASS = 'slide';
/** Set on `<html>` once the player has taken over; the file's stylesheet shows the stage then. */
export const READY_CLASS = 'slidr-ready';

function parse<T>(json: string | undefined): T | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
}

/** The slides of a stage, with the transition and timeline their attributes carry. */
export function readSlides(stage: HTMLElement): PlayerSlide[] {
  return Array.from(stage.children)
    .filter((el): el is HTMLElement => el instanceof HTMLElement && el.matches(`.${SLIDE_CLASS}`))
    .map((el) => ({
      el,
      id: el.dataset.slide,
      transition: parse<Transition>(el.dataset.transition),
      timeline: parse<AnimationStep[]>(el.dataset.timeline),
      hidden: el.hasAttribute('data-hidden'),
    }));
}

const FULLSCREEN_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';

/** A touch screen has no F key: a button that shows while the pointer moves. */
function fullscreenButton(viewport: HTMLElement): void {
  const doc = viewport.ownerDocument;
  if (!doc.fullscreenEnabled) return;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'slidr-fullscreen';
  button.dataset.slidrControl = '';
  button.setAttribute('aria-label', 'Full screen');
  button.innerHTML = FULLSCREEN_ICON;
  button.addEventListener('click', () => toggleFullscreen(viewport));
  viewport.append(button);
  let idle: ReturnType<typeof setTimeout> | undefined;
  const wake = () => {
    viewport.classList.add('slidr-active');
    if (idle !== undefined) clearTimeout(idle);
    idle = setTimeout(() => viewport.classList.remove('slidr-active'), 2500);
  };
  viewport.addEventListener('pointermove', wake);
  viewport.addEventListener('pointerdown', wake);
}

/** Starts the show of an exported document. */
export function boot(doc: Document = document): Player | undefined {
  const viewport = doc.querySelector<HTMLElement>(`.${VIEWPORT_CLASS}`);
  const stage = viewport?.querySelector<HTMLElement>(`.${STAGE_CLASS}`);
  if (!viewport || !stage) return undefined;
  const player = createPlayer({
    viewport,
    stage,
    slides: readSlides(stage),
    size: { w: Number(stage.dataset.width) || 1920, h: Number(stage.dataset.height) || 1080 },
  });
  bindControls(player, { viewport });
  fullscreenButton(viewport);
  doc.documentElement.classList.add(READY_CLASS);
  return player;
}
