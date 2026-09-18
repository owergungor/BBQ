import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.tsx";
import { bootstrapWidgets } from "./island/bootstrapWidgets.ts";
import "./styles/index.css";

// Deterministically register all HUD widgets before React tree mounts
bootstrapWidgets();

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
