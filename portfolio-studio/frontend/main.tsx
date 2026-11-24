import "@mantine/core/styles.css";
import { createTheme, MantineProvider, Tooltip } from "@mantine/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";

// One theme controls every panel and instant tooltip; color scheme follows the user's saved preference.
const studioTheme = createTheme({
  components: {
    Tooltip: Tooltip.extend({
      defaultProps: {
        openDelay: 0,
        closeDelay: 0,
        transitionProps: { duration: 0 },
        events: { hover: true, focus: true, touch: false },
      },
      styles: {
        tooltip: {
          backgroundColor: "var(--mantine-color-default)",
          color: "var(--mantine-color-text)",
          border: "1px solid var(--mantine-color-default-border)",
          boxShadow: "var(--mantine-shadow-sm)",
        },
      },
    }),
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="auto" theme={studioTheme}>
      <App />
    </MantineProvider>
  </StrictMode>,
);
