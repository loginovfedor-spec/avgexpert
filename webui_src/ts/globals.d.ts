declare global {
  interface Window {
    marked: typeof import('marked').marked;
    hljs: typeof import('highlight.js').default;
    DOMPurify: typeof import('dompurify').default;
  }

  const marked: Window['marked'];
  const hljs: Window['hljs'];
  const DOMPurify: Window['DOMPurify'];
}

declare module '*.css' {
  const content: string;
  export default content;
}

declare module '*.svg' {
  const url: string;
  export default url;
}

export {};
