import Stripe from "stripe";
import { config } from "../config";

const stripe = new Stripe(config.STRIPE_SECRET_KEY);

export class StripeService {
  async createCheckoutSession(
    dossierId: string,
    customerName: string
  ): Promise<{ url: string; sessionId: string }> {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: config.STRIPE_PRICE_CENTS,
            product_data: {
              name: "Création micro-entreprise",
              description: `Inscription micro-entreprise pour ${customerName}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: { dossier_id: dossierId },
      success_url: `${config.APP_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.APP_URL}/payment-cancel`,
    });

    return { url: session.url!, sessionId: session.id };
  }

  async getSessionStatus(sessionId: string): Promise<string> {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return session.payment_status; // "paid" | "unpaid" | "no_payment_required"
  }

  verifyWebhookSignature(body: Buffer, signature: string): Stripe.Event {
    return stripe.webhooks.constructEvent(
      body,
      signature,
      config.STRIPE_WEBHOOK_SECRET
    );
  }
}
