// ============================================
// Edge Function: analyze-document
// OpenRouter → Gemini 2.5 Pro — Multi-invoice extraction + auto-detect company
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
Tu es un COMPTABLE SENIOR spécialisé dans le secteur du BÂTIMENT et de la CONSTRUCTION en France.

# OBJECTIF
Traiter des images/PDFs de factures et renvoyer un JSON structuré.
Si le PDF contient PLUSIEURS factures (numéros différents), extraire CHAQUE facture séparément.

# VALIDATION INITIALE (CRITIQUE)
Vérifie si l'image/document est réellement une FACTURE, REÇU ou document financier valide.
- Photo de personne, selfie, paysage, objet aléatoire, mème → is_valid_document = false
- Document financier lisible (facture, reçu, avoir) → is_valid_document = true
- Document mais illisible/très flou → is_valid_document = false, rejection_reason = "document_illisible"

# RÈGLES DE CLASSIFICATION

1. TYPE DE DOCUMENT (document_type):
   - "facture" | "avoir" | "recu" | "autre"

2. TYPE DE COÛT (cost_type):
   - "cout_fixe": Dépenses récurrentes/structurelles (loyers, assurances, télécom, logiciels, énergie)
   - "cout_variable": Dépenses ponctuelles/opérationnelles (matériaux, sous-traitance, location matériel, repas)
   - null: Si ce n'est pas une dépense

3. MÉTIER (metier):
   - "electricite" | "plomberie" | "chauffage" | "platrerie" | "autre"

4. NATURE DE LA DÉPENSE (nature_depense):
   - "materiaux" | "sous_traitants" | "location_materiel" | "restauration" | "carburant" | "atelier" | "assurances" | "comptabilite" | "fournitures_bureau" | "autre"

# EXTRACTION DE DONNÉES

- doc_date: Format YYYY-MM-DD. Si jour/mois ambigu, format FR (JJ/MM/AAAA → YYYY-MM-DD)
- date_echeance: Date d'échéance si présente, format YYYY-MM-DD
- supplier_name: Nom court en MAJUSCULES du FOURNISSEUR (celui qui ÉMET la facture). Ex: "POINT P", "CEDEO"
- destinataire_name: Nom du destinataire/client de la facture (celui qui REÇOIT la facture, pas le fournisseur). Ex: "SARL LGM", "HOLDING XYZ". Extraire tel quel depuis le document.
- supplier_siret: SIRET 14 chiffres si visible
- montant_ht: Montant Hors Taxes. Point pour décimales (ex: 1234.56)
- taux_tva: Taux de TVA en % (20, 10, 5.5, 2.1, ou 0)
- montant_tva: Montant TVA. Point pour décimales
- montant_ttc: Montant TTC. Point pour décimales
- autoliquidation: true si mention "autoliquidation" ou article 283-2 nonies du CGI
- payment_method: "CB", "virement", "chèque", "espèces", ou null
- supplier_iban: IBAN si visible
- summary: Résumé télégraphique (max 5 mots)

# NORMALISATIONS FOURNISSEURS
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

# AUTOLIQUIDATION TVA (CONSTRUCTION)
Si sous-traitant BTP avec mention "Autoliquidation" ou "Art. 283-2 nonies du CGI":
- montant_tva = 0, taux_tva = 0, autoliquidation = true
- montant_ht = montant_ttc

# LIGNES DE FACTURE (line_items)
Extraire chaque ligne de détail si visible (max 30 par facture):
- description, quantity, unit, unit_price_ht, total_ht, taux_tva
- IGNORER les lignes de contribution REP PMCB et ABJ (eco-contribution/eco-participation)
- Si les lignes ne sont pas clairement identifiables, renvoyer un tableau vide.

# FORMAT DE SORTIE (JSON UNIQUEMENT)
Réponds UNIQUEMENT avec cet objet JSON, sans markdown, sans texte avant ou après.
TOUJOURS renvoyer un objet avec une clé "invoices" contenant un TABLEAU de factures.
Même si une seule facture, renvoyer { "invoices": [{ ... }] }.

{
  "invoices": [
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
      "destinataire_name": "string" | null,
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
  ]
}

Si is_valid_document = false, les autres champs peuvent être null.`;

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

/** Try to repair truncated JSON and parse it. */
function tryParseJSON(text: string): unknown {
  // 1. Direct parse
  try { return JSON.parse(text); } catch { /* continue */ }

  // 2. Fix truncated JSON: find last complete object, close open brackets
  let fixed = text;
  const lastBrace = fixed.lastIndexOf('}');
  if (lastBrace > 0) {
    fixed = fixed.substring(0, lastBrace + 1);
    // Count open vs close brackets/braces to close them
    const openBrackets = (fixed.match(/\[/g) || []).length - (fixed.match(/\]/g) || []).length;
    const openBraces = (fixed.match(/\{/g) || []).length - (fixed.match(/\}/g) || []).length;
    fixed += ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces));
    try { return JSON.parse(fixed); } catch { /* continue */ }
  }

  // 3. Last resort: strip line_items if they cause the truncation
  const lineItemsIdx = text.indexOf('"line_items"');
  if (lineItemsIdx > 0) {
    const before = text.substring(0, lineItemsIdx) + '"line_items": []}';
    // If inside invoices array, close it too
    const invoicesClose = before.includes('"invoices"') ? ']}' : '}';
    try { return JSON.parse(before); } catch { /* continue */ }
    try { return JSON.parse(before + invoicesClose); } catch { /* continue */ }
  }

  throw new Error("Could not parse Gemini response as JSON");
}

/** Normalize the parsed result to always return { invoices: [...] } */
function normalizeResult(parsed: unknown): { invoices: unknown[] } {
  if (parsed && typeof parsed === 'object') {
    // Already in { invoices: [...] } format
    if ('invoices' in parsed && Array.isArray((parsed as Record<string, unknown>).invoices)) {
      return parsed as { invoices: unknown[] };
    }
    // Single invoice object returned (backward compat)
    if ('is_valid_document' in parsed) {
      return { invoices: [parsed] };
    }
    // Array of invoices returned directly
    if (Array.isArray(parsed)) {
      return { invoices: parsed };
    }
  }
  return { invoices: [parsed] };
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
                { type: "text", text: "Analyse ce document et renvoie le JSON selon le format spécifié. Si plusieurs factures, extrais-les toutes." },
              ],
            },
          ],
          max_tokens: 16384,
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

    const parsed = tryParseJSON(cleanedText);
    const normalized = normalizeResult(parsed);

    return new Response(JSON.stringify(normalized), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
