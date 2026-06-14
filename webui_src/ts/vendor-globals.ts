/**
 * vendor-globals.ts
 * Imports third-party libraries from npm and exposes them as window globals
 * for backward compatibility with code that references window.marked / window.hljs / window.DOMPurify.
 *
 * Bundled by Vite — never loaded as a bare script in production.
 */

import { marked } from 'marked';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';

import 'highlight.js/styles/github-dark.min.css';

import '@fontsource/inter/latin-300.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/cyrillic-300.css';
import '@fontsource/inter/cyrillic-400.css';
import '@fontsource/inter/cyrillic-500.css';
import '@fontsource/inter/cyrillic-600.css';
import '@fontsource/inter/cyrillic-700.css';

import '@fortawesome/fontawesome-free/css/all.min.css';

window.marked = marked;
window.hljs = hljs;
window.DOMPurify = DOMPurify;
