// Helper partilhado para logar erros de Edge Functions em `error_logs`.
// Usa service_role, por isso contorna RLS (a tabela tem bypass explícito).
// Nunca lança — se o próprio log falha, só imprime no console para não
// mascarar o erro original que estamos a tentar registar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type EdgeLogLevel = "debug" | "info" | "warn" | "error" | "fatal";

interface EdgeLogInput {
  functionName: string;
  message: string;
  level?: EdgeLogLevel;
  error?: unknown;
  tenantId?: string | null;
  userId?: string | null;
  httpMethod?: string | null;
  httpPath?: string | null;
  httpStatus?: number | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}

let cachedClient: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (cachedClient) return cachedClient;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export async function logEdgeError(input: EdgeLogInput): Promise<void> {
  const level = input.level ?? "error";
  const err = input.error;
  const stack = err instanceof Error ? err.stack : undefined;

  // Sempre no stdout (Supabase function logs)
  console.error(`[${input.functionName}][${level}] ${input.message}`, err ?? "");

  const client = getClient();
  if (!client) return;

  try {
    await client.from("error_logs").insert({
      tenant_id: input.tenantId ?? null,
      user_id: input.userId ?? null,
      level,
      source: "edge",
      function_name: input.functionName,
      message: input.message.slice(0, 2000),
      stack_trace: stack?.slice(0, 8000) ?? null,
      request_id: input.requestId ?? null,
      http_method: input.httpMethod ?? null,
      http_path: input.httpPath ?? null,
      http_status: input.httpStatus ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (insertErr) {
    console.error(`[${input.functionName}] falha a gravar error_logs`, insertErr);
  }
}
