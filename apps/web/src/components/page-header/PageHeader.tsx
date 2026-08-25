import type { ReactNode } from 'react';
import { Group, Space, Tabs, Title } from '@mantine/core';
import React from 'react';

export interface PageHeaderTab {
  value: string;
  label: string;
}

export interface PageHeaderAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
}

interface PageHeaderProps {
  title: string;

  tabs?: {
    items: PageHeaderTab[];
    value?: string;
    onChange?: (value: string | null) => void;
  };

  filters?: ReactNode[];

  actions?: ReactNode[];
}

export function PageHeader({
  title,
  tabs,
  filters = [],
  actions = [],
}: PageHeaderProps) {
  return (
    <Group
      h={64}
      px="lg"
      gap="lg"
      align="center"
      wrap="nowrap"
      style={{
        borderBottom:
          '1px solid var(--mantine-color-default-border)',
        position: 'sticky',
        top: 'var(--app-shell-header-height)',
        backgroundColor: 'var(--mantine-color-dark-9)',
        borderRadius: 'var(--mantine-radius-lg) var(--mantine-radius-lg) 0 0',
        zIndex: 99,
      }}
    >
      <Title order={2} size="h3" style={{ flexShrink: 0 }}>
        {title}
      </Title>

      {tabs && (
        <Tabs
          value={tabs.value}
          onChange={tabs.onChange}
          h="100%"
        >
          <Tabs.List h="100%">
            {tabs.items.map((tab) => (
              <Tabs.Tab key={tab.value} value={tab.value}
                style={{
                  borderRadius: 0,
                }}>
                {tab.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      )}

      <Space flex={1} />

      {filters.length > 0 && (
        <Group gap="sm" wrap="nowrap">
          {filters.map((filter, index) => (
            <React.Fragment key={index}>{filter}</React.Fragment>
          ))}
        </Group>
      )}

      {actions.length > 0 && (
        <Group gap="sm" ml="auto" wrap="nowrap">
          {actions.map((action, index) => (
            <React.Fragment key={index}>{action}</React.Fragment>
          ))}
        </Group>
      )}
    </Group>
  );
}