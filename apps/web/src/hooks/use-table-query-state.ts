import {
  type MRT_ColumnFiltersState,
  type MRT_DensityState,
  type MRT_ExpandedState,
  type MRT_GroupingState,
  type MRT_SortingState,
  type MRT_VisibilityState,
} from "@repo/mantine-table";
import { useSearchParams } from "react-router-dom";

export interface TableQueryState {
  grouping: MRT_GroupingState;
  sorting: MRT_SortingState;
  columnFilters: MRT_ColumnFiltersState;
  globalFilter: string;
  columnVisibility: MRT_VisibilityState;
  density: MRT_DensityState;
  expanded: MRT_ExpandedState;
  isFullScreen: boolean;
}

const DEFAULT_STATE: TableQueryState = {
  grouping: [],
  sorting: [],
  columnFilters: [],
  globalFilter: "",
  columnVisibility: {},
  density: "md",
  expanded: {},
  isFullScreen: false,
};

const QUERY_KEYS: Record<keyof TableQueryState, string> = {
  grouping: "grouping",
  sorting: "sort",
  columnFilters: "filter",
  globalFilter: "search",
  columnVisibility: "hidden-columns",
  density: "density",
  expanded: "expanded",
  isFullScreen: "fs",
};

function parseJson<T>(value: string | null, fallback: T): T {
  if (value === null) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseHiddenColumns(
  value: string | null,
  fallback: MRT_VisibilityState,
): MRT_VisibilityState {
  // Query param does not exist.
  // Use the configured default.
  if (value === null) {
    return fallback;
  }

  // Query param exists but is empty.
  // Explicitly means: no hidden columns.
  if (value === "") {
    return {};
  }

  return Object.fromEntries(
    value
      .split(",")
      .map((column) => column.trim())
      .filter(Boolean)
      .map((column) => [column, false]),
  );
}

function serializeHiddenColumns(visibility: MRT_VisibilityState): string {
  return Object.entries(visibility)
    .filter(([, visible]) => visible === false)
    .map(([column]) => column)
    .join(",");
}

export function useTableQueryState(defaults: Partial<TableQueryState> = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const defaultState: TableQueryState = {
    ...DEFAULT_STATE,
    ...defaults,
  };

  const state: TableQueryState = {
    grouping: parseJson(
      searchParams.get(QUERY_KEYS.grouping),
      defaultState.grouping,
    ),

    sorting: parseJson(
      searchParams.get(QUERY_KEYS.sorting),
      defaultState.sorting,
    ),

    columnFilters: parseJson(
      searchParams.get(QUERY_KEYS.columnFilters),
      defaultState.columnFilters,
    ),

    globalFilter:
      searchParams.get(QUERY_KEYS.globalFilter) ?? defaultState.globalFilter,

    columnVisibility: parseHiddenColumns(
      searchParams.get(QUERY_KEYS.columnVisibility),
      defaultState.columnVisibility,
    ),

    density:
      (searchParams.get(QUERY_KEYS.density) as MRT_DensityState | null) ??
      defaultState.density,

    expanded: parseJson(
      searchParams.get(QUERY_KEYS.expanded),
      defaultState.expanded,
    ),

    isFullScreen: searchParams.get(QUERY_KEYS.isFullScreen) === "true",
  };

  const update = <K extends keyof TableQueryState>(
    key: K,
    value: TableQueryState[K],
  ) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        const queryKey = QUERY_KEYS[key];

        switch (key) {
          case "columnVisibility": {
            const hiddenColumns = serializeHiddenColumns(
              value as MRT_VisibilityState,
            );

            // Keep an empty parameter instead of deleting it.
            //
            // Missing:
            //   use default
            //
            // Empty:
            //   explicitly show all columns
            if (hiddenColumns) {
              next.set(queryKey, hiddenColumns);
            } else {
              next.set(queryKey, "");
            }

            break;
          }

          case "globalFilter": {
            const search = value as string;

            if (search) {
              next.set(queryKey, search);
            } else {
              // For string state, missing and empty are equivalent.
              next.delete(queryKey);
            }

            break;
          }

          case "density": {
            next.set(queryKey, value as string);
            break;
          }

          case "isFullScreen": {
            const fullscreen = value as boolean;

            if (fullscreen) {
              next.set(queryKey, "true");
            } else {
              next.delete(queryKey);
            }

            break;
          }

          default: {
            // IMPORTANT:
            //
            // Do NOT delete [] or {}.
            //
            // Example:
            //   sort=[]
            //
            // means the user explicitly cleared sorting.
            next.set(queryKey, JSON.stringify(value));

            break;
          }
        }

        return next;
      },
      {
        replace: true,
      },
    );
  };

  const createSetter =
    <K extends keyof TableQueryState>(key: K) =>
    (
      updater:
        TableQueryState[K] | ((prev: TableQueryState[K]) => TableQueryState[K]),
    ) => {
      const previous = state[key];

      const next =
        typeof updater === "function"
          ? (updater as (prev: TableQueryState[K]) => TableQueryState[K])(
              previous,
            )
          : updater;

      update(key, next);
    };

  const setGrouping = createSetter("grouping");
  const setSorting = createSetter("sorting");
  const setColumnFilters = createSetter("columnFilters");
  const setGlobalFilter = createSetter("globalFilter");
  const setColumnVisibility = createSetter("columnVisibility");
  const setDensity = createSetter("density");
  const setExpanded = createSetter("expanded");
  const setIsFullScreen = createSetter("isFullScreen");

  return {
    state,

    setGrouping,
    setSorting,
    setColumnFilters,
    setGlobalFilter,
    setColumnVisibility,
    setDensity,
    setExpanded,
    setIsFullScreen,
  };
}
