import {
  IconDashboard,
  IconGitMerge,
  IconList,
  IconActivity,
  IconSettings,
  IconLogout,
} from "@tabler/icons-react";
import { NavLink } from "react-router-dom";
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
    link: "/settings",
    label: "Settings",
    icon: IconSettings,
  },
];

export function NavbarSimple() {
  const links = data.map((item) => (
    <NavLink
      key={item.label}
      to={item.link}
      end={item.link === "/"}
      className={({ isActive }) =>
        `${classes.link} ${isActive ? classes.active : ""}`
      }
    >
      <item.icon className={classes.linkIcon} size={20} stroke={1.5} />
      <span>{item.label}</span>
    </NavLink>
  ));

  return (
    <nav className={classes.navbar}>
      <div className={classes.navbarMain}>{links}</div>

      <div className={classes.footer}>
        <a
          href="#"
          className={classes.link}
          onClick={(event) => event.preventDefault()}
        >
          <IconLogout className={classes.linkIcon} size={20} stroke={1.5} />
          <span>Logout</span>
        </a>
      </div>
    </nav>
  );
}
