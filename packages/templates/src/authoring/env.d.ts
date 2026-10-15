// `import.meta.glob`, as Vite gives it to these modules: the review page and `tools/run-ts.mjs`
// build them with Vite, and this package has no Vite of its own.
interface ImportMeta {
  glob<T = unknown>(
    pattern: string | string[],
    options: { eager: true; import?: string },
  ): Record<string, T>;
}
