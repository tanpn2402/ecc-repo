import {
  ActionIcon,
  Badge,
  Burger,
  Group,
  Indicator,
  Kbd,
  Paper,
  Popover,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import { IconBell, IconSearch } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import classes from "./AppHeader.module.css";
import { SearchSpotlight } from "./SearchSpotlight";

const notifications = [
  {
    id: 1,
    title: "MR 123 review completed",
    status: "READY TO MERGE",
    color: "green",
  },
  {
    id: 2,
    title: "MR 222 review completed",
    status: "BLOCKED",
    color: "red",
  },
  {
    id: 3,
    title: "MR 333",
    status: "REVIEWING",
    color: "yellow",
  },
];

interface AppHeaderProps {
  mobileOpened: boolean;
  toggleMobile: () => void;
}

export function AppHeader({ mobileOpened, toggleMobile }: AppHeaderProps) {
  const [opened, setOpened] = useState(false);
  const [spotlightOpened, setSpotlightOpened] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSpotlightOpened(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <>
      <div className={classes.inner}>
        <div className={classes.left}>
          <Burger
            className={classes.burger}
            opened={mobileOpened}
            onClick={toggleMobile}
            hiddenFrom="sm"
            size="sm"
            aria-label="Toggle navigation"
          />

          <NavLink to="/" className={classes.logoLink}>
            <img
              className={classes.logoImg}
              src="/assets/logo/ECC_Logo.webp"
              alt="ECC - Engineering Command Center"
            />
            <span>ECC</span>
          </NavLink>
        </div>

        <Group
          gap="xs"
          px="sm"
          h={36}
          miw={300}
          wrap="nowrap"
          style={{
            cursor: "pointer",
            border: "1px solid var(--mantine-color-default-border)",
            borderRadius: "var(--mantine-radius-md)",
            background: "var(--mantine-color-body)",
          }}
          onClick={() => setSpotlightOpened(true)}
        >
          <IconSearch size={16} stroke={1.8} />

          <Text size="sm" c="dimmed" style={{ flex: 1 }}>
            Search
          </Text>

          <Kbd size="xs">Ctrl + K</Kbd>
        </Group>

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
              <Indicator size={8} offset={5} processing color="green">
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
                          <Text size="sm">{notification.title}</Text>

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
      <SearchSpotlight
        opened={spotlightOpened}
        onClose={() => setSpotlightOpened(false)}
      />
    </>
  );
}
