// What an agent session is told (SPEC 11.6): the system prompt, assembled from modules by the
// session's scope and tools, the context block of each turn, and the follow-up of the design
// check (SPEC 9.4). No DOM, and no word about a harness or a wire protocol: the same text serves
// every harness.
export { systemPrompt, type SystemPromptInput } from './systemPrompt';
export { contextBlock, type ContextInput } from './context';
export { QUALITY_GATE_TAG, qualityGateMessage, type QualityGateInput } from './gate';
export {
  ACTION_TAG,
  ACTIONS,
  actionMessage,
  isActionId,
  type ActionDef,
  type ActionId,
  type ActionMessageInput,
  type ActionParams,
} from './actions';
export { SESSION_TAG, sessionBrief, type SessionBriefInput } from './brief';
export { TEMPLATE_FONTS, TEMPLATE_OPTIONAL_ROLES, TEMPLATE_ROLES } from './template';
export {
  ATTACHMENTS_TAG,
  CONVERSATION_TAG,
  attachmentsBlock,
  conversationSummary,
  type AttachedFile,
  type Exchange,
} from './turn';
export {
  IMPORT_TAG,
  importProgress,
  type CapturedSlide,
  type ImportProgressInput,
} from './importSession';
