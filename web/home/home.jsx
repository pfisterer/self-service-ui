import { Container, Paper, Title, Text } from '@mantine/core';

export function Home() {
    return (
        <Container size="md" py="xl">
            <Paper p="xl" shadow="sm" radius="md" withBorder>
                <Title order={1} mb="md">Welcome to dhbwCloud Self Service</Title>
                <Text>Use the navigation bar to manage your DNS zones and API tokens.</Text>
            </Paper>
        </Container>
    );
}
