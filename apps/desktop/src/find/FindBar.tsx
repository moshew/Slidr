import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import {
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Replace,
  Search,
  WholeWord,
  X,
} from '@slidr/ui/icons';
import { Button, cx, IconButton, Input, Toggle } from '@slidr/ui';
import { useDeck, useEditor, useSelection, type Editor } from '../shell';
import { clearMatches, paintMatches } from './highlight';
import type { Match } from './search';
import {
  closeFind,
  findSession,
  matchesIn,
  replaceAll,
  replaceCurrent,
  standingOn,
  step,
} from './session';

/*
 * The find bar (TXT-12): a bar that floats at the top inline-end corner of the Stage region, as a
 * layer over the Stage (`registerStageLayer`). It is not modal: the deck stays editable under it,
 * and the count and the marks on the Stage follow every change. Ctrl+F and Ctrl+H open it, Enter
 * and Shift+Enter in the find field (F3 and Shift+F3 anywhere) step through the matches, Esc
 * closes it.
 */

/** What the shell draws over the Stage: nothing until the bar is opened. */
export function FindBar() {
  const open = useStore(findSession, (s) => s.open);
  return open ? <OpenBar /> : null;
}

/** Where a match is, when the Stage cannot show it or "replace" will not change it. */
function whereKeys(match: Match | undefined, replacing: boolean): string[] {
  if (!match) return [];
  if (!match.elementId) return ['where.notes'];
  return [
    ...(match.hidden ? ['where.hidden'] : []),
    ...(match.locked && replacing ? ['where.locked'] : []),
  ];
}

/** True for a change inside the slide the Stage draws, not in the handles and guides over it. */
function inSlide(record: MutationRecord): boolean {
  const { target } = record;
  const element = target instanceof Element ? target : target.parentElement;
  return Boolean(element?.closest('[data-slide-id]'));
}

