import { PageContent } from "@/components/page-content/PageContent";
import { PageHeader } from "@/components/page-header/PageHeader";
import { Center, Stack, Text, Title } from "@mantine/core";

export function Dashboard() {
  return (
    <div>
      <PageHeader title="Dashboard" />
      <PageContent>
        <Center h="100%">
          <Stack align="center" gap="sm">
            <Title order={1}>WIP</Title>
            <Text c="dimmed">
              We are working hard to bring awesome thing to you.
            </Text>
          </Stack>
        </Center>
      </PageContent>
    </div>
  );
}
