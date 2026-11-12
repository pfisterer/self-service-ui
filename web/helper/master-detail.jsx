import { useEffect, useRef } from 'react';
import { Box, Container, Grid, Paper } from '@mantine/core';

// MasterDetail: a tree (or list) on the left and what is selected in it on the right, as in the groups browser and the DNS zones. From md up the two sit side by side and the tree scrolls on its own; below, on a phone, they stack, the tree first. `masterSpan` is the tree's width in twelfths per breakpoint (4 from md up by default). `header` goes above both, `filter` above the tree inside its frame. With scrollKey, a change of it from one value to another (a new selection) scrolls the detail into view on a phone, where it sits below the tree.
export function MasterDetail({ header, filter, master, detail, scrollKey, masterSpan = { base: 12, md: 4 } }) {
    // The detail takes the rest of the twelve columns at every breakpoint the tree names.
    const detailSpan = Object.fromEntries(Object.entries(masterSpan).map(([bp, n]) => [bp, n >= 12 ? 12 : 12 - n]));
    const detailRef = useRef(null);
    const shown = useRef(scrollKey);
    useEffect(() => {
        const before = shown.current;
        shown.current = scrollKey;
        // Not for the first selection (the page opening on its default): there the tree is what to see first.
        if (before == null || before === scrollKey || scrollKey == null || !window.matchMedia?.('(max-width: 62em)').matches) return;
        detailRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    }, [scrollKey]);
    return (
        <Container size="xl" py="md">
            {header}
            <Grid gutter="md">
                <Grid.Col span={masterSpan}>
                    <Paper p="sm" radius="md" withBorder>
                        {filter && <Box mb="sm">{filter}</Box>}
                        {/* Only up and down: a scroll area that also scrolls sideways grows to the longest row, and then nothing is shortened and the buttons at the end slide out of view. */}
                        <Box style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto', overflowX: 'hidden' }}>
                            {master}
                        </Box>
                    </Paper>
                </Grid.Col>
                <Grid.Col span={detailSpan} ref={detailRef} style={{ minWidth: 0 }}>
                    {detail}
                </Grid.Col>
            </Grid>
        </Container>
    );
}
