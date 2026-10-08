/**
 * The templates Slidr ships with, as the library of the app takes them.
 *
 * Here they are made by their code (`@slidr/templates/builtin`): that is what development and
 * the tests run. A packaged app does not carry that code. Its build writes each template as a
 * file of the media library (`media/templates/<id>/template.json`, in the order of
 * `media/templates/index.json`) and answers the import of this module with one that reads those
 * files: see `build/media.ts`.
 */
import type { Template } from '@slidr/templates';
import { builtInTemplates } from '@slidr/templates/builtin';

export const builtIn: readonly Template[] = builtInTemplates();
