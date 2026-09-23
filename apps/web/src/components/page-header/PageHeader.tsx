import type { ReactNode } from "react";
import { Group, Stack, Tabs, Title } from "@mantine/core";
import React from "react";

import classes from "./PageHeader.module.css";

export interface PageHeaderTab {
  value: string;
  label: string;
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
    <header className={classes.pageHeader}>
      <div className={classes.desktop}>
        <Group mih={64} px="lg" gap="lg" align="center" wrap="nowrap">
          <Title order={2} size="h3" className={classes.title}>
            {title}
          </Title>

          {tabs && (
            <Tabs value={tabs.value} onChange={tabs.onChange} mih={64}>
              <Tabs.List mih={64} className={classes.tabList}>
                {tabs.items.map((tab) => (
                  <Tabs.Tab
                    key={tab.value}
                    value={tab.value}
                    className={classes.tab}
                    mih={64}
                  >
                    {tab.label}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs>
          )}

          <div className={classes.spacer} />

          {filters.length > 0 && (
            <Group gap="sm" wrap="nowrap">
              {filters.map((filter, index) => (
                <React.Fragment key={index}>{filter}</React.Fragment>
              ))}
            </Group>
          )}

          {actions.length > 0 && (
            <Group gap="sm" wrap="nowrap">
              {actions.map((action, index) => (
                <React.Fragment key={index}>{action}</React.Fragment>
              ))}
            </Group>
          )}
        </Group>
      </div>

      <div className={classes.mobile}>
        <Stack gap={0}>
          <Group h={56} px="sm" justify="space-between" wrap="nowrap">
            <Title order={2} size="h4" className={classes.title}>
              {title}
            </Title>

            {actions.length > 0 && (
              <Group gap="xs" wrap="nowrap">
                {actions.map((action, index) => (
                  <React.Fragment key={index}>{action}</React.Fragment>
                ))}
              </Group>
            )}
          </Group>

          {tabs && (
            <Tabs
              value={tabs.value}
              onChange={tabs.onChange}
              className={classes.mobileTabs}
            >
              <Tabs.List px="sm">
                {tabs.items.map((tab) => (
                  <Tabs.Tab
                    key={tab.value}
                    value={tab.value}
                    className={classes.tab}
                  >
                    {tab.label}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs>
          )}

          {filters.length > 0 && (
            <Group
              px="sm"
              py="xs"
              gap="sm"
              wrap="wrap"
              className={classes.filters}
            >
              {filters.map((filter, index) => (
                <React.Fragment key={index}>{filter}</React.Fragment>
              ))}
            </Group>
          )}
        </Stack>
      </div>
    </header>
  );
}
