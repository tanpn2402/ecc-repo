import { AppShell } from "@mantine/core";
import { Outlet } from "react-router-dom";

import { AppHeader } from "@/components/header/AppHeader";
import { NavbarSimple } from "@/components/navigation/NavbarSimple";

import classes from "./AppLayout.module.css";
import { useDisclosure } from "@mantine/hooks";

export function AppLayout() {
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] =
    useDisclosure(false);

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 240,
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
        <NavbarSimple onNavigate={closeMobile} />
      </AppShell.Navbar>

      <AppShell.Main className={classes.main}>
        <div className={classes.mainInner}>
          <Outlet />
        </div>
      </AppShell.Main>
    </AppShell>
  );
}
