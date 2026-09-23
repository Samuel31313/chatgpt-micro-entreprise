import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { ChargebeeSiteKey, Quote } from "../services/pricing.service";
import { createCheckoutLinks } from "../services/chargebee.service";
import { salesMeetingUrl } from "../services/qualification.service";
import { config } from "../config";
import path from "path";

const prisma = new PrismaClient();
const router = Router();

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const eur = (n: number) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: n % 1 ? 2 : 0 });

const FREQ_LABEL: Record<string, string> = { monthly: "/ mois", yearly: "/ an", one_time: "une fois" };

const BASE_CSS = `
:root{--bg:#f6f7fb;--card:#fff;--text:#111827;--muted:#6b7280;--line:#e5e7eb;--brand:#3b5bdb;--brand-text:#fff;--ok:#0f9d58;--warn:#b45309;--warn-bg:#fef3c7}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0f1115;--card:#171a21;--text:#e5e7eb;--muted:#9ca3af;--line:#2a2f3a;--brand:#748ffc;--brand-text:#0f1115;--ok:#34d399;--warn:#fbbf24;--warn-bg:#3a2e12}}
:root[data-theme="dark"]{--bg:#0f1115;--card:#171a21;--text:#e5e7eb;--muted:#9ca3af;--line:#2a2f3a;--brand:#748ffc;--brand-text:#0f1115;--ok:#34d399;--warn:#fbbf24;--warn-bg:#3a2e12}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:720px;margin:0 auto;padding:32px 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px;margin-bottom:16px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:0 0 12px}.muted{color:var(--muted)}
table{width:100%;border-collapse:collapse}td{padding:10px 0;border-bottom:1px solid var(--line);vertical-align:top}td.r{text-align:right;white-space:nowrap}
.tag{display:inline-block;font-size:12px;padding:2px 8px;border-radius:99px;background:var(--warn-bg);color:var(--warn);margin-top:4px}
.btn{display:block;text-align:center;background:var(--brand);color:var(--brand-text);text-decoration:none;font-weight:600;padding:14px;border-radius:10px;margin-top:10px}
.btn.alt{background:transparent;color:var(--brand);border:1px solid var(--brand)}
.total{font-size:20px;font-weight:700}.note{background:var(--warn-bg);color:var(--warn);padding:12px 14px;border-radius:10px}
`;

