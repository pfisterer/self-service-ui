import { Anchor } from '@mantine/core';

// Every link that leaves the application.
//
// Written once so `rel` cannot be forgotten: 20 of the 21 `target="_blank"`
// anchors in this UI had no `rel`, which leaks the full URL of the current page
// (zone names, node ids) to the target site as a Referer. Browsers imply
// `noopener` for `target="_blank"` these days, so it is spelled out here for
// documentation as much as for the handful of clients that do not.
//
// Takes the same props as Mantine's Anchor; `target`/`rel` can still be
// overridden explicitly by passing them, since the spread comes last.
export function ExternalLink({ children, ...props }) {
    return (
        <Anchor target="_blank" rel="noopener noreferrer" {...props}>
            {children}
        </Anchor>
    );
}
