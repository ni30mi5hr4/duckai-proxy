import pino from "pino";

  const isProd = process.env.NODE_ENV === "production";

  export const logger = pino({
    level: process.env.LOG_LEVEL ?? "info",
    redact: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']"],
    ...(isProd ? {} : { transport: { target: "pino-pretty", options: { colorize: true } } }),
  });
  