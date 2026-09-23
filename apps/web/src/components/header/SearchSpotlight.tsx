import { useAtom } from "jotai";
import { Modal, TextInput, Kbd, Group } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { globalFilterAtom } from "@/atoms/searchAtom";
import { useDebounceCallback, useDebounceValue } from "usehooks-ts";
import { useEffect, useState } from "react";

interface SearchSpotlightProps {
  opened: boolean;
  onClose: () => void;
}

export function SearchSpotlight({ opened, onClose }: SearchSpotlightProps) {
  const [{ value: defaultValue }, setGlobalFilter] = useAtom(globalFilterAtom);

  const debounced = useDebounceCallback(
    (value) =>
      setGlobalFilter({
        value,
        triggered: true,
      }),
    500,
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="xl"
      padding={0}
      withCloseButton={false}
      radius="md"
      overlayProps={{
        backgroundOpacity: 0,
        blur: 0,
      }}
      styles={{
        content: {
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.22)",
          border: "1px solid var(--mantine-color-default-border)",
        },
      }}
    >
      <TextInput
        autoFocus
        defaultValue={defaultValue}
        onChange={(event) => debounced(event.currentTarget.value)}
        placeholder=""
        leftSection={<IconSearch size={20} />}
        rightSection={
          <Group gap={4} wrap="nowrap">
            <Kbd size="xs">ESC</Kbd>
          </Group>
        }
        rightSectionWidth={50}
        size="lg"
        variant="unstyled"
        px="md"
        py="sm"
      />
    </Modal>
  );
}
