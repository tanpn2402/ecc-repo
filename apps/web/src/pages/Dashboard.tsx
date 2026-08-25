import { PageContent } from "@/components/page-content/PageContent";
import { PageHeader } from "@/components/page-header/PageHeader";
import { useJiraMetadata } from "@/hooks/use-jira-metadata";
import { Button, Select, Text } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useMemo, useState } from "react";


const tabs = [
  { value: 'synced', label: 'Synced' },
  { value: 'atlassian', label: 'Atlassian Issues' },
];

const groups = [
  { value: 'backend', label: 'Backend' },
  { value: 'frontend', label: 'Frontend' },
  { value: 'devops', label: 'DevOps' },
];

export function Dashboard() {
  const [tab, setTab] = useState<string | null>('synced');
  const [group, setGroup] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const { data: metadata, isLoading } = useJiraMetadata();

  const groups = useMemo(() => (metadata?.groups || []).map(({ id, name }) => ({ value: id, label: name })), []);

  return <div>
    <PageHeader
      title="Issues"
      tabs={{
        items: [
          {
            value: 'synced',
            label: 'Synced',
          },
          {
            value: 'atlassian',
            label: 'Atlassian Issues',
          },
        ],
        value: tab || 'synced',
        onChange: setTab,
      }}
      filters={[
        <Select
          w={160}
          placeholder="Group"
          data={groups}
          value={group}
          onChange={setGroup}
          clearable
          loading={isLoading}
        />,
        <Select
          w={140}
          placeholder="Status"
          data={[
            { value: 'open', label: 'Open' },
            { value: 'closed', label: 'Closed' },
          ]}
          value={status}
          onChange={setStatus}
          clearable
        />,
      ]}
      actions={[
        <Button leftSection={<IconPlus size={16} />}>
          New Issue
        </Button>
      ]}
    />

    <PageContent>
      <div>
        Gradient variant
        When the variant prop is set to gradient, you can control the gradient with the gradient prop, which accepts an object with from, to and deg properties. If thegradient prop is not set, Text will use theme.defaultGradient which can be configured on the theme object. The gradient prop is ignored when variant is not gradient.

        Note that variant="gradient" supports only linear gradients with two colors. If you need a more complex gradient, use the Styles API to modify Text styles.


      </div>

      <div>
        Gradient variant
        When the variant prop is set to gradient, you can control the gradient with the gradient prop, which accepts an object with from, to and deg properties. If thegradient prop is not set, Text will use theme.defaultGradient which can be configured on the theme object. The gradient prop is ignored when variant is not gradient.

        Note that variant="gradient" supports only linear gradients with two colors. If you need a more complex gradient, use the Styles API to modify Text styles.


      </div>

      <div>
        Gradient variant
        When the variant prop is set to gradient, you can control the gradient with the gradient prop, which accepts an object with from, to and deg properties. If thegradient prop is not set, Text will use theme.defaultGradient which can be configured on the theme object. The gradient prop is ignored when variant is not gradient.

        Note that variant="gradient" supports only linear gradients with two colors. If you need a more complex gradient, use the Styles API to modify Text styles.


      </div>

      <div>
        Gradient variant
        When the variant prop is set to gradient, you can control the gradient with the gradient prop, which accepts an object with from, to and deg properties. If thegradient prop is not set, Text will use theme.defaultGradient which can be configured on the theme object. The gradient prop is ignored when variant is not gradient.

        Note that variant="gradient" supports only linear gradients with two colors. If you need a more complex gradient, use the Styles API to modify Text styles.


      </div>

      <div>
        Gradient variant
        When the variant prop is set to gradient, you can control the gradient with the gradient prop, which accepts an object with from, to and deg properties. If thegradient prop is not set, Text will use theme.defaultGradient which can be configured on the theme object. The gradient prop is ignored when variant is not gradient.

        Note that variant="gradient" supports only linear gradients with two colors. If you need a more complex gradient, use the Styles API to modify Text styles.


      </div>

      <div>
        Gradient variant
        When the variant prop is set to gradient, you can control the gradient with the gradient prop, which accepts an object with from, to and deg properties. If thegradient prop is not set, Text will use theme.defaultGradient which can be configured on the theme object. The gradient prop is ignored when variant is not gradient.

        Note that variant="gradient" supports only linear gradients with two colors. If you need a more complex gradient, use the Styles API to modify Text styles.


      </div>

      <div>
        Gradient variant
        When the variant prop is set to gradient, you can control the gradient with the gradient prop, which accepts an object with from, to and deg properties. If thegradient prop is not set, Text will use theme.defaultGradient which can be configured on the theme object. The gradient prop is ignored when variant is not gradient.

        Note that variant="gradient" supports only linear gradients with two colors. If you need a more complex gradient, use the Styles API to modify Text styles.


      </div>

      <div>
        Gradient variant
        When the variant prop is set to gradient, you can control the gradient with the gradient prop, which accepts an object with from, to and deg properties. If thegradient prop is not set, Text will use theme.defaultGradient which can be configured on the theme object. The gradient prop is ignored when variant is not gradient.

        Note that variant="gradient" supports only linear gradients with two colors. If you need a more complex gradient, use the Styles API to modify Text styles.


      </div>

      <div>
        Gradient variant
        When the variant prop is set to gradient, you can control the gradient with the gradient prop, which accepts an object with from, to and deg properties. If thegradient prop is not set, Text will use theme.defaultGradient which can be configured on the theme object. The gradient prop is ignored when variant is not gradient.

        Note that variant="gradient" supports only linear gradients with two colors. If you need a more complex gradient, use the Styles API to modify Text styles.


      </div>

      <div>
        Gradient variant
        When the variant prop is set to gradient, you can control the gradient with the gradient prop, which accepts an object with from, to and deg properties. If thegradient prop is not set, Text will use theme.defaultGradient which can be configured on the theme object. The gradient prop is ignored when variant is not gradient.

        Note that variant="gradient" supports only linear gradients with two colors. If you need a more complex gradient, use the Styles API to modify Text styles.


      </div>

      <div>
        Gradient variant
        When the variant prop is set to gradient, you can control the gradient with the gradient prop, which accepts an object with from, to and deg properties. If thegradient prop is not set, Text will use theme.defaultGradient which can be configured on the theme object. The gradient prop is ignored when variant is not gradient.

        Note that variant="gradient" supports only linear gradients with two colors. If you need a more complex gradient, use the Styles API to modify Text styles.


      </div>

      <div>
        Gradient variant
        When the variant prop is set to gradient, you can control the gradient with the gradient prop, which accepts an object with from, to and deg properties. If thegradient prop is not set, Text will use theme.defaultGradient which can be configured on the theme object. The gradient prop is ignored when variant is not gradient.

        Note that variant="gradient" supports only linear gradients with two colors. If you need a more complex gradient, use the Styles API to modify Text styles.


      </div>

      <div>
        Gradient variant
        When the variant prop is set to gradient, you can control the gradient with the gradient prop, which accepts an object with from, to and deg properties. If thegradient prop is not set, Text will use theme.defaultGradient which can be configured on the theme object. The gradient prop is ignored when variant is not gradient.

        Note that variant="gradient" supports only linear gradients with two colors. If you need a more complex gradient, use the Styles API to modify Text styles.


      </div>

      <div>
        Gradient variant
        When the variant prop is set to gradient, you can control the gradient with the gradient prop, which accepts an object with from, to and deg properties. If thegradient prop is not set, Text will use theme.defaultGradient which can be configured on the theme object. The gradient prop is ignored when variant is not gradient.

        Note that variant="gradient" supports only linear gradients with two colors. If you need a more complex gradient, use the Styles API to modify Text styles.


      </div>

      <div>
        Gradient variant
        When the variant prop is set to gradient, you can control the gradient with the gradient prop, which accepts an object with from, to and deg properties. If thegradient prop is not set, Text will use theme.defaultGradient which can be configured on the theme object. The gradient prop is ignored when variant is not gradient.

        Note that variant="gradient" supports only linear gradients with two colors. If you need a more complex gradient, use the Styles API to modify Text styles.


      </div>

      <div>
        Gradient variant
        When the variant prop is set to gradient, you can control the gradient with the gradient prop, which accepts an object with from, to and deg properties. If thegradient prop is not set, Text will use theme.defaultGradient which can be configured on the theme object. The gradient prop is ignored when variant is not gradient.

        Note that variant="gradient" supports only linear gradients with two colors. If you need a more complex gradient, use the Styles API to modify Text styles.


      </div>
    </PageContent>
  </div>
}