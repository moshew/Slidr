// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { modalOpen, overlayOf } from './overlay';

/** Builds markup in the body and returns the node marked `data-at`. */
function at(markup: string): Element {
  document.body.innerHTML = markup;
  return document.querySelector('[data-at]')!;
}

const floating = (inside: string) => `<div data-radix-popper-content-wrapper>${inside}</div>`;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the layer a key was pressed in', () => {
  it('is the window itself for the Stage, for a toolbar and for a list that is part of the window', () => {
    expect(overlayOf(at('<div role="application" data-at></div>'))).toBeNull();
    expect(overlayOf(at('<div role="toolbar"><button data-at></button></div>'))).toBeNull();
    // The Filmstrip is a listbox, and its slides are options: it is no floating list.
    expect(overlayOf(at('<div role="listbox"><div role="option" data-at></div></div>'))).toBeNull();
    expect(overlayOf(null)).toBeNull();
    expect(overlayOf(window)).toBeNull();
  });

  it('is a menu for a menu, a sub-menu and a floating list of options', () => {
    const menu = floating('<div role="menu"><div role="menuitem" data-at></div></div>');
    expect(overlayOf(at(menu))).toBe('menu');
    const list = floating('<div role="listbox"><div role="option" data-at></div></div>');
    expect(overlayOf(at(list))).toBe('menu');
    // The list of a picker inside a popover is a list; the field above it is the popover's.
    const picker = floating(
      '<div role="dialog"><input data-field><div role="listbox"><div data-at></div></div></div>',
    );
    expect(overlayOf(at(picker))).toBe('menu');
    expect(overlayOf(document.querySelector('[data-field]'))).toBe('popover');
  });

  it('tells a popover beside its button from a modal dialog', () => {
    expect(overlayOf(at(floating('<div role="dialog"><button data-at></button></div>')))).toBe(
      'popover',
    );
    expect(modalOpen()).toBe(false);
    expect(overlayOf(at('<div role="dialog"><button data-at></button></div>'))).toBe('modal');
    expect(modalOpen()).toBe(true);
    expect(overlayOf(at('<div role="alertdialog"><button data-at></button></div>'))).toBe('modal');
  });

  it('knows a modal dialog is open from anywhere in the window', () => {
    at('<div role="application" data-at></div><div role="dialog"></div>');
    expect(overlayOf(document.querySelector('[data-at]'))).toBeNull();
    expect(modalOpen()).toBe(true);
    // A popover that a modal dialog opened is a popover, and the dialog is still there.
    const nested = at(
      `<div role="dialog"></div>${floating('<div role="dialog"><i data-at></i></div>')}`,
    );
    expect(overlayOf(nested)).toBe('popover');
    expect(modalOpen()).toBe(true);
  });
});
