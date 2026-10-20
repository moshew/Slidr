/*
 * Every area registers its panels and tools in `src/<area>/register.ts` (or `.tsx`). This loads
 * all of them at startup, so adding an area never means editing the shell.
 */
import.meta.glob('../*/register.{ts,tsx}', { eager: true });
