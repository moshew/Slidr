// What an agent session is told (SPEC 11.6): the system prompt, assembled from modules by the
// session's scope and tools, and the context block of each turn. No DOM, and no word about a
// harness or a wire protocol: the same text serves every harness.
export { systemPrompt, type SystemPromptInput } from './systemPrompt';
export { contextBlock, type ContextInput } from './context';
