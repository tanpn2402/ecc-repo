import { AppShell } from "@mantine/core";
import { Outlet } from "react-router-dom";

import { AppHeader } from "@/components/header/AppHeader";
import { NavbarSimple } from "@/components/navigation/NavbarSimple";

import classes from "./AppLayout.module.css";
import { useDisclosure, useLocalStorage, useMediaQuery } from "@mantine/hooks";

const NAVBAR_WIDTH = 240;
const NAVBAR_COLLAPSED_WIDTH = 64;

export function AppLayout() {
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] =
    useDisclosure(false);
  // Desktop only: below the breakpoint the navbar is a full-width drawer.
  const [collapsed, setCollapsed] = useLocalStorage({
    key: "ecc.navbar.collapsed",
    defaultValue: false,
    getInitialValueInEffect: false,
  });
  const isMobile = useMediaQuery("(max-width: 48em)") ?? false;
  const mini = collapsed && !isMobile;

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: mini ? NAVBAR_COLLAPSED_WIDTH : NAVBAR_WIDTH,
        breakpoint: "sm",
        collapsed: {
          mobile: !mobileOpened,
        },
      }}
    >
      <AppShell.Header withBorder={false}>
        <AppHeader mobileOpened={mobileOpened} toggleMobile={toggleMobile} />
      </AppShell.Header>

      <AppShell.Navbar withBorder={false}>
        <NavbarSimple
          onNavigate={closeMobile}
          collapsed={mini}
          onToggleCollapsed={
            isMobile ? undefined : () => setCollapsed((c) => !c)
          }
        />
      </AppShell.Navbar>

      <AppShell.Main className={classes.main}>
        <div className={classes.mainInner}>
          <Outlet />
        </div>
      </AppShell.Main>
    </AppShell>
  );
}
