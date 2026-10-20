import { createBaseTheme } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { colorToHex, hexToColor, pickedColor } from './colors';

const theme = createBaseTheme();

describe('model colours and the picker', () => {
  it('reads a token from the theme', () => {
    expect(colorToHex({ token: 'primary' }, theme)).toBe('#2f5bea');
    expect(colorToHex({ token: 'primary', alpha: 0.5 }, theme)).toBe('#2f5bea80');
    expect(colorToHex({ value: '#FFF' }, theme)).toBe('#ffffff');
  });

  it('writes an explicit colour with its alpha apart', () => {
    expect(hexToColor('#2f5bea')).toEqual({ value: '#2f5bea' });
    expect(hexToColor('#2f5bea80')).toEqual({ value: '#2f5bea', alpha: 0.5 });
  });

  it('keeps following a token while only the alpha moves', () => {
    const token = { token: 'primary' } as const;
    expect(pickedColor('#2f5bea80', token, theme)).toEqual({ token: 'primary', alpha: 0.5 });
    expect(pickedColor('#2f5bea', { token: 'primary', alpha: 0.5 }, theme)).toEqual(token);
    expect(pickedColor('#2f5beb', token, theme)).toEqual({ value: '#2f5beb' });
    expect(pickedColor('#ff0000', null, theme)).toEqual({ value: '#ff0000' });
  });
});
