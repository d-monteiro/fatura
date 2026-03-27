# FaturaAI - LGM (Construction France)

## Projeto
Plataforma de faturacao com IA para LGM (construcao civil, Franca). Multi-empresa (LGM, Holding, Imobiliaria). Utilizadora principal: secretaria francesa. Idioma interface: FR com toggle PT/FR.

## Stack
- Frontend: React 18 + Vite + TypeScript + Shadcn/UI + Tailwind CSS
- Backend: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- AI/OCR: OpenRouter → Gemini 2.5 Pro (visao direta, sem OCR separado)
- Storage ficheiros: Google Drive API (hierarquia de pastas)
- Email sync: Gmail API via Edge Function (cron 23:58)
- Export: Excel .xlsx via SheetJS
- Deploy: Vercel
- Supabase ref: wvopuqyotvwgronujvrb

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
- Edge functions server-to-server devem verificar service role key
- Webhook signature verification OBRIGATORIA
- Soft delete SEMPRE (deleted_at em vez de DELETE real)
- Audit log para alteracoes em faturas (quem mudou o que, quando)
- Dados sensiveis (tokens OAuth, SIRET) protegidos por RLS
- CORS: apenas dominios autorizados (producao + localhost dev)
- Nunca expor SUPABASE_SERVICE_ROLE_KEY no frontend

### Armadilhas Conhecidas
- **AUTH DEADLOCK:** NUNCA await Supabase calls dentro de `onAuthStateChange` callback — causa `navigator.locks` deadlock
- **Auth loading state:** Usar condicao THREE-WAY: `loading ? null : isAuthenticated ? menu : login`
- **RLS recursion:** Policies que fazem query a mesma tabela → usar SECURITY DEFINER helpers
- **Edge function secrets:** Apos adicionar secrets no Dashboard, pode precisar REDEPLOY
- **Gemini markdown wrapping:** Gemini por vezes devolve JSON com ```json wrapping — sempre limpar
- **French number parsing:** Virgula e decimal, espaco e milhares. NUNCA confundir com formato US
- **TVA autoliquidation:** Faturas de sous-traitants tem 0% TVA — campo especifico obrigatorio
- **HEIC fotos iPhone:** Converter para JPEG server-side antes de enviar ao Gemini

## Comandos
```bash
npm run dev          # Dev server
npm run build        # Build producao (testar SEMPRE)
npm run lint         # ESLint
```

## Estrutura do Projeto
```
src/
  components/
    ui/              # Shadcn UI
    common/          # ErrorBoundary, Loading, LanguageToggle
  features/
    auth/            # AuthContext, ProtectedRoute, Login
    dashboard/       # MetricCards, Charts, RecentTable
    inbox/           # InboxList, ReviewDialog (faturas novas)
    faturas/         # FaturasTable, Filters, DetailDrawer
    upload/          # UploadZone, ProcessingStatus
    fournisseurs/    # SupplierList, SupplierDetail
    settings/        # Companies, Categories, EmailAccounts
  lib/
    supabase/        # Client, types, hooks
    google/          # Drive, Sheets, Gmail APIs
    gemini.ts        # Cliente frontend para Edge Function
    invoiceProcessor.ts  # Pipeline completo upload
    rateLimiter.ts   # Rate limiting APIs
    i18n.ts          # Traducoes FR/PT
  pages/
    Dashboard.tsx
    Inbox.tsx
    Faturas.tsx
    Upload.tsx
    Fournisseurs.tsx
    Parametres.tsx
    Automations.tsx
  types/
    database.ts      # Interfaces Invoice, Company, Supplier, etc.
supabase/
  functions/
    analyze-document/   # Gemini 2.5 Pro (prompt FR)
    sync-email/         # Gmail sync (cron 23:58)
    oauth-callback/     # Google OAuth
    refresh-token/      # Token renewal
```

## Base de Dados (Supabase)

### Tabelas principais
- `companies` — LGM, Holding, Imobiliaria
- `invoices` — Faturas com campos FR (montant_ht, montant_tva, montant_ttc, taux_tva)
- `invoice_line_items` — Linhas individuais de cada fatura
- `suppliers` — Fornecedores com SIRET, auto-learn
- `categories` — Categorias por empresa (metier, type_cout, nature)
- `email_accounts` — Contas Gmail para sync (2 contas)
- `user_oauth_tokens` — Tokens OAuth Google
- `audit_log` — Historico de alteracoes

### Emails configurados
- andreribeirodefaria@gmail.com
- bbarealestatepartners@gmail.com

### Categorias LGM
**Por metier:** Electricite, Plomberie, Chauffage, Platrerie, Autre
**Por type cout:** Couts fixes, Couts variables
**Por nature:** Materiaux, Sous-traitants, Location materiel, Restauration, Carburant, Atelier, Assurances, Comptabilite, Fournitures bureau, Autre

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
| Funcao | Trigger | Descricao |
|--------|---------|-----------|
| analyze-document | POST (frontend) | OpenRouter → Gemini 2.5 Pro analise FR |
| sync-email | pg_cron 23:58 | Gmail API 2 contas |
| oauth-callback | GET (Google redirect) | Guardar tokens OAuth |
| refresh-token | POST (frontend) | Renovar tokens expirados |

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
