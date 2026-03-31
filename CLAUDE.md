# FaturaAI - LGM (Construction France)

## Projeto
Plataforma de faturacao com IA para LGM (construcao civil, Franca). Multi-empresa (LGM, Holding, Imobiliaria). Utilizadora principal: secretaria francesa. Idioma interface: FR com toggle PT/FR.

## Stack
- Frontend: React 18 + Vite 8 + TypeScript 5.9 (strict) + Shadcn/UI + Tailwind CSS 4
- Backend: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- State: TanStack React Query (server state) + React Context (auth, i18n)
- AI/OCR: OpenRouter → Gemini 2.5 Pro (visao direta, sem OCR separado)
- Storage ficheiros: Google Drive API (hierarquia de pastas)
- Email sync: Gmail API via Edge Function (cron 23:58)
- Export: Excel .xlsx via SheetJS, ZIP via JSZip
- Deploy: Vercel (frontend) + Supabase Cloud (backend)
- Supabase ref: wvopuqyotvwgronujvrb
- URL producao: https://faturai-lgm.vercel.app

## Regras de Desenvolvimento

### Codigo
- Componentes max 150 linhas. Se exceder, split automaticamente. Separar UI de logica
- TypeScript strict, zero erros no build
- Tailwind + shadcn/ui para toda a UI
- Testar com `npm run build` antes de considerar tarefa feita
- Preferir editar ficheiros existentes a criar novos
- Nao adicionar features, refactoring, ou melhorias alem do pedido
- Seguir patterns existentes no codebase
- Formatar valores: `1 234,56 EUR` (espacos milhares, virgula decimais)
- Formatar datas: `DD/MM/AAAA`
- Moeda: EUR

### Seguranca (CRITICO)
- API keys NUNCA no frontend — so em Edge Functions (`Deno.env.get`)
- RLS em TODAS as tabelas — usar `(select auth.uid())` em policies (NAO `auth.uid()` bare)
- Edge Functions DEVEM verificar JWT do caller via `supabase.auth.getUser()`
- CORS: apenas dominios autorizados (`faturai-lgm.vercel.app` + `localhost:5173`)
- NUNCA usar `Access-Control-Allow-Origin: "*"` em Edge Functions
- Soft delete SEMPRE (deleted_at em vez de DELETE real)
- Audit log para alteracoes em faturas (quem mudou o que, quando)
- Dados sensiveis (tokens OAuth, SIRET) protegidos por RLS
- Nunca expor SUPABASE_SERVICE_ROLE_KEY no frontend
- OAuth state parameter deve ser assinado (HMAC) para prevenir forgery

### Armadilhas Conhecidas
- **AUTH DEADLOCK:** NUNCA await Supabase calls dentro de `onAuthStateChange` callback — causa `navigator.locks` deadlock
- **Auth loading state:** Usar condicao THREE-WAY: `loading ? null : isAuthenticated ? menu : login`
- **RLS recursion:** Policies que fazem query a mesma tabela → usar SECURITY DEFINER helpers
- **Edge function secrets:** Apos adicionar secrets no Dashboard, pode precisar REDEPLOY
- **Gemini markdown wrapping:** Gemini por vezes devolve JSON com ```json wrapping — sempre limpar
- **French number parsing:** Virgula e decimal, espaco e milhares. NUNCA confundir com formato US
- **TVA autoliquidation:** Faturas de sous-traitants tem 0% TVA — campo especifico obrigatorio
- **HEIC fotos iPhone:** Converter para JPEG server-side antes de enviar ao Gemini
- **CORS placeholder:** NUNCA usar `{{CLIENT_DOMAIN}}` — sempre usar dominio real

## Comandos
```bash
npm run dev          # Dev server (localhost:5173)
npm run build        # Build producao (testar SEMPRE)
npm run lint         # ESLint
```

## Estrutura do Projeto
```
src/
  components/
    ui/                    # Shadcn UI (13 components)
    common/                # LoadingSpinner
    layout/                # AppLayout, Sidebar, MobileHeader, CompanySelector
    dashboard/             # MetricCard, TrendChart, CategoryDonut, RecentInvoicesTable
    faturas/               # FaturasTable, Filters, Drawers, EditModal, Export (14 components)
    upload/                # DropZone, ProcessingOverlay, StatusCards (6 components)
    inbox/                 # InboxCard
    settings/              # CompanyList, EmailAccounts, GoogleAccounts
    automations/           # ConnectedAccounts, CheckEmails, AccountRow (6 components)
    fournisseurs/          # SupplierDetailModal, SupplierEditForm
  contexts/
    AuthContext.tsx         # Supabase auth state (user, session)
    I18nContext.tsx          # Language switching FR/PT
  hooks/
    useUploadDeps.ts        # Upload dependencies (OAuth tokens, companies)
  lib/
    supabase/client.ts      # Supabase client (anon key only)
    google/drive.ts         # Google Drive API (folder hierarchy, upload)
    google/sheets.ts        # Google Sheets API
    gemini.ts               # Frontend → Edge Function analyze-document
    invoiceProcessor.ts     # Pipeline completo upload → analyze → save → drive
    rateLimiter.ts          # Rate limiting APIs (client-side)
    utils/validation.ts     # formatEUR, formatDate, validation helpers
    utils/suppliers.ts      # normalizeSupplierName (60+ suppliers)
    cn.ts                   # Tailwind class merger
    i18n.ts                 # Traducoes FR/PT
  pages/
    Dashboard.tsx           # Metrics, charts, recent invoices
    Inbox.tsx               # New invoices awaiting review
    Faturas.tsx             # Invoice management, filtering, bulk actions
    Upload.tsx              # Document upload & AI processing
    Fournisseurs.tsx        # Supplier management
    Settings.tsx            # Company & email settings
    Automations.tsx         # Email sync, Google account config
    Login.tsx               # Supabase email/password auth
  types/
    database.ts             # Invoice, Company, Supplier, Category, enums
