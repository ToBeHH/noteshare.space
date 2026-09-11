// Copy to proxy.js (gitignored) and run with `npm run proxy`, or use `npm run dev`
// to start the webapp, the server and this proxy together.
//
// Serves the whole app on one origin, the way nginx does in production:
//   /api/*  -> the Express server
//   /*      -> the SvelteKit dev server
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();
const PORT = 5000;

app.use(
  "/api",
  createProxyMiddleware({ target: "http://localhost:8080", changeOrigin: true })
);

app.use(
  "/",
  createProxyMiddleware({ target: "http://localhost:5173", changeOrigin: true })
);

app.listen(PORT);
console.log(`Reverse proxy listening at http://localhost:${PORT}`);
