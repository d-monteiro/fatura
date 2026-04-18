// ============================================
// Edge Function: sync-email
// Gmail API — cron 23:58 diário + manual trigger from app
// Deploy: supabase functions deploy sync-email --project-ref <ref>
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUPABASE_URL,
//          SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, CRON_SECRET
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
  const cronSecret = Deno.env.get("CRON_SECRET") || "";

  // Autorização: cron (secret header) OU JWT user
  const cronHeader = req.headers.get("x-cron-secret");
  const isCron = !!cronSecret && cronHeader === cronSecret;

  let scopedUserId: string | null = null;
  if (!isCron) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !anonKey) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    scopedUserId = user.id;
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const results: { email: string; processed: number; duplicates: number; errors: number; skipped: number; note?: string }[] = [];

  try {
    let query = supabase
      .from("email_accounts")
      .select("*, user_oauth_tokens!oauth_token_id(access_token, refresh_token, token_expiry, email), tenants!tenant_id(id, onboarding_data)")
      .eq("is_active", true);
    if (scopedUserId) query = query.eq("user_id", scopedUserId);
    const { data: accounts, error: accountsErr } = await query;

    if (accountsErr) {
      return new Response(JSON.stringify({ success: false, error: accountsErr.message, code: "accounts_query_failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!accounts?.length) {
      return new Response(JSON.stringify({
        success: true, code: "no_accounts",
        message: "Nenhuma conta Gmail ligada a uma empresa. Liga uma conta em Definições.",
        results: [], total_processed: 0, total_duplicates: 0, total_skipped: 0, total_errors: 0,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    type AccountWithJoins = typeof accounts[number] & {
      user_oauth_tokens: { access_token?: string; refresh_token?: string; token_expiry?: string; email?: string } | null;
      tenants: { id?: string; onboarding_data?: Record<string, unknown> } | null;
    };

    for (const accountRaw of accounts) {
      const account = accountRaw as AccountWithJoins;
      let processed = 0, duplicates = 0, errors = 0, skipped = 0;
      let note: string | undefined;
      const token = account.user_oauth_tokens;
      if (!token?.access_token) {
        results.push({ email: account.email, processed: 0, duplicates: 0, errors: 0, skipped: 1, note: "sem token" });
        continue;
      }

      const tenantRow = account.tenants;
      const tenantId: string | null = tenantRow?.id ?? account.tenant_id ?? null;
      const obData = tenantRow?.onboarding_data ?? {};
      if (obData?.emailSync === false || obData?.emailSync === "false") {
        results.push({ email: account.email, processed: 0, duplicates: 0, errors: 0, skipped: 1, note: "emailSync desligado" });
        continue;
      }
      if (!tenantId) {
        results.push({ email: account.email, processed: 0, duplicates: 0, errors: 0, skipped: 1, note: "sem tenant" });
        continue;
      }

      let accessToken = token.access_token;

      if (token.token_expiry && new Date(token.token_expiry) < new Date()) {
        if (!token.refresh_token) {
          results.push({ email: account.email, processed: 0, duplicates: 0, errors: 1, skipped: 0, note: "sem refresh_token, reauth necessário" });
          continue;
        }
        try {
          const refreshResp = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: token.refresh_token,
              grant_type: "refresh_token",
            }),
          });
          if (refreshResp.ok) {
            const tokens = await refreshResp.json();
            accessToken = tokens.access_token;
            await supabase.from("user_oauth_tokens").update({
              access_token: tokens.access_token,
              token_expiry: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
            }).eq("id", account.oauth_token_id);
          } else {
            const errText = await refreshResp.text();
            results.push({ email: account.email, processed: 0, duplicates: 0, errors: 1, skipped: 0, note: `refresh falhou: ${errText.slice(0, 120)}` });
            continue;
          }
        } catch (e) {
          results.push({ email: account.email, processed: 0, duplicates: 0, errors: 1, skipped: 0, note: `refresh excepção: ${e instanceof Error ? e.message : String(e)}` });
          continue;
        }
      }

      const gmailQuery = encodeURIComponent(
        "has:attachment (filename:pdf OR filename:jpg OR filename:png) -category:promotions -category:social newer_than:7d",
      );
      const MAX_MESSAGES_PER_RUN = 3;

      try {
        const listResp = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${gmailQuery}&maxResults=${MAX_MESSAGES_PER_RUN}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!listResp.ok) {
          const errText = await listResp.text();
          results.push({ email: account.email, processed: 0, duplicates: 0, errors: 1, skipped: 0, note: `Gmail list ${listResp.status}: ${errText.slice(0, 120)}` });
          continue;
        }
        const listData = await listResp.json();
        const messages = listData.messages || [];

        for (const msg of messages) {
          const { data: existing } = await supabase
            .from("invoices")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("email_message_id", msg.id)
            .limit(1);
          if (existing && existing.length > 0) { duplicates++; continue; }

          const msgResp = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (!msgResp.ok) { errors++; continue; }
          const msgData = await msgResp.json();

          const parts = msgData.payload?.parts || [];
          for (const part of parts) {
            if (!part.filename || !part.body?.attachmentId) continue;
            const mime = (part.mimeType || "").toLowerCase();
            if (!["application/pdf", "image/jpeg", "image/png", "image/jpg"].includes(mime)) continue;
            if (part.body.size && part.body.size < 10000) continue;

            const attResp = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/attachments/${part.body.attachmentId}`,
              { headers: { Authorization: `Bearer ${accessToken}` } },
            );
            if (!attResp.ok) { errors++; continue; }
            const attData = await attResp.json();
            const base64Data = attData.data.replace(/-/g, "+").replace(/_/g, "/");

            try {
              const analyzeResp = await fetch(`${supabaseUrl}/functions/v1/analyze-document`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-internal-secret": serviceKey,
                },
                body: JSON.stringify({ data: base64Data, mimeType: mime, tenantId }),
              });
              if (!analyzeResp.ok) {
                const errBody = await analyzeResp.text();
                errors++;
                note = `analyze ${analyzeResp.status}: ${errBody.slice(0, 80)}`;
                continue;
              }
              const analyzeResult = await analyzeResp.json();
              const invoices = analyzeResult.invoices || (analyzeResult.is_valid_document !== undefined ? [analyzeResult] : []);

              const companyId = account.company_id;
              if (!companyId) { errors++; note = "sem company_id"; continue; }

              const fileName = `${tenantId}/email_${msg.id}_${part.filename}`;
              const fileBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
              const { data: storageData } = await supabase.storage
                .from("invoices")
                .upload(fileName, fileBytes, { contentType: mime });

              // Signed URL 30 dias (bucket privado desde migração 20260418)
              let fileUrl = "";
              if (storageData?.path) {
                const { data: signed } = await supabase.storage
                  .from("invoices")
                  .createSignedUrl(storageData.path, 60 * 60 * 24 * 30);
                fileUrl = signed?.signedUrl ?? "";
              }

              for (const inv of invoices) {
                if (!inv.is_valid_document) { skipped++; continue; }
                const needsReview = (inv.confidence_score || 0) < 80;
                const { error: insertErr } = await supabase.from("invoices").insert({
                  tenant_id: tenantId,
                  user_id: account.user_id,
                  company_id: companyId,
                  source: "email",
                  email_message_id: msg.id,
                  file_url: fileUrl,
                  storage_path: storageData?.path || null,
                  document_type: inv.document_type,
                  cost_type: inv.cost_type,
                  metier: inv.metier,
                  nature_depense: inv.nature_depense,
                  doc_date: inv.doc_date,
                  doc_year: inv.doc_year,
                  date_echeance: inv.date_echeance,
                  supplier_name: inv.supplier_name?.toUpperCase(),
                  supplier_nif: inv.supplier_nif,
                  doc_number: inv.doc_number,
                  montant_ht: inv.montant_ht,
                  taux_tva: inv.taux_tva,
                  montant_tva: inv.montant_tva,
                  montant_ttc: inv.montant_ttc,
                  autoliquidation: inv.autoliquidation || false,
                  payment_method: inv.payment_method,
                  supplier_iban: inv.supplier_iban,
                  summary: inv.summary,
                  confidence_score: inv.confidence_score,
                  status: needsReview ? "review" : "inbox",
                  manual_review: needsReview,
                  review_reason: needsReview ? "Confiança baixa" : null,
                });

                if (!insertErr) {
                  processed++;
                  if (inv.line_items?.length > 0) {
                    const { data: savedInv } = await supabase
                      .from("invoices")
                      .select("id")
                      .eq("tenant_id", tenantId)
                      .eq("email_message_id", msg.id)
                      .eq("doc_number", inv.doc_number)
                      .single();
                    if (savedInv) {
                      type LineItemPayload = {
                        description?: string; quantity?: number; unit?: string;
                        unit_price_ht?: number; total_ht?: number; taux_tva?: number;
                      };
                      await supabase.from("invoice_line_items").insert(
                        inv.line_items.map((li: LineItemPayload, idx: number) => ({
                          tenant_id: tenantId,
                          invoice_id: savedInv.id,
                          line_number: idx + 1,
                          description: li.description,
                          quantity: li.quantity,
                          unit: li.unit,
                          unit_price_ht: li.unit_price_ht,
                          total_ht: li.total_ht,
                          taux_tva: li.taux_tva,
                        })),
                      );
                    }
                  }
                } else {
                  errors++;
                  note = `insert: ${insertErr.message?.slice(0, 80)}`;
                }
              }
            } catch (e) {
              errors++;
              note = `analyze: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`;
            }
          }
        }
      } catch (e) {
        errors++;
        note = `gmail: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`;
      }

      await supabase.from("email_accounts").update({ last_sync_at: new Date().toISOString() }).eq("id", account.id);
      results.push({ email: account.email, processed, duplicates, errors, skipped, note });
    }

    const total_processed = results.reduce((s, r) => s + r.processed, 0);
    const total_duplicates = results.reduce((s, r) => s + r.duplicates, 0);
    const total_skipped = results.reduce((s, r) => s + r.skipped, 0);
    const total_errors = results.reduce((s, r) => s + r.errors, 0);

    return new Response(JSON.stringify({ success: true, results, total_processed, total_duplicates, total_skipped, total_errors }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
