import { Tooltip } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// ----------------------------------------
// CopyableText
// Wraps inline content so clicking it copies `value` (falls back to the
// rendered text) to the clipboard. Hovering shows a "Click to copy" hint that
// switches to "Copied!" after a successful copy.
// ----------------------------------------
export function CopyableText({ value, children, style, ...rest }) {
    const { t } = useTranslation();
    const clipboard = useClipboard({ timeout: 1500 });
    const text = value ?? (typeof children === 'string' ? children : '');

    return (
        <Tooltip label={clipboard.copied ? t('helper.copyableText.copied') : t('helper.copyableText.clickToCopy')}
            withArrow>
            <span
                role="button"
                tabIndex={0}
                onClick={() => clipboard.copy(text)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        clipboard.copy(text);
                    }
                }}
                style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, ...style }}
                {...rest}
            >
                {children}
                {clipboard.copied
                    ? <Check size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
                    : <Copy size={14} style={{ flexShrink: 0, opacity: 0.5 }} />}
            </span>
        </Tooltip>
    );
}

export default CopyableText;
