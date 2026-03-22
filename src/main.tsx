/**
 * SPA entry: mount React root and load global Godot-inspired theme.
 */

import "@/styles/godot-theme.css";
import App from "@/App";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const el = document.getElementById("root");
if (!el) {
  throw new Error('Missing #root element');
}

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
