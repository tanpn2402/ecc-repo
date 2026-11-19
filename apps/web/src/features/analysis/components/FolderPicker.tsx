import { useEffect, useState } from "react";
import {
  Alert,
  Anchor,
  Badge,
  Breadcrumbs,
  Button,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconArrowUp, IconBrandGit, IconFolder } from "@tabler/icons-react";
import { analysisApi } from "../api";
import type { DirListing } from "../types";
import classes from "../analysis.module.css";

/** Browses folders of the backend machine (inside ANALYSIS_ROOTS) and returns the chosen absolute path. */
export function FolderPicker(props: {
  opened: boolean;
  initialPath?: string | null;
  title?: string;
  onClose(): void;
  onPick(path: string): void;
}) {
  const [listing, setListing] = useState<DirListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const open = (path?: string | null) => {
    setLoading(true);
    setError(null);
    analysisApi
      .dirs(path ?? undefined)
      .then(setListing)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (props.opened) open(props.initialPath);
  }, [props.opened]);

  const root = listing?.roots.find((r) => listing.path?.startsWith(r));
  const crumbs =
    listing?.path && root
      ? [root, ...listing.path.slice(root.length).split("/").filter(Boolean)]
      : [];

  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title={props.title ?? "Choose a folder"}
      size="lg"
    >
      <Stack gap="xs">
        <Group gap="xs" wrap="nowrap">
          <Button
            size="xs"
            variant="default"
            leftSection={<IconArrowUp size={14} />}
            disabled={!listing?.path}
            onClick={() => open(listing?.parent ?? null)}
          >
            Up
          </Button>
          {listing?.path ? (
            <Breadcrumbs separatorMargin={4} style={{ flexWrap: "wrap" }}>
              {crumbs.map((c, i) => (
                <Anchor
                  key={i}
                  size="xs"
                  onClick={() =>
                    open(
                      [root, ...crumbs.slice(1, i + 1)]
                        .join("/")
                        .replace(/\/+/g, "/"),
                    )
                  }
                >
                  {c}
                </Anchor>
              ))}
            </Breadcrumbs>
          ) : (
            <Text size="xs" c="dimmed">
              Allowed roots (ANALYSIS_ROOTS)
            </Text>
          )}
          {listing?.branch && (
            <Badge
              size="xs"
              variant="light"
              leftSection={<IconBrandGit size={10} />}
            >
              {listing.branch}
            </Badge>
          )}
        </Group>
        {error && (
          <Alert color="red" p="xs">
            {error}
          </Alert>
        )}
        <ScrollArea h={360} type="auto">
          {loading && <Loader size="sm" m="md" />}
          {!loading &&
            listing?.dirs.map((d) => (
              <UnstyledButton
                key={d.path}
                className={classes.dirRow}
                onDoubleClick={() => open(d.path)}
                onClick={() => open(d.path)}
              >
                <IconFolder size={16} />
                <Text size="sm" truncate className={classes.grow}>
                  {d.name}
                </Text>
                {d.git && (
                  <Badge
                    size="xs"
                    variant="light"
                    color="orange"
                    leftSection={<IconBrandGit size={10} />}
                  >
                    {d.branch ?? "git"}
                  </Badge>
                )}
              </UnstyledButton>
            ))}
          {!loading && listing && !listing.dirs.length && (
            <Text size="sm" c="dimmed" p="sm">
              No sub-folders.
            </Text>
          )}
        </ScrollArea>
        <Group justify="space-between">
          <Text size="xs" c="dimmed" truncate maw={420}>
            {listing?.path ?? "Pick a root"}
          </Text>
          <Button
            disabled={!listing?.path}
            onClick={() => listing?.path && props.onPick(listing.path)}
          >
            Use this folder
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
