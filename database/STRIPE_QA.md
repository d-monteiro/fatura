# STRIPE_QA — Runbook E2E Stripe Live (FaturaAI)

> Runbook de QA executado antes de **cada release que toque billing**. Cobre Test mode + Live mode. Documentar resultado (data + observador + ✅/❌) na secção [Histórico](#histórico) no final.

## Pré-requisitos

- Stripe CLI instalado e autenticado (`stripe login`).
- Acesso ao dashboard Stripe (Test + Live) com role *Developer* mínimo.
- Acesso à BD Supabase (`sxfwprydmllovnxxjhrh`) via SQL Editor ou MCP.
- Tenant de teste com `onboarding_completed=true` e sem `stripe_subscription_id`.
- Edge Functions deployed: `stripe-checkout`, `stripe-portal`, `stripe-webhook`, `stripe-invoices`.
- Secrets configurados: `STRIPE_SECRET_KEY` (sk_test_… ou sk_live_…), `STRIPE_WEBHOOK_SECRET`.

## Price IDs esperados (`plans` table)

Verificar em Live antes de qualquer corrida:

```sql
select slug, stripe_price_id_monthly, stripe_price_id_yearly
  from plans
 where is_active = true
 order by sort_order;
```

Cada plano não-custom tem que ter ambos os Price IDs. Em falta → bloqueia checkout (`stripe-checkout` devolve 400).

---

## A. Test mode — golden path (~15 min)

> Cartão: `4242 4242 4242 4242`, qualquer CVC, qualquer data futura.

### A.1 — Webhook local em escuta

```bash
stripe listen --forward-to https://sxfwprydmllovnxxjhrh.supabase.co/functions/v1/stripe-webhook
```

Copiar o `whsec_…` impresso e exportar como `STRIPE_WEBHOOK_SECRET` na Edge Function (dashboard Supabase → Functions → secrets) **e redeploy** `stripe-webhook`.

### A.2 — Checkout Starter mensal

1. Login com tenant de teste (sem subscrição activa).
2. Ir a `/billing` → carregar **Subscrever Starter (mensal)**.
3. Stripe Checkout abre com locale `pt`. Pagar com `4242…`.
4. Redirect para `/billing?checkout=success&session_id=…` → toast verde.

### A.3 — Verificações pós-checkout

```sql
select id, plan_id, plan_status, stripe_customer_id, stripe_subscription_id, trial_ends_at
  from tenants
 where id = '<tenant-id>';
```

Esperado:

- `plan_status = 'active'`.
- `stripe_customer_id` populado (`cus_…`).
- `stripe_subscription_id` populado (`sub_…`).
- `trial_ends_at = null` (Stripe assumiu).
- `plan_id` = ID do plano Starter.

```sql
select event_id, event_type, processed_at
  from stripe_webhook_events
 order by processed_at desc
 limit 5;
```

Esperado: 1 ou 2 entradas (`customer.subscription.created`, eventualmente `checkout.session.completed`).

### A.4 — Histórico de invoices (UI)

- `/billing` → secção *Histórico de faturas* lista 1 invoice (status *Pago*, montante 39,00 EUR).
- Botão PDF abre `invoice_pdf` em nova tab.
- Botão *Ver no Stripe* abre `hosted_invoice_url`.

### A.5 — Trocar para Pro via Portal

1. `/billing` → **Gerir subscrição e pagamentos**.
2. Portal abre em `pt`. *Update plan* → seleccionar Pro mensal → confirm.
3. Stripe envia `customer.subscription.updated`.

Verificar:

```sql
select plan_id, plan_status from tenants where id = '<tenant-id>';
```

`plan_id` = ID do Pro, `plan_status='active'`.

### A.6 — Cancelar via Portal

1. Portal → *Cancel subscription* → *Cancel immediately* (não at period end).
2. Stripe envia `customer.subscription.deleted`.

Verificar:

- `plan_status = 'canceled'`.
- `stripe_subscription_id = null`.
- `stripe_customer_id` mantém-se (não apagar — o cliente Stripe persiste).
- UI `/billing` volta a mostrar *Sem plano* + planos disponíveis.

### A.7 — Idempotência

```bash
stripe events resend <event_id>
```

Esperado: webhook devolve `200 {"received": true, "duplicate": true}` e não duplica updates. Verificar `stripe_webhook_events` — só 1 linha por `event_id`.

---

## B. Test mode — caminhos negativos

### B.1 — Pagamento falhado

- Cartão `4000 0000 0000 0341` (declined after auth) → checkout fica em *requires_payment_method*.
- Stripe envia `invoice.payment_failed` → tenant fica `plan_status='past_due'`.
- UI mostra warning + botão portal para actualizar cartão.

### B.2 — Tentar checkout com subscrição activa

- Repetir `/billing` → *Subscrever* com tenant que já tem `stripe_subscription_id`.
- Edge Function devolve **409** com mensagem PT *"Subscrição já existe. Use o portal para alterar plano."*.

### B.3 — User sem permissões de billing

- Login com user `role='member'` ou `role='accountant'`.
- POST a `stripe-checkout` ou `stripe-portal` → **403** *"Sem permissões de billing"*.
- UI esconde botões via `useFeatureGate('multi_user')` ou role check.

### B.4 — Webhook signature inválida

```bash
curl -X POST https://sxfwprydmllovnxxjhrh.supabase.co/functions/v1/stripe-webhook \
  -H "Content-Type: application/json" \
  -H "stripe-signature: whsec_inválida" \
  -d '{}'
```

Esperado: **400** *"Webhook Error: …"*. Não escreve em `stripe_webhook_events`.

### B.5 — Reset mensal de contadores (cron)

- Manualmente executar:

```sql
update tenants set invoices_this_month = 0 where deleted_at is null;
```

ou aguardar cron `reset-invoices-month-counter` (00:00 do 1º dia do mês UTC).

- Verificar `cron.job_run_details` para confirmar execução sem erros.

---

## C. Live mode — verificação real (~10 min)

> **Pagamento real.** Fazer com cartão pessoal e refund imediato após validação.

### C.1 — Trocar de Test para Live

1. Stripe Dashboard → *Toggle* para **Live mode**.
2. Confirmar `STRIPE_SECRET_KEY` em produção começa por `sk_live_`.
3. Confirmar `STRIPE_WEBHOOK_SECRET` em produção é o `whsec_…` do endpoint Live (`/functions/v1/stripe-webhook`).
4. `plans.stripe_price_id_*` apontam para Price IDs Live (não Test).

### C.2 — Subscrever Starter mensal com cartão real

- Repetir A.2 → A.4 com cartão verdadeiro.
- Validar que recebes invoice por email Stripe.

### C.3 — Cancelar e refund

1. Portal → cancelar imediatamente (A.6).
2. Stripe Dashboard → invoice → *Refund* → full refund.
3. Confirmar `plan_status='canceled'`, `stripe_subscription_id=null`.

### C.4 — Limpeza pós-QA

```sql
update tenants
   set plan_status = 'trialing',
       stripe_subscription_id = null,
       stripe_customer_id = null,
       trial_ends_at = now() + interval '14 days'
 where id = '<tenant-qa>';
```

(opcional, só se o tenant for descartável)

---

## D. Observabilidade

- `edge_function_errors` → grep `function_name in ('stripe-checkout','stripe-portal','stripe-webhook','stripe-invoices')` últimas 24h.
- `stripe_webhook_events` → contagem por `event_type` para sanity check.
- Stripe Dashboard → *Developers → Webhooks* → endpoint produção tem que estar a ≥99% sucesso.

---

## Histórico

| Data | Versão / commit | Modo | Observador | Resultado | Notas |
|------|-----------------|------|------------|-----------|-------|
| _preencher_ | _hash_ | Test/Live | _email_ | ✅/❌ | _ex.: B.4 falhou; corrigido em <hash>_ |
