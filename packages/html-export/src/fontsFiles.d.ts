// Files the bundler hands over as an address (Vite's `?url`): the two heavy parts of font
// embedding, and the font files of the tests. The app has this from `vite/client`; this package
// is compiled without it.
declare module '*?url' {
  const url: string;
  export default url;
}
