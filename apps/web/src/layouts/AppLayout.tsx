import { AppShell } from '@mantine/core';
import { Outlet } from 'react-router-dom';
import { NavbarSimple } from '@/components/navigation/NavbarSimple';
import { AppHeader } from '@/components/header/AppHeader';

import classes from './AppLayout.module.css';

export function AppLayout() {
  return (
    <AppShell
      navbar={{
        width: 240,
        breakpoint: 'sm',
      }}
      header={{ height: 60 }}
    >
      <AppShell.Header withBorder={false}>
        <AppHeader />
      </AppShell.Header>

      <AppShell.Navbar withBorder={false}>
        <NavbarSimple />
      </AppShell.Navbar>

      <AppShell.Main className={classes.main} >
        <div className={classes.mainInner}>
          <Outlet />
        </div>
      </AppShell.Main>
    </AppShell>
  );
}