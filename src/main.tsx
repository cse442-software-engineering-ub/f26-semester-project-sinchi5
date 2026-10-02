import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import "@fontsource-variable/inter";
import "./app/global.css";
import App from "./app/App";
import { Provider } from "./app/context";
// Shared hosts without SPA rewrites need routes in the URL fragment.
// BASE_URL still locates assets and the PHP API outside that fragment.
const hashRouting = import.meta.env.VITE_ROUTER_MODE === "hash";
const Router = hashRouting ? HashRouter : BrowserRouter;
document.addEventListener("keydown", () =>
  document.documentElement.setAttribute("data-keyboard", ""),
);
document.addEventListener("pointerdown", () =>
  document.documentElement.removeAttribute("data-keyboard"),
);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router basename={hashRouting ? "/" : import.meta.env.BASE_URL}>
      <Provider>
        <App />
      </Provider>
    </Router>
  </React.StrictMode>,
);
