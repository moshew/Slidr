// PowerPoint files: a deck to .pptx and back (ADR-108).
export {
  exportPptx,
  type ElementPicture,
  type PptxExportOptions,
  type PptxExportResult,
} from './export';
export {
  importPptx,
  PptxReadError,
  type PptxImportOptions,
  type PptxImportResult,
  type StoreAsset,
} from './import';
export type {
  ConversionWarning,
  ExportWarning,
  ExportWarningCode,
  ImportWarning,
  ImportWarningCode,
} from './warnings';
