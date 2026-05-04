// Worker de monitorização (Fase 8 hardening). Cron `sync-jobs-monitor`
// chama a cada 10min via `trigger_sync_monitor()`.
//
// 1. Lê estado do pipeline via RPC `sync_jobs_monitor_check` (jobs presos,
//    error rate, backlog, circuit breakers, surto failed_permanent).
// 2. Se há alertas, formata-os em Block Kit e envia ao SLACK_WEBHOOK_URL
//    (mesmo webhook usado pela função `slack-notify`, mas chamado directo
//    para não exigir JWT).
// 3. Devolve resumo (alerts_count + stats) em JSON. Sem alertas → 200 ok
//    com has_alerts:false.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logEdgeError } from "../_shared/logError.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SLACK_WEBHOOK_URL = Deno.env.get("SLACK_WEBHOOK_URL");

interface Alert {
  type: string;
  severity: "high" | "medium" | "low";
  [key: string]: unknown;
}

interface MonitorResult {
  checked_at: string;
  alerts: Alert[];
  has_alerts: boolean;
  stats: Record<string, number>;
}

interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" }, corsHeaders);
  }

  const cronHeader = req.headers.get("x-cron-secret");
  const internalHeader = req.headers.get("x-internal-secret");
  const authorized =
    (CRON_SECRET.length > 0 && cronHeader === CRON_SECRET) ||
    (SERVICE_KEY.length > 0 && internalHeader === SERVICE_KEY);
  if (!authorized) {
    return jsonResponse(401, { error: "Unauthorized" }, corsHeaders);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc("sync_jobs_monitor_check");
  if (error) {
    await logEdgeError({
      functionName: "sync-monitor",
      level: "error",
      message: "sync_jobs_monitor_check falhou",
      metadata: { db_error: error.message },
    });
    return jsonResponse(500, { error: error.message }, corsHeaders);
  }

  const result = data as MonitorResult;
  if (!result || !Array.isArray(result.alerts)) {
    return jsonResponse(500, { error: "invalid_monitor_response" }, corsHeaders);
  }

  if (!result.has_alerts) {
    return jsonResponse(200, {
      ok: true,
      has_alerts: false,
      stats: result.stats,
    }, corsHeaders);
  }

  // Dedup (review B5): filtrar alertas via sync_monitor_alert_should_send.
  // Cada alerta gera uma signature determinística baseada em (type + magnitude
  // discreta). Slack só recebe se >30min desde o último envio dessa signature.
  const sendable: Alert[] = [];
  for (const alert of result.alerts) {
    const sig = alertSignature(alert);
    const { data: should, error: dedupErr } = await admin.rpc("sync_monitor_alert_should_send", {
      p_signature: sig,
      p_payload: alert as unknown as Record<string, unknown>,
      p_min_interval_minutes: 30,
    });
    if (dedupErr) {
      // Em falha do dedup, fail-open (envia) para não perder alertas.
      console.error("[sync-monitor] sync_monitor_alert_should_send falhou", dedupErr.message);
      sendable.push(alert);
      continue;
    }
    if (should === true) sendable.push(alert);
  }

  if (sendable.length === 0) {
    return jsonResponse(200, {
      ok: true,
      has_alerts: true,
      slack_sent: false,
      slack_deduped: true,
      alerts_total: result.alerts.length,
      alerts_skipped: result.alerts.length,
      stats: result.stats,
    }, corsHeaders);
  }

  if (!SLACK_WEBHOOK_URL) {
    console.log(
      "[sync-monitor] alertas presentes mas SLACK_WEBHOOK_URL não configurado",
      JSON.stringify(sendable).slice(0, 500),
    );
    return jsonResponse(200, {
      ok: true,
      has_alerts: true,
      slack_skipped: true,
      alerts_count: sendable.length,
    }, corsHeaders);
  }

  const message = buildSlackMessage({ ...result, alerts: sendable });

  let slackSent = false;
  try {
    const slackResp = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    if (!slackResp.ok) {
      const errText = await slackResp.text().catch(() => "");
      await logEdgeError({
        functionName: "sync-monitor",
        level: "warn",
        message: `Slack API error ${slackResp.status}`,
        httpStatus: slackResp.status,
        metadata: { errText: errText.slice(0, 500) },
      });
    } else {
      slackSent = true;
    }
  } catch (e) {
    await logEdgeError({
      functionName: "sync-monitor",
      level: "warn",
      message: e instanceof Error ? e.message : "slack_post_failed",
      error: e,
    });
  }

  // Best-effort cleanup do alert log (>30 dias) — chamada barata, ignorada em erro.
  await admin.rpc("sync_monitor_alert_log_cleanup").catch(() => null);

  return jsonResponse(200, {
    ok: true,
    has_alerts: true,
    slack_sent: slackSent,
    alerts_total: result.alerts.length,
    alerts_sent: sendable.length,
    alerts_skipped: result.alerts.length - sendable.length,
    stats: result.stats,
  }, corsHeaders);
});

