import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { GitHubSash } from "./ui/GitHubSash";
import "./ui/theme.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <GitHubSash />
  </StrictMode>,
);
