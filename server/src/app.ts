import "dotenv/config";
import express, { type Express } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import logger from "./logging/logger";
import { notesRoute } from "./controllers/note/note.router";
import { deleteExpiredNotes, deleteInterval } from "./tasks/deleteExpiredNotes";

// Initialize middleware clients
export const app: Express = express();

// Exactly one reverse proxy (nginx) sits in front of this service. Without this,
// req.ip is always the proxy's address and the rate limits below end up global
// instead of per client. express-rate-limit v8 also refuses to start otherwise.
app.set("trust proxy", 1);

// Enable JSON body parsing
app.use(express.json({}));

// configure logging
app.use(
  pinoHttp({
    logger: logger,
  })
);

// configure Helmet and CORS
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: process.env.ENVIRONMENT == "dev" ? "cross-origin" : "same-origin",
    },
  })
);

// Mount routes
app.use("/api/note/", notesRoute);

// Run periodic tasks
setInterval(deleteExpiredNotes, deleteInterval);
