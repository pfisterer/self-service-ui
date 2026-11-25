// A small Markdown subset for text a language model wrote from data other people wrote (the portal assistant): paragraphs, bullet and numbered lists, **bold**, *italics* / _italics_ and `inline code`. Nothing else is interpreted: no links, images, headings, tables or HTML. The result is a tree of plain values that React renders as text nodes, so nothing can become markup; a link stays its literal text and is not clickable.

// parseBlocks splits text into paragraphs and lists. A list item is a line starting with "- ", "* ", "• " or "1. "; a blank line ends a paragraph or list.
export function parseBlocks(text) {
    const blocks = [];
    let para = null;
    let list = null;
    const flush = () => {
        if (para) blocks.push({ type: 'p', lines: para });
        if (list) blocks.push(list);
        para = null;
        list = null;
    };
    for (const raw of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
        const line = raw.trimEnd();
        if (line.trim() === '') {
            flush();
            continue;
        }
        const bullet = /^\s*(?:[-*•])\s+(.*)$/.exec(line);
        const number = /^\s*\d{1,3}[.)]\s+(.*)$/.exec(line);
        const item = bullet ?? number;
        if (item) {
            const ordered = !bullet;
            if (para) flush();
            if (!list || list.ordered !== ordered) {
                if (list) blocks.push(list);
                list = { type: 'list', ordered, items: [] };
            }
            list.items.push(item[1]);
            continue;
        }
        // A heading marker is dropped, its text kept as a paragraph line.
        const content = line.replace(/^\s*#{1,6}\s+/, '');
        if (list && /^\s{2,}\S/.test(raw)) {
            // An indented continuation belongs to the last item.
            list.items[list.items.length - 1] += ' ' + content.trim();
            continue;
        }
        if (list) {
            blocks.push(list);
            list = null;
        }
        (para ??= []).push(content);
    }
    flush();
    return blocks;
}

// parseInline turns a line into segments {text, bold, italic, code}. Unmatched markers stay literal.
export function parseInline(line) {
    const out = [];
    const re = /`([^`\n]+)`|\*\*([^*\n]+?)\*\*|__([^_\n]+?)__|\*([^*\s][^*\n]*?)\*|(?<![\w])_([^_\s][^_\n]*?)_(?![\w])/g;
    let last = 0;
    let m;
    const s = String(line ?? '');
    while ((m = re.exec(s)) !== null) {
        if (m.index > last) out.push({ text: s.slice(last, m.index) });
        if (m[1] !== undefined) out.push({ text: m[1], code: true });
        else if (m[2] !== undefined || m[3] !== undefined) out.push({ text: m[2] ?? m[3], bold: true });
        else out.push({ text: m[4] ?? m[5], italic: true });
        last = m.index + m[0].length;
    }
    if (last < s.length) out.push({ text: s.slice(last) });
    return out;
}