function OpenBar() {
  const { t } = useTranslation('find');
  const editor = useEditor();
  const session = useStore(findSession);
  const deck = useDeck((s) => s.deck);
  const slideId = useSelection((s) => s.currentSlideId);
  const { replacing, query, replacement, matchCase, wholeWord, outcome, focusRequest } = session;
  const bar = useRef<HTMLDivElement>(null);
  const findField = useRef<HTMLInputElement>(null);

  const matches = useMemo(
    () => matchesIn(deck, { query, matchCase, wholeWord }),
    [deck, query, matchCase, wholeWord],
  );
  const current = standingOn(matches, session.current, slideId);
  const index = current ? matches.indexOf(current) : -1;
  const none = matches.length === 0;

  // Every time the bar is asked for, the find field takes the keyboard with its text selected, so
  // typing starts a new search.
  useEffect(() => {
    findField.current?.focus();
    findField.current?.select();
  }, [focusRequest]);

  // The marks on the Stage. They are painted once the slide is drawn, and again when the Stage
  // draws text anew for a reason of its own: the text editor opens in a box, a preview of a
  // proposed change comes and goes.
  useLayoutEffect(() => {
    const paint = () => paintMatches(deck, slideId, matches, current);
    paint();
    const region = bar.current?.closest('section');
    if (!region) return;
    let frame = 0;
    const observer = new MutationObserver((records) => {
      if (!records.some(inSlide)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(paint);
    });
    observer.observe(region, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [deck, slideId, matches, current]);
  useEffect(() => clearMatches, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    // Handled here, so a shortcut of the shell does not act on the same key.
    event.preventDefault();
    closeFind();
  };

  /*
   * A right click on the bar. The shell keeps it from the Stage's menu, and so it does not reach
   * the window either, where the app turns the webview's own menu off (`main.tsx`): the bar does
   * that for itself, by the same rule. Text fields keep their menu.
   */
  const onContextMenu = (event: MouseEvent) => {
    if (event.target instanceof Element && event.target.closest('input')) return;
    if (import.meta.env.DEV && event.shiftKey) return;
    event.preventDefault();
  };

  /** Enter in a field; not the Enter that ends a composition of an input method. */
  const onEnter = (act: (back: boolean) => void) => (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    act(event.shiftKey);
  };

  /**
   * "Replace" and "replace all" from their buttons. When nothing is left to replace, the buttons
   * are disabled, and a disabled button drops the keyboard to nowhere: the find field takes it,
   * so Esc still closes the bar.
   */
  const onReplace = (act: (editor: Editor) => void) => () => {
    act(editor);
    if (matchesIn(editor.bus.deck, findSession.getState()).length === 0) findField.current?.focus();
  };

  const lines = [
    ...(outcome?.replaced ? [t('replaced', { count: outcome.replaced })] : []),
    ...(outcome?.skipped ? [t('skipped', { count: outcome.skipped })] : []),
    ...whereKeys(current, replacing).map((key) => t(key)),
  ];

  return (
    <div
      ref={bar}
      role="search"
      aria-label={t('title')}
      data-testid="find-bar"
      className="absolute end-3 top-3 z-10 flex animate-overlay-in flex-col gap-1 rounded-panel border border-ui-line bg-ui-raised p-2 text-sm text-ui-fg shadow-overlay"
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
    >
      <div className="flex items-start gap-1">
        <div className="flex h-control items-center">
          <IconButton
            icon={replacing ? ChevronDown : ChevronRight}
            mirror
            size="sm"
            label={replacing ? t('hideReplace') : t('showReplace')}
            shortcut="Ctrl+H"
            aria-expanded={replacing}
            data-testid="find-toggle-replace"
            onClick={() => findSession.setState({ replacing: !replacing })}
          />
        </div>
        {/* The fields come before the buttons, so Tab goes from what is looked for to what replaces it. */}
        <div className="flex w-64 flex-col gap-1.5">
          <Input
            ref={findField}
            icon={Search}
            value={query}
            placeholder={t('find')}
            aria-label={t('find')}
            spellCheck={false}
            autoComplete="off"
            data-testid="find-query"
            onChange={(event) => findSession.setState({ query: event.target.value, outcome: null })}
            onKeyDown={onEnter((back) => step(editor, back ? -1 : 1))}
            end={
              query ? (
                <span
                  role="status"
                  dir={none ? undefined : 'ltr'}
                  data-testid="find-count"
                  className={cx(
                    'shrink-0 text-xs tabular-nums',
                    none ? 'text-ui-danger-fg' : 'text-ui-fg-muted',
                  )}
                >
                  {none
                    ? t('noResults')
                    : index < 0
                      ? matches.length
                      : `${index + 1} / ${matches.length}`}
                </span>
              ) : null
            }
          />
          {replacing && (
            <Input
              icon={Replace}
              value={replacement}
              placeholder={t('replaceWith')}
              aria-label={t('replaceWith')}
              spellCheck={false}
              autoComplete="off"
              data-testid="find-replacement"
              onChange={(event) => findSession.setState({ replacement: event.target.value })}
              onKeyDown={onEnter(() => replaceCurrent(editor))}
            />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex h-control items-center gap-0.5">
            <Toggle
              icon={CaseSensitive}
              size="sm"
              label={t('matchCase')}
              pressed={matchCase}
              data-testid="find-match-case"
              onPressedChange={(on) => findSession.setState({ matchCase: on, outcome: null })}
            />
            <Toggle
              icon={WholeWord}
              size="sm"
              label={t('wholeWord')}
              pressed={wholeWord}
              data-testid="find-whole-word"
              onPressedChange={(on) => findSession.setState({ wholeWord: on, outcome: null })}
            />
            <IconButton
              icon={ChevronUp}
              size="sm"
              className="ms-1"
              label={t('previous')}
              shortcut="Shift+F3"
              disabled={none}
              data-testid="find-previous"
              onClick={() => step(editor, -1)}
            />
            <IconButton
              icon={ChevronDown}
              size="sm"
              label={t('next')}
              shortcut="F3"
              disabled={none}
              data-testid="find-next"
              onClick={() => step(editor, 1)}
            />
            <IconButton
              icon={X}
              size="sm"
              className="ms-1"
              label={t('close')}
              shortcut="Esc"
              data-testid="find-close"
              onClick={closeFind}
            />
          </div>
          {replacing && (
            <div className="flex h-control items-center gap-1">
              <Button
                size="sm"
                disabled={none}
                data-testid="find-replace"
                onClick={onReplace(replaceCurrent)}
              >
                {t('replace')}
              </Button>
              <Button
                size="sm"
                disabled={none}
                data-testid="find-replace-all"
                onClick={onReplace(replaceAll)}
              >
                {t('replaceAll')}
              </Button>
            </div>
          )}
        </div>
      </div>
      {lines.length > 0 && (
        <div
          role="status"
          data-testid="find-status"
          className="flex flex-col ps-8 text-xs text-ui-fg-muted"
        >
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}
