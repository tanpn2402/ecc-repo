import { Link } from "react-router-dom";
import { Button, Center, Stack, Text, Title } from "@mantine/core";
import { PageContent } from "@/components/page-content/PageContent";
import { PageHeader } from "@/components/page-header/PageHeader";

export function NotFound() {
  return (
    <div>
      <PageHeader title="Page Not Found" />
      <PageContent>
        <Center h="100%">
          <Stack align="center" gap="sm">
            <Title order={1}>404</Title>

            <Text c="dimmed">The page you're looking for doesn't exist.</Text>

            <Button component={Link} to="/">
              Back to Dashboard
            </Button>
          </Stack>
        </Center>
      </PageContent>
    </div>
  );
}
