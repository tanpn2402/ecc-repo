import { createRoot } from "react-dom/client";
import "./style.css";
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import { AppLayout } from "./layouts/AppLayout";
import { Issues } from "./pages/Issues";
import { Dashboard } from "./pages/Dashboard";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import {
  MantineProvider,
  createTheme,
  MantineColorsTuple,
} from "@mantine/core";
import { NotFound } from "./pages/NotFound";
import { createStore, Provider } from "jotai";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GitlabActivities } from "./pages/GitlabActivities";
import { useSocket } from "./hooks/use-socket";

const store = createStore();

const queryClient = new QueryClient();

const myColor: MantineColorsTuple = [
  "#e6ffee",
  "#d3f9e0",
  "#a8f2c0",
  "#7aea9f",
  "#54e382",
  "#3bdf70",
  "#2bdd66",
  "#1bc455",
  "#0bae4a",
  "#00973c",
];

const theme = createTheme({
  colors: {
    myColor,
  },
  primaryColor: "myColor",
});

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      {
        path: "/",
        element: <Dashboard />,
      },
      {
        path: "/issues",
        element: <Issues />,
      },
      {
        path: "/gitlab-activities",
        element: <GitlabActivities />,
      },
      {
        path: "*",
        element: <NotFound />,
      },
    ],
  },
]);

const Main = () => {
  useSocket();
  return <RouterProvider router={router} />;
}

const App = () => (
  <MantineProvider theme={theme} defaultColorScheme="dark">
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <Main />
      </Provider>
    </QueryClientProvider>
  </MantineProvider>
);

createRoot(document.getElementById("app")!).render(<App />);
