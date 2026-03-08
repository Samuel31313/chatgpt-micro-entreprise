import axios, { AxiosInstance } from "axios";
import fs from "fs";
import FormData from "form-data";
import { config } from "../config";
import { Dossier, Document } from "@prisma/client";

type DossierWithDocs = Dossier & { documents: Document[] };

export class InpiService {
  private baseUrl: string;
  private jwtToken: string | null = null;
  private cookie: string | null = null;
  private client: AxiosInstance;

  constructor() {
    this.baseUrl =
      config.INPI_ENV === "demo"
        ? "https://guichet-unique-demo.inpi.fr"
        : "https://procedures.inpi.fr";

    this.client = axios.create({ baseURL: this.baseUrl });
  }

  async authenticate(): Promise<void> {
    const resp = await this.client.post("/api/accounts/login", {
      username: config.INPI_USERNAME,
      password: config.INPI_PASSWORD,
    });

    this.jwtToken = resp.data.token;
    this.cookie = resp.headers["set-cookie"]?.join("; ") || null;
  }

  async createFormalite(dossier: DossierWithDocs): Promise<string> {
    await this.ensureAuth();

    const payload = this.buildPayload(dossier);
    const resp = await this.apiCall("POST", "/api/formalities", payload);
    return resp.data.id || resp.data.formality_id;
  }

  async uploadAttachment(formaliteId: string, doc: Document): Promise<void> {
    await this.ensureAuth();

    if (!doc.filePath) throw new Error("Document has no file path");

    const formData = new FormData();
    formData.append("file", fs.createReadStream(doc.filePath), {
      filename: doc.fileName || `${doc.type}.jpg`,
      contentType: doc.mimeType || "image/jpeg",
    });
    formData.append("type_document", this.mapDocType(doc.type));

    await this.apiCall(
      "POST",
      `/api/formalities/${formaliteId}/uploads`,
      formData,
      formData.getHeaders()
    );
  }

  async signAndSubmit(formaliteId: string): Promise<void> {
    await this.ensureAuth();
    await this.apiCall("POST", `/api/formalities/${formaliteId}/validate`);
    await this.apiCall("POST", `/api/formalities/${formaliteId}/sign`, {
      signature_type: "simple",
    });
    await this.apiCall("POST", `/api/formalities/${formaliteId}/payment`, {
      payment_type: "CB",
    });
  }

  async getStatus(formaliteId: string): Promise<{ status: string; siret?: string }> {
    await this.ensureAuth();
    const resp = await this.apiCall("GET", `/api/formalities/${formaliteId}`);
    return {
      status: resp.data.status || resp.data.diffusion_status || "unknown",
      siret: resp.data.siren
        ? `${resp.data.siren}${resp.data.nic || ""}`
        : undefined,
    };
  }

  async submitFormalite(dossier: DossierWithDocs): Promise<string> {
    const formaliteId = await this.createFormalite(dossier);

    for (const doc of dossier.documents) {
      if (doc.status === "valid" && doc.filePath) {
        await this.uploadAttachment(formaliteId, doc);
      }
    }

    await this.signAndSubmit(formaliteId);
    return formaliteId;
  }

  private buildPayload(dossier: DossierWithDocs): object {
    return {
      content: {
        nature_creation: {
          type_formalite: "CREATION",
          indicateur_micro_entrepreneur: true,
        },
        personne_physique: {
          identite: {
            nom_naissance: dossier.lastName,
            prenoms: dossier.firstName,
            date_naissance: dossier.dateOfBirth,
            lieu_naissance: dossier.placeOfBirth,
            nationalite:
              dossier.nationality === "francaise" ? "FRA" : dossier.nationality,
          },
        },
        activite: {
          type_activite: dossier.activityType?.toUpperCase(),
          description_activite: dossier.activityDesc,
          code_ape: dossier.nafCode,
        },
        adresse_entreprise: {
          adresse: dossier.enterpriseAddr,
        },
        options_fiscales_sociales: {
          option_acre: dossier.acreOption,
          option_versement_liberatoire: dossier.versementLib,
        },
      },
    };
  }

  private mapDocType(type: string): string {
    switch (type) {
      case "id_document":
        return "PIECE_IDENTITE";
      case "domicile_proof":
        return "JUSTIFICATIF_DOMICILE";
      case "non_condamnation":
        return "ATTESTATION_NON_CONDAMNATION";
      default:
        return "AUTRE";
    }
  }

  private async ensureAuth(): Promise<void> {
    if (!this.jwtToken) await this.authenticate();
  }

  private async apiCall(
    method: string,
    path: string,
    data?: unknown,
    extraHeaders?: Record<string, string>
  ) {
    try {
      return await this.client.request({
        method,
        url: path,
        data,
        headers: {
          Authorization: `Bearer ${this.jwtToken}`,
          ...(this.cookie ? { Cookie: this.cookie } : {}),
          ...extraHeaders,
        },
      });
    } catch (error: any) {
      if (error.response?.status === 401) {
        await this.authenticate();
        return this.client.request({
          method,
          url: path,
          data,
          headers: {
            Authorization: `Bearer ${this.jwtToken}`,
            ...(this.cookie ? { Cookie: this.cookie } : {}),
            ...extraHeaders,
          },
        });
      }
      throw error;
    }
  }
}