// Signature determinística por tipo + bucket de magnitude. Bucket faz com que
// "stuck_jobs:1-5" e "stuck_jobs:6-20" sejam tratados como alertas distintos
// (escalation real), mas não 1 vs 2 (ruído).
function alertSignature(alert: Alert): string {
  const t = alert.type;
  switch (t) {
    case "stuck_jobs":
    case "paused_reauth_stale":
      return `${t}:${bucketCount(Number(alert.count ?? 0))}`;
    case "error_rate":
      return `error_rate:${bucketRate(Number(alert.rate ?? 0))}`;
    case "backlog":
      return `backlog:${bucketCount(Number(alert.analyzing_count ?? 0), [1000, 5000, 10000])}`;
    case "failed_permanent_spike":
      return `fp_spike:${bucketCount(Number(alert.count_last_hour ?? 0), [10, 50, 200])}`;
    case "circuit_breaker_open": {
      const breakers = (alert.breakers as Array<{ service: string; tenant_id: string | null }>) ?? [];
      const keys = breakers.map((b) => `${b.service}:${b.tenant_id ?? "global"}`).sort().join(",");
      return `cb_open:${keys || "none"}`;
    }
    default:
      return `${t}:unknown`;
  }
}

function bucketCount(n: number, edges: number[] = [1, 5, 20, 100]): string {
  for (const edge of edges) if (n <= edge) return `<=${edge}`;
  return `>${edges[edges.length - 1]}`;
}

function bucketRate(r: number): string {
  if (r <= 0.3) return "20-30";
  if (r <= 0.5) return "30-50";
  if (r <= 0.8) return "50-80";
  return ">80";
}

function jsonResponse(
  status: number,
  body: unknown,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function buildSlackMessage(result: MonitorResult): { text: string; blocks: SlackBlock[] } {
  const summary = result.alerts
    .map((a) => `${escapeMrkdwn(String(a.severity ?? "info").toUpperCase())}·${escapeMrkdwn(a.type)}`)
    .join(" · ");

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `Pipeline sync · ${result.alerts.length} alerta(s)`, emoji: false },
    },
  ];

  for (const alert of result.alerts) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: formatAlert(alert) },
    });
  }

  blocks.push({
    type: "context",
    elements: [{
      type: "mrkdwn",
      text: `Verificado às ${escapeMrkdwn(result.checked_at)} · stats ${escapeMrkdwn(JSON.stringify(result.stats))}`,
    }],
  });

  return {
    text: `[sync-monitor] ${summary}`,
    blocks,
  };
}

// Slack mrkdwn é like-Markdown mas usa <>, *, _, ~, |, ` como controlo. Escapar
// caracteres em strings vindas de fontes externas (last_failure_reason etc.).
// Lista mínima — não inclui >, & (Slack só interpreta no início de linha como
// blockquote/entity, e blockquote partido é cosmético).
function escapeMrkdwn(s: string | number | null | undefined): string {
  if (s == null) return "";
  return String(s).replace(/[<>&*_~|`]/g, (ch) => `\\${ch}`);
}

function formatAlert(alert: Alert): string {
  const severity = escapeMrkdwn(String(alert.severity ?? "info").toUpperCase());
  switch (alert.type) {
    case "stuck_jobs":
      return `*${severity} · Jobs presos*\n${escapeMrkdwn(alert.count as number)} sync_job(s) sem heartbeat há mais de 1h.`;
    case "paused_reauth_stale":
      return `*${severity} · Tenants em paused_reauth >48h*\n${escapeMrkdwn(alert.count as number)} sync_job(s) à espera de re-autorização Google.`;
    case "error_rate": {
      const rate = (Number(alert.rate ?? 0) * 100).toFixed(1);
      return `*${severity} · Error rate alto*\n${rate}% (${escapeMrkdwn(alert.failed_count as number)}/${escapeMrkdwn(alert.sample_size as number)}) dos últimos 100 items do pipeline (24h).`;
    }
    case "backlog":
      return `*${severity} · Backlog em analyzing*\n${escapeMrkdwn(alert.analyzing_count as number)} invoices em analyzing (>1000). Rever throughput Gemini.`;
    case "failed_permanent_spike":
      return `*${severity} · Spike de failed_permanent*\n${escapeMrkdwn(alert.count_last_hour as number)} invoices marcadas failed_permanent na última hora.`;
    case "circuit_breaker_open": {
      const breakers = (alert.breakers as Array<{
        service: string;
        tenant_id: string | null;
        expires_at: string;
        failure_count: number;
        trip_count: number;
        last_failure_reason?: string;
      }>) ?? [];
      const list = breakers
        .map((b) => {
          const scope = b.tenant_id ? `tenant ${escapeMrkdwn(b.tenant_id)}` : "global";
          return `• ${escapeMrkdwn(b.service)} (${scope}) re-abre ${escapeMrkdwn(b.expires_at)} — ${escapeMrkdwn(b.failure_count)} falhas/janela, ${escapeMrkdwn(b.trip_count)} trips totais\n   motivo: ${escapeMrkdwn(b.last_failure_reason ?? "n/d")}`;
        })
        .join("\n");
      return `*${severity} · Circuit breaker(s) abertos*\n${list}`;
    }
    default:
      return `*${severity} · ${escapeMrkdwn(alert.type)}*\n${escapeMrkdwn(JSON.stringify(alert).slice(0, 500))}`;
  }
}
