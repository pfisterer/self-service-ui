import { Title, Text } from '@mantine/core';

// Uniform heading + explanatory text used at the top of every zone tab.
export function TabIntro({ title, children }) {
    return (
        <div>
            <Title order={3} mb={4}>{title}</Title>
            <Text size="sm" c="dimmed">{children}</Text>
        </div>
    );
}
