/*
 * The tests run as on a Hebrew system. The UI starts in the system's language (UI-05), and the
 * tests were written for the app as it started before there was a choice: in Hebrew. A test of
 * another language switches to it, as the user would.
 */
if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'languages', { value: ['he-IL'], configurable: true });
  Object.defineProperty(navigator, 'language', { value: 'he-IL', configurable: true });
}