function page(title: string, body: string) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${BASE_CSS}</style></head><body><div class="wrap">${body}</div></body></html>`;
}

/**
 * GET /offre/:slug
 * Page client du custom checkout : récapitulatif de l'offre et boutons de paiement.
 */
router.get("/offre/:slug", async (req: Request, res: Response) => {
  const offer = await prisma.customOffer.findUnique({ where: { slug: String(req.params.slug) } });
  if (!offer) {
    res.status(404).send(page("Offre introuvable", `<div class="card"><h1>Offre introuvable</h1><p class="muted">Ce lien n'est pas valide. Contactez votre conseiller LegalPlace.</p></div>`));
    return;
  }

  const quote: Quote = JSON.parse(offer.quote);
  const expired = offer.expiresAt < new Date();
  const fullName = [offer.firstName, offer.lastName].filter(Boolean).join(" ");
  const meeting = salesMeetingUrl({ name: fullName, email: offer.email, summary: `Offre ${offer.slug}` });
  const paid = typeof req.query.paid === "string" ? req.query.paid : null;

  const rows = quote.lines
    .map(
      (l) => `<tr><td>${esc(l.label)}${l.discount ? `<br><span class="tag">${esc(l.discount.label)}</span>` : ""}</td>
      <td class="r">${l.discount ? `<s class="muted">${eur(l.unitPrice * l.quantity)}</s><br>` : ""}${eur(l.firstInvoiceHt)} <span class="muted">${FREQ_LABEL[l.frequency]}</span></td></tr>`
    )
    .join("");

  const sites = (["accounting", "bank"] as ChargebeeSiteKey[]).filter((s) => quote.lines.some((l) => l.site === s));
  const siteLabel: Record<ChargebeeSiteKey, string> = { accounting: "Payer ma comptabilité", bank: "Ouvrir mon compte pro" };

  let actions: string;
  if (offer.status === "pending_approval") {
    actions = `<p class="note">Votre offre est en cours de validation par notre équipe. Vous recevrez une confirmation très vite.</p>`;
  } else if (offer.status === "rejected" || expired) {
    actions = `<p class="note">Cette offre n'est plus disponible. Reprenez rendez-vous avec votre conseiller pour en obtenir une nouvelle.</p>`;
  } else {
    actions = sites
      .map((s) =>
        paid === s
          ? `<p class="btn alt">✓ ${esc(siteLabel[s])} — paiement reçu</p>`
          : `<a class="btn" href="/offre/${esc(offer.slug)}/payer/${s}">${esc(siteLabel[s])} — ${quote.totals.bySite[s].firstInvoiceTtc > 0 ? `${eur(quote.totals.bySite[s].firstInvoiceTtc)} TTC` : "offert la 1re année"}</a>`
      )
      .join("");
    if (sites.length > 1) {
      actions += `<p class="muted" style="margin-top:12px">La comptabilité et le compte pro sont deux abonnements distincts : un paiement pour chacun.</p>`;
    }
  }

  res.send(
    page(
      "Votre offre LegalPlace",
      `<div class="card">
        <p class="muted" style="margin:0">Offre personnalisée${offer.companyName ? ` pour ${esc(offer.companyName)}` : ""}</p>
        <h1>Bonjour ${esc(offer.firstName || "")} 👋</h1>
        ${offer.message ? `<p>${esc(offer.message).replace(/\n/g, "<br>")}</p>` : ""}
        <p class="muted">Proposée par ${esc(offer.salesName || offer.salesEmail)} · valable jusqu'au ${offer.expiresAt.toLocaleDateString("fr-FR")}</p>
      </div>
      <div class="card"><h2>Votre offre</h2><table>${rows}</table>
        <p style="display:flex;justify-content:space-between;margin:16px 0 0"><span>1re échéance</span><span class="total">${eur(quote.totals.firstInvoiceHt)} HT</span></p>
        <p class="muted" style="margin:4px 0 0;text-align:right">${eur(quote.totals.firstInvoiceTtc)} TTC · 1re année : ${eur(quote.totals.firstYearHt)} HT</p>
      </div>
      <div class="card">${actions}<a class="btn alt" href="${esc(meeting)}" target="_blank" rel="noopener">Une question ? Reprendre RDV avec mon conseiller</a></div>`
    )
  );
});

/**
 * GET /offre/:slug/payer/:site
 * Génère le lien Chargebee au moment du clic (les hosted pages API expirent) et redirige.
 */
router.get("/offre/:slug/payer/:site", async (req: Request, res: Response) => {
  const site = String(req.params.site) as ChargebeeSiteKey;
  const offer = await prisma.customOffer.findUnique({ where: { slug: String(req.params.slug) } });
  if (!offer || (site !== "accounting" && site !== "bank")) {
    res.status(404).send(page("Offre introuvable", `<div class="card"><h1>Lien invalide</h1></div>`));
    return;
  }
  if (offer.status !== "sent" || offer.expiresAt < new Date()) {
    res.redirect(`/offre/${offer.slug}`);
    return;
  }

  const quote: Quote = JSON.parse(offer.quote);
  const [link] = await createCheckoutLinks(
    quote,
    {
      email: offer.email,
      firstName: offer.firstName || undefined,
      lastName: offer.lastName || undefined,
      phone: offer.phone || undefined,
      company: offer.companyName || undefined,
    },
    { onlySite: site, redirectUrl: `${config.APP_URL}/offre/${offer.slug}?paid=${site}`, reference: `custom_offer:${offer.slug}` }
  );

  if (link?.url) {
    res.redirect(link.url);
    return;
  }
  console.error(`[custom-offer ${offer.slug}] lien ${site} indisponible : ${link?.error}`);
  res.status(502).send(
    page(
      "Paiement indisponible",
      `<div class="card"><h1>Paiement momentanément indisponible</h1><p class="muted">Votre conseiller a été prévenu et vous recontacte rapidement.</p>
      <a class="btn alt" href="/offre/${esc(offer.slug)}">Retour à mon offre</a></div>`
    )
  );
});

/** GET /sales — outil de création de custom checkout (la clé sales est demandée dans la page). */
router.get("/sales", (_req: Request, res: Response) => {
  res.sendFile("sales.html", { root: path.join(__dirname, "../../public") });
});

export default router;
