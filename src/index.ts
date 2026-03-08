import express from "express";
import cors from "cors";
import { config } from "./config";
import { authenticateGPT } from "./middleware/auth";
import dossierRoutes from "./routes/dossier.routes";
import documentRoutes from "./routes/document.routes";
import paymentRoutes from "./routes/payment.routes";
import inpiRoutes from "./routes/inpi.routes";
import nafRoutes from "./routes/naf.routes";
import stripeWebhookRoutes from "./routes/stripe.webhook";

const app = express();

// CORS — allow OpenAI GPT Actions to call this API
app.use(
  cors({
    origin: [
      "https://chat.openai.com",
      "https://chatgpt.com",
      "https://platform.openai.com",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Stripe webhook needs raw body — must be before express.json()
app.use(
  "/webhook/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhookRoutes
);

// JSON parsing for all other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check (no auth required)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "chatgpt-micro-entreprise-api" });
});

// OpenAPI spec serving (no auth required — needed for GPT Actions setup)
app.get("/openapi.json", (_req, res) => {
  res.sendFile("openapi.json", { root: __dirname + "/.." });
});

// All API routes require GPT API key authentication
app.use("/api/dossier", authenticateGPT, dossierRoutes);
app.use("/api/document", authenticateGPT, documentRoutes);
app.use("/api/payment", authenticateGPT, paymentRoutes);
app.use("/api/inpi", authenticateGPT, inpiRoutes);
app.use("/api/naf", authenticateGPT, nafRoutes);

// Payment success/cancel pages
app.get("/payment-success", (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="utf-8"><title>Paiement confirmé</title></head>
    <body style="font-family:system-ui;text-align:center;padding:60px 20px">
      <h1>Paiement confirmé !</h1>
      <p>Votre paiement a été accepté. Retournez sur ChatGPT pour finaliser la soumission de votre dossier à l'INPI.</p>
    </body>
    </html>
  `);
});

app.get("/payment-cancel", (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="utf-8"><title>Paiement annulé</title></head>
    <body style="font-family:system-ui;text-align:center;padding:60px 20px">
      <h1>Paiement annulé</h1>
      <p>Vous avez annulé le paiement. Retournez sur ChatGPT si vous souhaitez réessayer.</p>
    </body>
    </html>
  `);
});

app.listen(config.PORT, () => {
  console.log(`API server running on port ${config.PORT}`);
  console.log(`OpenAPI spec available at ${config.APP_URL}/openapi.json`);
});
