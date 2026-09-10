import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/inter";
import "./app/global.css";
import App from "./app/App";
import { Provider } from "./app/context";
document.addEventListener("keydown", () =>
  document.documentElement.setAttribute("data-keyboard", ""),
);
document.addEventListener("pointerdown", () =>
  document.documentElement.removeAttribute("data-keyboard"),
);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Provider>
        <App />
      </Provider>
    </BrowserRouter>
  </React.StrictMode>,
);
