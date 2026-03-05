import { html } from 'htm/preact';
import { Container, Title, Stack } from '@mantine/core';

export function Documentation() {
    return html`
        <${Container} size="lg" py="xl">
            <${Stack}>
                <${Title} order=${1}>Documentation</>
            </>
        </>
    `
}
