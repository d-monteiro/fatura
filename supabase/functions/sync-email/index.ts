// ============================================
// Edge Function: sync-email
// Gmail API — Cron 23:58 daily
// Deploy: supabase functions deploy sync-email --project-ref wvopuqyotvwgronujvrb
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
// ============================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const results: { email: string; processed: number; errors: number; skipped: number }[] = [];

  try {
    // Get all active email accounts
    const { data: accounts, error: accountsErr } = await supabase
      .from("email_accounts")
      .select("*, user_oauth_tokens!oauth_token_id(access_token, refresh_token, token_expiry, email)")
      .eq("is_active", true);

    if (accountsErr || !accounts?.length) {
      return new Response(JSON.stringify({ message: "No active email accounts", results: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const account of accounts) {
      let processed = 0, errors = 0, skipped = 0;
      const token = (account as any).user_oauth_tokens;
      if (!token?.access_token) { skipped++; continue; }

      let accessToken = token.access_token;

      // Refresh token if expired
      if (token.token_expiry && new Date(token.token_expiry) < new Date()) {
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
            errors++;
            continue;
          }
        } catch { errors++; continue; }
      }

      // Gmail: search for new emails with attachments
      const query = encodeURIComponent(
        "has:attachment (filename:pdf OR filename:jpg OR filename:png) -category:promotions -category:social -label:FaturaAI-Processed newer_than:2d"
      );

      try {
        const listResp = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=20`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!listResp.ok) { errors++; continue; }
        const listData = await listResp.json();
        const messages = listData.messages || [];

        for (const msg of messages) {
          // Check if already processed (dedup by message ID)
          const { data: existing } = await supabase
            .from("invoices")
            .select("id")
            .eq("email_message_id", msg.id)
            .limit(1);

          if (existing && existing.length > 0) { skipped++; continue; }

          // Get full message
          const msgResp = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );

          if (!msgResp.ok) { errors++; continue; }
          const msgData = await msgResp.json();

          // Find PDF/image attachments
          const parts = msgData.payload?.parts || [];
          for (const part of parts) {
            if (!part.filename || !part.body?.attachmentId) continue;

            const mime = (part.mimeType || "").toLowerCase();
            if (!["application/pdf", "image/jpeg", "image/png", "image/jpg"].includes(mime)) continue;

            // Skip tiny attachments (likely signatures)
            if (part.body.size && part.body.size < 10000) continue;

            // Download attachment
            const attResp = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/attachments/${part.body.attachmentId}`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );

            if (!attResp.ok) { errors++; continue; }
            const attData = await attResp.json();
            const base64Data = attData.data.replace(/-/g, "+").replace(/_/g, "/");

            // Call analyze-document
            try {
              const analyzeResp = await fetch(`${supabaseUrl}/functions/v1/analyze-document`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({ data: base64Data, mimeType: mime }),
              });

              if (!analyzeResp.ok) { errors++; continue; }
              const geminiResult = await analyzeResp.json();

              if (!geminiResult.is_valid_document) { skipped++; continue; }

              // Get default company for this email account
              const companyId = account.company_id;
              if (!companyId) { errors++; continue; }

              // Upload to Supabase Storage (temporary)
              const fileName = `email_${msg.id}_${part.filename}`;
              const fileBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

              const { data: storageData } = await supabase.storage
                .from("invoices")
                .upload(fileName, fileBytes, { contentType: mime });

              const fileUrl = storageData?.path
                ? `${supabaseUrl}/storage/v1/object/public/invoices/${storageData.path}`
                : "";

              // Insert invoice
              const needsReview = geminiResult.confidence_score < 70;
              const { error: insertErr } = await supabase.from("invoices").insert({
                user_id: account.user_id,
                company_id: companyId,
                source: "email",
                email_message_id: msg.id,
                file_url: fileUrl,
                storage_path: storageData?.path || null,
                document_type: geminiResult.document_type,
                cost_type: geminiResult.cost_type,
                metier: geminiResult.metier,
                nature_depense: geminiResult.nature_depense,
                doc_date: geminiResult.doc_date,
                doc_year: geminiResult.doc_year,
                date_echeance: geminiResult.date_echeance,
                supplier_name: geminiResult.supplier_name?.toUpperCase(),
                supplier_siret: geminiResult.supplier_siret,
                doc_number: geminiResult.doc_number,
                montant_ht: geminiResult.montant_ht,
                taux_tva: geminiResult.taux_tva,
                montant_tva: geminiResult.montant_tva,
                montant_ttc: geminiResult.montant_ttc,
                autoliquidation: geminiResult.autoliquidation || false,
                payment_method: geminiResult.payment_method,
                supplier_iban: geminiResult.supplier_iban,
                summary: geminiResult.summary,
                confidence_score: geminiResult.confidence_score,
                status: needsReview ? "review" : "inbox",
                manual_review: needsReview,
                review_reason: needsReview ? "Confiance faible" : null,
              });

              if (!insertErr) {
                processed++;
                // Insert line items
                if (geminiResult.line_items?.length > 0) {
                  const { data: inv } = await supabase
                    .from("invoices")
                    .select("id")
                    .eq("email_message_id", msg.id)
                    .single();
                  if (inv) {
                    await supabase.from("invoice_line_items").insert(
                      geminiResult.line_items.map((li: any, idx: number) => ({
                        invoice_id: inv.id,
                        line_number: idx + 1,
                        description: li.description,
                        quantity: li.quantity,
                        unit: li.unit,
                        unit_price_ht: li.unit_price_ht,
                        total_ht: li.total_ht,
                        taux_tva: li.taux_tva,
                      }))
                    );
                  }
                }
              } else { errors++; }

            } catch { errors++; }
          }

          // Label email as processed
          try {
            // Create label if not exists
            const labelsResp = await fetch(
              "https://gmail.googleapis.com/gmail/v1/users/me/labels",
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const labelsData = await labelsResp.json();
            let labelId = labelsData.labels?.find((l: any) => l.name === "FaturaAI-Processed")?.id;

            if (!labelId) {
              const createResp = await fetch(
                "https://gmail.googleapis.com/gmail/v1/users/me/labels",
                {
                  method: "POST",
                  headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ name: "FaturaAI-Processed", labelListVisibility: "labelShow", messageListVisibility: "show" }),
                }
              );
              if (createResp.ok) {
                const newLabel = await createResp.json();
                labelId = newLabel.id;
              }
            }

            if (labelId) {
              await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`,
                {
                  method: "POST",
                  headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ addLabelIds: [labelId] }),
                }
              );
            }
          } catch { /* label failed, not critical */ }
        }

      } catch { errors++; }

      // Update last sync
      await supabase.from("email_accounts").update({ last_sync_at: new Date().toISOString() }).eq("id", account.id);
      results.push({ email: account.email, processed, errors, skipped });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
