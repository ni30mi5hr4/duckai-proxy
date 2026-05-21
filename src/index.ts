import app from "./app.js";
  import { logger } from "./lib/logger.js";

  const port = Number(process.env["PORT"] ?? "3000");

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT: "${process.env["PORT"]}"`);
  }

  app.listen(port, () => {
    logger.info({ port }, `Server listening → http://localhost:${port}/v1`);
  });
  