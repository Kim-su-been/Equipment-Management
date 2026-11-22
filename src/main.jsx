import React from "react";
import { createRoot } from "react-dom/client";
import App from "./AppRoot.jsx";
import "./styles.css";
import "./woori-theme.css";
import "./workspace-ui.css";
import "./workflow-ui.css";
import "./readyboard-ui.css";
import "./server-ui.css";
import "./mail-ui.css";
import "./work-ui.css";
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
