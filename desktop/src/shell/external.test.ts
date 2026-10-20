import { describe, expect, it } from 'vitest';
import { isWebAddress } from './external';

describe('what may leave the app as a link', () => {
  it('lets through addresses of the web', () => {
    expect(isWebAddress('https://example.com/a?b=1#c')).toBe(true);
    expect(isWebAddress('http://localhost:1420/')).toBe(true);
    expect(isWebAddress('HTTPS://EXAMPLE.COM')).toBe(true);
  });

  it('lets nothing else through', () => {
    for (const url of [
      'javascript:alert(1)',
      'file:///C:/Windows/system32/calc.exe',
      'mailto:someone@example.com',
      'tel:+972',
      'slidr://open',
      'data:text/html,<p>hi</p>',
      'https://',
      '#slide=s_1',
      '/relative/path',
      '',
      'example.com',
    ]) {
      expect(isWebAddress(url), url).toBe(false);
    }
  });
});
