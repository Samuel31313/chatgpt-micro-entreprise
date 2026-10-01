import axios from "axios";

const LEGALPLACE_API = "https://clear-api.legalplace.fr/api/v1";
const MICRO_SLUG = "creez-votre-micro-entreprise";

export interface MicroEntrepriseInstance {
  uniqid: string;
  url: string;
}

export class LegalPlaceService {
  /**
   * Creates a micro-entreprise instance on LegalPlace for the given account email.
   * `metadata` is attached to the instance so the dossier can be traced back.
   */
  async createMicroEntreprise(
    email: string,
    metadata: Record<string, unknown> = {}
  ): Promise<MicroEntrepriseInstance> {
    const { data } = await axios.post(
      `${LEGALPLACE_API}/wizard/instance/${MICRO_SLUG}/`,
      {
        app_type: "wizardx",
        instanceDomain: "www.legalplace.fr",
        draft: 1,
        email,
        metadata: {
          checkout: "packs",
          checkoutSlug: MICRO_SLUG,
          ...metadata,
        },
        ovc: {
          o: {},
          v: {},
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "lp-referrer": "https://www.legalplace.fr/",
          "lp-origin": `https://www.legalplace.fr/projet/${MICRO_SLUG}`,
        },
        timeout: 20000,
      }
    );

    if (data.status !== "SUCCESS" || !data.uniqid) {
      throw new Error("LegalPlace n'a pas retourné d'identifiant d'instance.");
    }

    const encodedEmail = encodeURIComponent(email);
    return {
      uniqid: data.uniqid,
      url: `https://www.legalplace.fr/creation/checkout/${MICRO_SLUG}/packs?email=${encodedEmail}&uniqid=${data.uniqid}&product=${MICRO_SLUG}`,
    };
  }
}

export function formatLegalPlaceError(error: any): string {
  return error.response
    ? `LegalPlace (${error.response.status}): ${JSON.stringify(error.response.data)}`
    : error.message;
}
