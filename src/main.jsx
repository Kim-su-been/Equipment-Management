import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./woori-theme.css";
import "./workspace-ui.css";
import "./workflow-ui.css";
import "./readyboard-ui.css";
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
