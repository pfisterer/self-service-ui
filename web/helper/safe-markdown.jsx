import { Code, List, Stack, Text } from '@mantine/core';
import { parseBlocks, parseInline } from './safe-markdown.js';

// SafeMarkdown renders the subset of safe-markdown.js as React elements: text nodes only, never HTML, no links or images.
export function SafeMarkdown({ text, size = 'sm', ...rest }) {
    const blocks = parseBlocks(text);
    return (
        <Stack gap={6} {...rest}>
            {blocks.map((b, i) => b.type === 'list'
                ? (
                    <List key={i} type={b.ordered ? 'ordered' : 'unordered'} size={size} spacing={2} withPadding>
                        {b.items.map((it, j) => <List.Item key={j}><Inline line={it} /></List.Item>)}
                    </List>
                )
                : (
                    <Text key={i} size={size}>
                        {b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}<Inline line={l} /></span>)}
                    </Text>
                ))}
        </Stack>
    );
}

function Inline({ line }) {
    return parseInline(line).map((seg, i) => {
        if (seg.code) return <Code key={i}>{seg.text}</Code>;
        if (seg.bold) return <strong key={i}>{seg.text}</strong>;
        if (seg.italic) return <em key={i}>{seg.text}</em>;
        return <span key={i}>{seg.text}</span>;
    });
}
