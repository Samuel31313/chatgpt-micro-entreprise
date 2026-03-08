import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import { config } from "../config";

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

const DOC_PROMPTS: Record<string, string> = {
  id_document:
    `Analyse cette image de pièce d'identité pour une création de micro-entreprise.\n` +
    `Vérifie : type valide (CNI, passeport, titre de séjour), lisibilité, expiration.\n` +
    `Extrais : nom, prenom, date_naissance (YYYY-MM-DD), date_expiration (YYYY-MM-DD).\n` +
    `Réponds UNIQUEMENT en JSON :\n` +
    `{"is_valid_type":bool,"is_readable":bool,"is_expired":bool|null,` +
    `"document_type":"cni"|"passeport"|"titre_sejour"|"autre",` +
    `"extracted":{"nom":str|null,"prenom":str|null,"date_naissance":str|null,"date_expiration":str|null},` +
    `"issues":["..."]}`,
  domicile_proof:
    `Analyse ce justificatif de domicile pour une création de micro-entreprise.\n` +
    `Vérifie : type valide (facture, avis d'imposition, quittance), lisibilité, < 3 mois.\n` +
    `Extrais : nom, adresse, date_document (YYYY-MM-DD).\n` +
    `Réponds UNIQUEMENT en JSON :\n` +
    `{"is_valid_type":bool,"is_readable":bool,"is_recent":bool|null,` +
    `"document_type":"facture"|"avis_imposition"|"quittance"|"autre",` +
    `"extracted":{"nom":str|null,"adresse":str|null,"date_document":str|null},` +
    `"issues":["..."]}`,
  non_condamnation:
    `Analyse cette attestation de non-condamnation pour une création de micro-entreprise.\n` +
    `Vérifie : contenu correct, signature présente, identité du déclarant.\n` +
    `Extrais : nom, prenom.\n` +
    `Réponds UNIQUEMENT en JSON :\n` +
    `{"is_valid_type":bool,"is_readable":bool,"is_signed":bool,"has_required_content":bool,` +
    `"extracted":{"nom":str|null,"prenom":str|null},` +
    `"issues":["..."]}`,
};

export interface DocumentValidationResult {
  isValid: boolean;
  issues: string[];
  extracted: Record<string, string | null>;
}

export class DocumentAiService {
  async validateDocument(
    filePath: string,
    mimeType: string,
    docType: string
  ): Promise<DocumentValidationResult> {
    const prompt = DOC_PROMPTS[docType];
    if (!prompt) {
      return { isValid: true, issues: [], extracted: {} };
    }

    const mediaType = this.mapMediaType(mimeType);
    if (!mediaType) {
      return {
        isValid: false,
        issues: ["Format de fichier non supporté. Envoyez une image (JPG, PNG)."],
        extracted: {},
      };
    }

    try {
      const fileBuffer = await fs.readFile(filePath);
      const base64 = fileBuffer.toString("base64");

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      });

      const textContent = response.content.find((c) => c.type === "text");
      if (!textContent || textContent.type !== "text") {
        throw new Error("No text in Claude response");
      }

      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");

      const analysis = JSON.parse(jsonMatch[0]);
      const issues: string[] = analysis.issues || [];
      let isValid = analysis.is_valid_type && analysis.is_readable;

      if (docType === "id_document" && analysis.is_expired) isValid = false;
      if (docType === "domicile_proof" && analysis.is_recent === false) isValid = false;
      if (docType === "non_condamnation" && (!analysis.is_signed || !analysis.has_required_content)) isValid = false;

      return { isValid, issues, extracted: analysis.extracted || {} };
    } catch {
      return {
        isValid: true,
        issues: ["Vérification automatique indisponible — vérification manuelle requise"],
        extracted: {},
      };
    }
  }

  private mapMediaType(
    mimeType: string
  ): "image/jpeg" | "image/png" | "image/webp" | "image/gif" | null {
    const map: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = {
      "image/jpeg": "image/jpeg",
      "image/png": "image/png",
      "image/webp": "image/webp",
      "image/gif": "image/gif",
    };
    return map[mimeType] || null;
  }
}
