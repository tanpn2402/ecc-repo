import {
  ActionIcon,
  AppShell,
  Badge,
  Indicator,
  Paper,
  Popover,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Group,
} from '@mantine/core';
import { IconBell, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import classes from './AppHeader.module.css';
import { NavLink } from 'react-router-dom';

const notifications = [
  {
    id: 1,
    title: 'MR 123 review completed',
    status: 'READY TO MERGE',
    color: 'green',
  },
  {
    id: 2,
    title: 'MR 222 review completed',
    status: 'BLOCKED',
    color: 'red',
  },
  {
    id: 3,
    title: 'MR 333',
    status: 'REVIEWING',
    color: 'yellow',
  },
];

export function AppHeader() {
  const [opened, setOpened] = useState(false);

  return (
    <div className={classes.inner}>
      <div className={classes.left}>
        <NavLink to="/" className={classes.logoLink}>
          <img className={classes.logoImg} src="/assets/logo/ECC_Logo.webp" alt="ECC - Engineering Command Center" />
          ECC
        </NavLink>
      </div>

      <TextInput
        className={classes.search}
        placeholder="Search..."
        leftSection={<IconSearch size={17} stroke={1.5} />}
        size="sm"
      />

      <div className={classes.right}>
        <Popover
          width={360}
          position="bottom-end"
          withArrow
          shadow="md"
          opened={opened}
          onChange={setOpened}
        >
          <Popover.Target>
            <Indicator
              size={8}
              offset={5}
              processing
              color="green"
            >
              <ActionIcon
                variant="subtle"
                size="lg"
                aria-label="Notifications"
                onClick={() => setOpened((value) => !value)}
              >
                <IconBell size={20} stroke={1} />
              </ActionIcon>
            </Indicator>
          </Popover.Target>

          <Popover.Dropdown p={0}>
            <Paper>
              <Group
                justify="space-between"
                px="md"
                py="sm"
                className={classes.popoverHeader}
              >
                <Text fw={600}>Notifications</Text>

                <Text size="xs" c="dimmed">
                  3 new
                </Text>
              </Group>

              <ScrollArea.Autosize mah={350}>
                <Stack gap={0}>
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={classes.notification}
                    >
                      <Group
                        justify="space-between"
                        align="flex-start"
                        wrap="nowrap"
                      >
                        <Text size="sm">
                          {notification.title}
                        </Text>

                        <Badge
                          size="xs"
                          variant="light"
                          color={notification.color}
                        >
                          {notification.status}
                        </Badge>
                      </Group>
                    </div>
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            </Paper>
          </Popover.Dropdown>
        </Popover>
      </div>
    </div>
  );
}