import express from "express";
import cors from "cors";
import { config } from "./config";
import { authenticateGPT } from "./middleware/auth";
import dossierRoutes from "./routes/dossier.routes";
import documentRoutes from "./routes/document.routes";
import paymentRoutes from "./routes/payment.routes";
import inpiRoutes from "./routes/inpi.routes";
import nafRoutes from "./routes/naf.routes";
import sasuRoutes from "./routes/sasu.routes";
import microEntrepriseRoutes from "./routes/micro-entreprise.routes";
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
app.use("/api/sasu", authenticateGPT, sasuRoutes);
app.use("/api/micro-entreprise", authenticateGPT, microEntrepriseRoutes);

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

// Privacy policy (required for public GPT with Actions)
app.get("/privacy", (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="utf-8"><title>Politique de confidentialité — Créer ma Micro-Entreprise</title></head>
    <body style="font-family:system-ui;max-width:700px;margin:40px auto;padding:0 20px;line-height:1.6">
      <h1>Politique de confidentialité</h1>
      <p><strong>Service :</strong> Créer ma Micro-Entreprise (GPT ChatGPT)</p>
      <p><strong>Dernière mise à jour :</strong> 8 mars 2026</p>

      <h2>Données collectées</h2>
      <p>Ce service collecte les informations nécessaires à la création de votre micro-entreprise en France :</p>
      <ul>
        <li>Identité (nom, prénom, date et lieu de naissance, nationalité)</li>
        <li>Adresse de domiciliation de l'entreprise</li>
        <li>Description de l'activité professionnelle</li>
        <li>Documents justificatifs (pièce d'identité, justificatif de domicile, attestation)</li>
        <li>Options fiscales choisies (ACRE, versement libératoire)</li>
      </ul>

      <h2>Utilisation des données</h2>
      <p>Vos données sont utilisées exclusivement pour :</p>
      <ul>
        <li>Constituer votre dossier de création de micro-entreprise</li>
        <li>Soumettre votre déclaration au Guichet Unique de l'INPI</li>
        <li>Traiter votre paiement via Stripe</li>
      </ul>

      <h2>Partage des données</h2>
      <p>Vos données sont transmises uniquement à :</p>
      <ul>
        <li><strong>INPI</strong> — pour l'immatriculation de votre entreprise</li>
        <li><strong>Stripe</strong> — pour le traitement sécurisé du paiement</li>
      </ul>
      <p>Aucune donnée n'est vendue ni partagée à des tiers à des fins commerciales.</p>

      <h2>Conservation</h2>
      <p>Vos données sont conservées pendant la durée nécessaire au traitement de votre dossier, puis supprimées sous 12 mois après finalisation.</p>

      <h2>Contact</h2>
      <p>Pour toute question relative à vos données personnelles, contactez-nous à l'adresse indiquée sur la page du GPT.</p>
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
