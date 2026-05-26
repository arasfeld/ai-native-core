import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("popup root element not found");
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
