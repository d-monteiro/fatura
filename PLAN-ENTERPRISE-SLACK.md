# Plano — Fluxo Empresarial + Slack Ops

## Objetivo

Quando alguém escolhe o plano **Empresarial** no onboarding ou cria um ticket de suporte, queremos:
1. Um formulário de contacto real com telefone, disponibilidade e notas
2. Notificação automática no Slack da nossa equipa (**1 canal único**)
3. Email de confirmação ao cliente (fica para depois, quando o Resend estiver ligado)

## Arquitetura

```
Frontend (Onboarding/Tickets)
        │
        ▼
Supabase (DB insert)
        │
        ▼
Edge Function `slack-notify`       ◀── chamada direta do frontend com JWT
        │
        ▼
Slack Incoming Webhook (1 URL única)
```

**1 canal único** — cada mensagem começa com um cabeçalho visível que identifica o tópico:

```
════════ 🏢 LEAD · EMPRESARIAL ════════
════════ 🎉 NOVO SIGNUP ════════
════════ 🎫 TICKET DE SUPORTE ════════
════════ 🚨 ALERTA ════════
```

Assim consegues filtrar rapidamente no Slack com `🏢` ou `🎫` na caixa de pesquisa.

---

## O QUE EU JÁ IMPLEMENTEI

### 1. Tabela `enterprise_leads` (nova)

```sql
CREATE TABLE enterprise_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  onboarding_submission_id UUID REFERENCES onboarding_submissions(id),
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  sector TEXT,
  country TEXT,
  invoices_per_month INTEGER,
  availability TEXT,
  notes TEXT,
  slack_ts TEXT,
  status TEXT DEFAULT 'new'
);
```

Com RLS: users podem inserir e ver os seus próprios, service role bypassa.

### 2. Edge Function `slack-notify`

`supabase/functions/slack-notify/index.ts`

- Aceita 4 tipos de mensagem (`lead`, `ticket`, `alert`, `signup`)
- Verifica JWT do caller
- Formata mensagem em Markdown Slack com cabeçalho visível do tópico
- POST para **uma única** `SLACK_WEBHOOK_URL`
- **Graceful fallback**: se webhook vazio, retorna `ok:false` sem partir nada

### 3. Form de Empresarial (EnterpriseContactForm.tsx)

Substitui a submissão direta quando o user escolhe Empresarial no passo 7:
- Nome de contacto, telefone, disponibilidade (chips), notas
- Insere em `enterprise_leads` + Slack + redireciona para `/onboarding/thanks`

### 4. Pontos de integração Slack

| Acção no app                | Tópico Slack |
|-----------------------------|--------------|
| Onboarding Starter/Pro      | `signup`     |
| Onboarding Empresarial      | `lead`       |
| Novo ticket (form completo) | `ticket`     |
| Feedback widget (bug/feat)  | `ticket`     |
| Erro crítico (ErrorBoundary + reportError) | `alert` |

---

## O QUE TU TENS DE FAZER — passos externos

### A. Criar 1 canal no Slack workspace da Flowzi

Sugestão: `#faturai-ops` (ou o nome que quiseres)

### B. Gerar 1 Incoming Webhook

1. Vai a https://api.slack.com/apps
2. **Create New App** → **From scratch**
   - App Name: `FaturaAI`
   - Workspace: o teu Flowzi workspace
3. Menu lateral → **Incoming Webhooks** → ativa
4. **Add New Webhook to Workspace** → escolhe `#faturai-ops` → **copia URL**

Vais ficar com 1 URL:
```
https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX
```

### C. Adicionar secrets no Supabase Dashboard

**Project → Edge Functions → Secrets:**

```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../...
ADMIN_URL=https://app.faturai.pt
```

(Para testes locais, podes meter `ADMIN_URL=http://localhost:5173`.)

### D. Deploy da edge function

```bash
supabase functions deploy slack-notify --project-ref sxfwprydmllovnxxjhrh
```

Se ainda não tens CLI:
```bash
npm i -g supabase
supabase login
```

### E. Testar

1. **Signup Starter** → onboarding completo com plano Starter → vais ver `════════ 🎉 NOVO SIGNUP ════════`
2. **Lead Empresarial** → onboarding completo com plano Empresarial + form → vais ver `════════ 🏢 LEAD · EMPRESARIAL ════════`
3. **Ticket** → criar ticket a partir da app → vais ver `════════ 🎫 TICKET DE SUPORTE ════════`

Se tudo funciona, estás operacional.

---

## Failure modes / fallbacks

- **`SLACK_WEBHOOK_URL` não definido**: edge function retorna `ok:false`, app continua normal. Lead/ticket fica na DB, recuperas do admin panel.
- **Slack fora**: POST falha, logamos e retornamos `ok:false`. Dados estão seguros na DB.
- **Onboarding/ticket falha por outro motivo**: user vê alerta, nada é enviado ao Slack.

---

## Próximos passos (depois de Slack funcionar)

1. Página do admin para gerir leads Empresariais (marcar como contactado, won/lost)
2. Responder a tickets a partir do admin (atualmente só lista)
3. Quando Stripe for ligado: webhook de Stripe para enviar alertas de pagamentos falhados ao Slack
4. Ligar emails transacionais (Resend) para confirmação ao cliente Empresarial
