import { registerMessages } from '../i18n';
import { en, he } from './messages';

/*
 * The document area: the open deck's file and workspace (DOC-01..05). It draws nothing itself;
 * what it registers is the wording of its failures (WG13-T03), which the shell shows.
 */

registerMessages('document', { he, en });
