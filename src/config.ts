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

  // Chargebee — comptabilité stand-alone (société déjà créée)
  CHARGEBEE_ACCOUNTING_SITE: process.env.CHARGEBEE_ACCOUNTING_SITE || "lp-so-compta",
  CHARGEBEE_ACCOUNTING_API_KEY: process.env.CHARGEBEE_ACCOUNTING_API_KEY || "",
  // Chargebee — compte pro LP Pro
  CHARGEBEE_BANK_SITE: process.env.CHARGEBEE_BANK_SITE || "",
  CHARGEBEE_BANK_API_KEY: process.env.CHARGEBEE_BANK_API_KEY || "",
  /** JSON : { "basique_yearly": "...", "basique_monthly": "...", ..., "opening_fee": "..." } */
  CHARGEBEE_BANK_ITEM_PRICES: parseJsonEnv<Record<string, string>>("CHARGEBEE_BANK_ITEM_PRICES", {}),
  /** JSON : { "<item_price_id du catalogue>": "<item_price_id réel>" } — corrige un ID sans redéployer. */
  CHARGEBEE_ITEM_PRICE_OVERRIDES: parseJsonEnv<Record<string, string>>("CHARGEBEE_ITEM_PRICE_OVERRIDES", {}),
  /** Page d'ouverture LP Pro, utilisée tant que le site Chargebee banque n'est pas configuré. */
  LPPRO_SIGNUP_URL: process.env.LPPRO_SIGNUP_URL || "https://www.legalplace.fr/tarifs/compte-pro",

  // Outil sales (custom checkout)
  SALES_API_KEY: process.env.SALES_API_KEY || "",
  SALES_MANAGER_API_KEY: process.env.SALES_MANAGER_API_KEY || "",
  SALES_CALENDLY_URL:
    process.env.SALES_CALENDLY_URL || "https://calendly.com/d/ck76-r2v-ytt/point-telephonique",
};

function parseJsonEnv<T>(key: string, fallback: T): T {
  const raw = process.env[key];
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Invalid JSON in env var: ${key}`);
  }
}