supabase/
  functions/
    analyze-document/       # OpenRouter → Gemini 2.5 Pro (prompt FR construction)
    sync-email/             # Gmail API sync (cron 23:58, 2 contas)
    oauth-callback/         # Google OAuth token exchange
    refresh-token/          # Google token renewal (5min buffer)
```

## Base de Dados (Supabase)

### Tabelas principais
- `companies` — LGM, Holding, Imobiliaria (com SIRET, SIREN, TVA intra)
- `invoices` — Faturas com campos FR (montant_ht, montant_tva, montant_ttc, taux_tva, autoliquidation)
- `invoice_line_items` — Linhas individuais de cada fatura
- `suppliers` — Fornecedores com SIRET, IBAN, auto-learn defaults, sous-traitant flag
- `categories` — Categorias por empresa (metier, type_cout, nature_depense)
- `email_accounts` — Contas Gmail para sync (2 contas activas)
- `user_oauth_tokens` — Tokens OAuth Google (RLS por user_id)
- `audit_log` — Historico de alteracoes (trigger automatico)

### Emails configurados
- andreribeirodefaria@gmail.com
- bbarealestatepartners@gmail.com

### Categorias LGM
**Por metier:** Electricite, Plomberie, Chauffage, Platrerie, Autre
**Por type cout:** Couts fixes, Couts variables
**Por nature:** Materiaux, Sous-traitants, Location materiel, Restauration, Carburant, Atelier, Assurances, Comptabilite, Fournitures bureau, Autre

### Fornecedores Principais
LEROY MERLIN, POINT P, REXEL, YESSS (CEF SAS), WURTH, LUCIAT (ISDI), CEDEO, KILOUTOU, LOXAM, HILTI, SONEPAR, BIGMAT TOUJAS & COLL

### Google Drive Structure
```
FACTURES/
  {ENTREPRISE}/
    {ANNEE}/
      {MM} - {Mois}/
        {Metier}/
          YYYY-MM-DD_FOURNISSEUR_MONTANT.pdf
```

### TVA France
- 20% (taux normal) — construcao nova, materiais
- 10% (taux intermediaire) — renovacao edificios >2 anos
- 5.5% (taux reduit) — renovacao energetica
- 0% (autoliquidation) — sous-traitants (art. 283-2 nonies CGI)

## Roles
- Admin (Alvaro): acesso total, config, todas as empresas
- Utilisateur (Secretaria): gerir faturas, dashboard, exportar
- Comptable (futuro): read-only exportacoes

## Edge Functions
| Funcao | Trigger | Auth | CORS | Descricao |
|--------|---------|------|------|-----------|
| analyze-document | POST (frontend) | JWT verify | Whitelist | OpenRouter → Gemini 2.5 Pro analise FR |
| sync-email | POST (frontend) / cron | JWT verify | Whitelist | Gmail API 2 contas |
| oauth-callback | GET (Google redirect) | State param | Whitelist | Guardar tokens OAuth |
| refresh-token | POST (frontend) | JWT + ownership | Whitelist | Renovar tokens expirados |

### Edge Function Secrets (Deno.env.get)
- `OPENROUTER_API_KEY` — analyze-document
- `GOOGLE_CLIENT_ID` — sync-email, oauth-callback, refresh-token
- `GOOGLE_CLIENT_SECRET` — sync-email, oauth-callback, refresh-token
- `SUPABASE_URL` — all except analyze-document
- `SUPABASE_SERVICE_ROLE_KEY` — sync-email, oauth-callback, refresh-token
- `SUPABASE_ANON_KEY` — refresh-token, analyze-document, sync-email
- `FRONTEND_URL` — oauth-callback

### Frontend Env Vars (VITE_*)
- `VITE_SUPABASE_URL` — Supabase API endpoint
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous key (public)
- `VITE_GOOGLE_CLIENT_ID` — Google OAuth client ID

## Rate Limits
| API | Limite |
|-----|--------|
| Gemini | 60 req/min |
| Google Drive | 100 req/min |
| Google Sheets | 100 req/min |
| Gmail API | 250 quota units/user/sec |

## Timeouts
| API | Timeout |
|-----|---------|
| Gemini (Edge Function) | 120s |
| Google Drive (upload) | 120s |
| Google Drive (operacoes) | 30s |
| Google Sheets | 30s |

## Security Remediations Pendentes
- [ ] Assinar OAuth state param com HMAC (C3 — prevenir token injection)
- [ ] Tornar storage bucket `invoices` privado (H1)
- [ ] Encriptar OAuth tokens at rest com pgcrypto (H2)
- [ ] Adicionar RLS por company_id em invoices (M2)
- [ ] Restringir suppliers/categories RLS a admin (M3/M4)
- [ ] Rate limiting server-side nas Edge Functions (L2)
