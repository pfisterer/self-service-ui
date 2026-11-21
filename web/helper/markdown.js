import { Marked } from 'marked';
import DOMPurify from 'dompurify';

// Markdown written by admins (the model descriptions), rendered to HTML and sanitised: marked has no sanitiser of its own and passes raw HTML through, so everything it produces goes through DOMPurify before it reaches the page. Links open in a new tab without a Referer, as ExternalLink does.

const marked = new Marked({ gfm: true, breaks: false, async: false });

// Only what a description needs: text structure, lists, tables, code, links. No images (they would load from anywhere), no forms, no styles.
const ALLOWED_TAGS = ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'del', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td'];
const ALLOWED_ATTR = ['href', 'title', 'align'];

let purifier = null;
function purify() {
    if (purifier) return purifier;
    purifier = DOMPurify(window);
    purifier.addHook('afterSanitizeAttributes', (node) => {
        if (node.tagName === 'A' && node.getAttribute('href')) {
            node.setAttribute('target', '_blank');
            node.setAttribute('rel', 'noopener noreferrer');
        }
    });
    return purifier;
}

// markdownToHtml is the sanitised HTML of a Markdown text; '' for none.
export function markdownToHtml(text) {
    if (!text) return '';
    const html = marked.parse(String(text));
    // Only http(s) and mailto links; DOMPurify's default would also let other schemes it deems safe through.
    return purify().sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i });
}

// The plain text of inline tokens: what a reader sees, without the marks.
function plainText(tokens) {
    return (tokens ?? []).map(t => {
        if (t.tokens?.length) return plainText(t.tokens);
        if (t.type === 'br') return ' ';
        return t.text ?? '';
    }).join('');
}

// firstParagraph is the plain text of the first paragraph of a Markdown text (headings skipped), for a list; '' when there is none.
export function firstParagraph(text) {
    if (!text) return '';
    const tokens = marked.lexer(String(text));
    const p = tokens.find(t => t.type === 'paragraph');
    return p ? plainText(p.tokens).replace(/\s+/g, ' ').trim() : '';
}
