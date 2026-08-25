import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <Center h="100%">
      <Stack align="center" gap="sm">
        <Title order={1}>404</Title>

        <Text c="dimmed">
          The page you're looking for doesn't exist.
        </Text>

        <Button component={Link} to="/">
          Back to Dashboard
        </Button>
      </Stack>
    </Center>
  );
}