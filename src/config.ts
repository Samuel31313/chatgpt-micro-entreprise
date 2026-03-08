import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  PORT: parseInt(process.env.PORT || "3000", 10),
  APP_URL: process.env.APP_URL || "http://localhost:3000",
  NODE_ENV: process.env.NODE_ENV || "development",

  DATABASE_URL: required("DATABASE_URL"),

  STRIPE_SECRET_KEY: required("STRIPE_SECRET_KEY"),
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
  STRIPE_PRICE_CENTS: parseInt(process.env.STRIPE_PRICE_CENTS || "6900", 10),

  INPI_ENV: (process.env.INPI_ENV || "demo") as "demo" | "production",
  INPI_USERNAME: process.env.INPI_USERNAME || "",
  INPI_PASSWORD: process.env.INPI_PASSWORD || "",

  ANTHROPIC_API_KEY: required("ANTHROPIC_API_KEY"),

  GPT_API_KEY: required("GPT_API_KEY"),

  UPLOAD_DIR: process.env.UPLOAD_DIR || "./uploads",
};
