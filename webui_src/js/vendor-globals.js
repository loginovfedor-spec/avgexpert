/**
 * vendor-globals.js
 * Imports third-party libraries from npm and exposes them as window globals
 * for backward compatibility with code that references window.marked / window.hljs / window.DOMPurify.
 *
 * Bundled by Vite — never loaded as a bare script in production.
 *
 * Font subsets: Latin + Cyrillic, weights 300/400/500/600/700 (matching original Google Fonts request).
 * HLS theme: github-dark (matching original CDN stylesheet).
 */

import { marked } from 'marked';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';

// highlight.js theme (replaces CDN stylesheet link)
import 'highlight.js/styles/github-dark.min.css';

// Inter font — self-hosted via @fontsource, replaces Google Fonts request.
// latin subset (ASCII + basic punctuation)
import '@fontsource/inter/latin-300.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
// cyrillic subset (Russian UI)
import '@fontsource/inter/cyrillic-300.css';
import '@fontsource/inter/cyrillic-400.css';
import '@fontsource/inter/cyrillic-500.css';
import '@fontsource/inter/cyrillic-600.css';
import '@fontsource/inter/cyrillic-700.css';

window.marked = marked;
window.hljs = hljs;
window.DOMPurify = DOMPurify;
