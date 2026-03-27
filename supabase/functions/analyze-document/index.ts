// ============================================
// Edge Function: analyze-document
// OpenRouter → Gemini 2.5 Pro — Prompt FR Construction + Line Items
// Deploy: supabase functions deploy analyze-document --project-ref wvopuqyotvwgronujvrb
// Secret: OPENROUTER_API_KEY
// ============================================

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const API_TIMEOUT_MS = 120_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_PROMPT = `# RÔLE
Tu es un COMPTABLE SENIOR spécialisé dans le secteur du BÂTIMENT et de la CONSTRUCTION en France. Ton objectif est d'extraire avec une précision chirurgicale les données de documents financiers pour l'entreprise "LGM".

# OBJECTIF
Traiter des images/PDFs de factures et renvoyer un JSON structuré pour la classification des coûts, en garantissant qu'aucune donnée n'est perdue.

# VALIDATION INITIALE (CRITIQUE)
Avant tout, vérifie si l'image/document est réellement une FACTURE, REÇU ou document financier valide.
- Photo de personne, selfie, paysage, objet aléatoire, mème → is_valid_document = false
- Document financier lisible (facture, reçu, avoir) → is_valid_document = true
- Document mais illisible/très flou → is_valid_document = false, rejection_reason = "document_illisible"

# RÈGLES DE CLASSIFICATION (CRITIQUE)

1. TYPE DE DOCUMENT (document_type):
   - "facture": Justificatif de dépense fiscale
   - "avoir": Note de crédit (réduction de valeur)
   - "recu": Justificatif de paiement
   - "autre": Documents non fiscaux

2. TYPE DE COÛT (cost_type):
   - "cout_fixe": Dépenses récurrentes/structurelles (loyers, assurances, télécom, logiciels, énergie)
   - "cout_variable": Dépenses ponctuelles/opérationnelles (matériaux, sous-traitance, location matériel, repas)
   - null: Si ce n'est pas une dépense

3. MÉTIER (metier):
   - "electricite": Travaux électriques, câblage, tableaux
   - "plomberie": Plomberie, sanitaire, tuyauterie
   - "chauffage": Chauffage, climatisation, CVC
   - "platrerie": Plâtrerie, cloisons sèches, isolation
   - "autre": Tout le reste

4. NATURE DE LA DÉPENSE (nature_depense):
   - "materiaux": Matériaux de construction (Point P, Leroy Merlin, Cedeo, etc.)
   - "sous_traitants": Factures de sous-traitants (ATTENTION: autoliquidation TVA)
   - "location_materiel": Location d'équipement (Kiloutou, Loxam, etc.)
   - "restauration": Repas, restauration
   - "carburant": Carburant, péage
   - "atelier": Atelier, entrepôt, stockage
   - "assurances": Assurances professionnelles
   - "comptabilite": Expert-comptable, frais comptables
   - "fournitures_bureau": Fournitures de bureau, papeterie
   - "autre": Tout le reste

# EXTRACTION DE DONNÉES

- doc_date: Format YYYY-MM-DD. Si jour/mois ambigu, format FR (JJ/MM/AAAA → YYYY-MM-DD)
- date_echeance: Date d'échéance si présente, format YYYY-MM-DD
- supplier_name: Nom court en MAJUSCULES (ex: "POINT P" pas "Point P Distribution SAS")
- supplier_siret: SIRET 14 chiffres si visible
- montant_ht: Montant Hors Taxes. Point pour décimales (ex: 1234.56)
- taux_tva: Taux de TVA en % (20, 10, 5.5, 2.1, ou 0)
- montant_tva: Montant TVA. Point pour décimales
- montant_ttc: Montant TTC. Point pour décimales
- autoliquidation: true si mention "autoliquidation" ou article 283-2 nonies du CGI (sous-traitants BTP)
- payment_method: "CB", "virement", "chèque", "espèces", ou null
- supplier_iban: IBAN si visible
- summary: Résumé télégraphique (max 5 mots). Ex: "Matériaux plomberie chantier" ou "Location nacelle mars"

# NORMALISATIONS FOURNISSEURS (CRITIQUE)
- "Leroy Merlin" → "LEROY MERLIN"
- "Point.P" ou "Point P Distribution" → "POINT P"
- "Cedeo" → "CEDEO"
- "Rexel" → "REXEL"
- "EDF" ou "Electricité de France" → "EDF"
- "Engie" ou "GDF Suez" → "ENGIE"
- "TotalEnergies" ou "Total" → "TOTALENERGIES"
- "Kiloutou" → "KILOUTOU"
- "Loxam" → "LOXAM"
- "Orange" ou "France Telecom" → "ORANGE"

# AUTOLIQUIDATION TVA (CRITIQUE - CONSTRUCTION)
Si la facture provient d'un sous-traitant (sous-traitance BTP):
- La mention "Autoliquidation de la TVA" ou "Art. 283-2 nonies du CGI" doit apparaître
- montant_tva = 0, taux_tva = 0, autoliquidation = true
- montant_ht = montant_ttc (pas de TVA facturée)

# LIGNES DE FACTURE (line_items)
Extraire chaque ligne de détail si visible:
- description: Description du produit/service
- quantity: Quantité (nombre)
- unit: Unité (m2, ml, u, forfait, h, kg, pce, lot, etc.)
- unit_price_ht: Prix unitaire HT
- total_ht: Total HT de la ligne
- taux_tva: Taux TVA de la ligne
Si les lignes ne sont pas clairement identifiables, renvoyer un tableau vide.

# FORMAT DE SORTIE (JSON UNIQUEMENT)
Réponds UNIQUEMENT avec cet objet JSON, sans markdown, sans texte avant ou après:

{
  "is_valid_document": boolean,
  "rejection_reason": "pas_un_document" | "document_illisible" | "pas_une_facture" | null,
  "document_type": "facture" | "avoir" | "recu" | "autre" | null,
  "cost_type": "cout_fixe" | "cout_variable" | null,
  "metier": "electricite" | "plomberie" | "chauffage" | "platrerie" | "autre" | null,
  "nature_depense": "materiaux" | "sous_traitants" | "location_materiel" | "restauration" | "carburant" | "atelier" | "assurances" | "comptabilite" | "fournitures_bureau" | "autre" | null,
  "doc_year": number | null,
  "doc_date": "YYYY-MM-DD" | null,
  "date_echeance": "YYYY-MM-DD" | null,
  "supplier_name": "string" | null,
  "supplier_siret": "string" | null,
  "doc_number": "string" | null,
  "montant_ht": number | null,
  "taux_tva": number | null,
  "montant_tva": number | null,
  "montant_ttc": number | null,
  "autoliquidation": boolean,
  "payment_method": "CB" | "virement" | "chèque" | "espèces" | null,
  "supplier_iban": "string" | null,
  "summary": "string" | null,
  "confidence_score": number,
  "line_items": [
    {
      "description": "string" | null,
      "quantity": number | null,
      "unit": "string" | null,
      "unit_price_ht": number | null,
      "total_ht": number | null,
      "taux_tva": number | null
    }
  ]
}

Si is_valid_document = false, les autres champs peuvent être null.`;

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { data, mimeType } = await req.json();

    if (!data || !mimeType) {
      return new Response(JSON.stringify({ error: "data and mimeType are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // OpenRouter API (OpenAI-compatible format) → Gemini 2.5 Pro
    const response = await fetchWithTimeout(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://faturai-lgm.vercel.app",
          "X-Title": "FaturaAI LGM",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: GEMINI_PROMPT },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${data}` } },
                { type: "text", text: "Analyse ce document et renvoie le JSON selon le format spécifié." },
              ],
            },
          ],
          max_tokens: 4096,
          temperature: 0.1,
        }),
      },
      API_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: "OpenRouter API error: " + response.status, details: errorText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content || "";
    const cleanedText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleanedText);

    return new Response(JSON.stringify(parsed), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
