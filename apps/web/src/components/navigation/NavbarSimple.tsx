import { Tooltip } from "@mantine/core";
import {
  IconActivity,
  IconBrain,
  IconDashboard,
  IconGitMerge,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconList,
  IconLogout,
  IconSettings,
} from "@tabler/icons-react";
import { NavLink } from "react-router-dom";

import { ClaudeUsage } from "../claude-usage/ClaudeUsage";

import classes from "./NavbarSimple.module.css";

const data = [
  {
    link: "/",
    label: "Dashboard",
    icon: IconDashboard,
  },
  {
    link: "/issues",
    label: "Issues",
    icon: IconList,
  },
  {
    link: "/gitlab-activities",
    label: "GitLab Activities",
    icon: IconActivity,
  },
  {
    link: "/merge-requests",
    label: "Merge Requests",
    icon: IconGitMerge,
  },
  {
    link: "/analysis",
    label: "Analysis",
    icon: IconBrain,
  },
  {
    link: "/settings",
    label: "Settings",
    icon: IconSettings,
  },
];

interface NavbarSimpleProps {
  onNavigate?: () => void;
  /** Icon-only rail; labels move to tooltips. */
  collapsed?: boolean;
  /** Shows the collapse/expand button when set (desktop only). */
  onToggleCollapsed?: () => void;
}

/** A tooltip on the right that only exists while the rail is collapsed. */
function RailTip(props: {
  label: string;
  collapsed: boolean;
  children: React.ReactElement;
}) {
  return (
    <Tooltip
      label={props.label}
      position="right"
      withArrow
      disabled={!props.collapsed}
      openDelay={150}
    >
      {props.children}
    </Tooltip>
  );
}

export function NavbarSimple({
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: NavbarSimpleProps) {
  const links = data.map((item) => (
    <RailTip key={item.label} label={item.label} collapsed={collapsed}>
      <NavLink
        to={item.link}
        end={item.link === "/"}
        onClick={onNavigate}
        aria-label={collapsed ? item.label : undefined}
        // a static class: Tooltip merges className and would break NavLink's function form;
        // the active style keys off aria-current, which NavLink sets.
        className={classes.link}
      >
        <item.icon className={classes.linkIcon} size={20} stroke={1.5} />

        <span className={classes.label}>{item.label}</span>
      </NavLink>
    </RailTip>
  ));

  const ToggleIcon = collapsed
    ? IconLayoutSidebarLeftExpand
    : IconLayoutSidebarLeftCollapse;

  return (
    <nav className={classes.navbar} data-collapsed={collapsed || undefined}>
      <div className={classes.navbarMain}>{links}</div>

      <div className={classes.footer}>
        <ClaudeUsage compact={collapsed} />

        <RailTip label="Logout" collapsed={collapsed}>
          <a
            href="#"
            className={classes.link}
            aria-label={collapsed ? "Logout" : undefined}
            onClick={(event) => {
              event.preventDefault();
            }}
          >
            <IconLogout className={classes.linkIcon} size={20} stroke={1.5} />

            <span className={classes.label}>Logout</span>
          </a>
        </RailTip>

        {onToggleCollapsed && (
          <RailTip label="Expand sidebar" collapsed={collapsed}>
            <button
              type="button"
              className={classes.link}
              onClick={onToggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
            >
              <ToggleIcon className={classes.linkIcon} size={20} stroke={1.5} />

              <span className={classes.label}>Collapse</span>
            </button>
          </RailTip>
        )}
      </div>
    </nav>
  );
}
