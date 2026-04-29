# PLAN_FEEDBACK.md — FaturaAI: Iteração pós-sessão de uso real (2026-04-28)

> **Contexto:** sessão longa de uso real da app em produção (`fatura.flowzi.pt`) gerou ~30 itens de feedback, da onboarding até admin, passando por inbox, faturas, fornecedores, categorias, exports e suporte. Este plano organiza, deduplica, prioriza e converte tudo em tarefas accionáveis.
>
> **Objectivo:** entregar uma versão da app onde (a) não há bugs bloqueantes (CORS, marcar pago, IVA inconsistente), (b) o onboarding deixa de ter passos redundantes e parar de redireccionar para sítios errados depois de OAuth, (c) read-only é mesmo read-only, (d) qualquer item da inbox abre num modal único e útil, (e) duplicação de faturas e fornecedores deixa de aparecer ao utilizador.
>
> **Regra de ouro:** seguir CLAUDE.md (anti-slop, ≤150 LOC por componente, sem `any`, grep antes de escrever, fix root cause). Não criar ficheiros `.md` adicionais — este é o único plano desta iteração. **Nada aqui é nova arquitectura**: é tapar buracos, refinar lógica que já existe (Pilar 5/6 do PLAN_FASE2 já entregues) e cortar UX.
>
> **Notas sobre o que já existe (memory):**
> - Detecção de duplicados (3-strategy + UI) já entregue no Pilar 5.3 → o problema agora é refinamento.
> - Multi-utilizador (3 roles + convite com token + página `/invite/:token`) já entregue no Pilar 6 → falta enforcement real do papel `readonly`.
> - SAF-T export e alertas de prazo já entregues.

---

## ÍNDICE

1. [Pilar A — Bugs bloqueantes (P0)](#a)
2. [Pilar B — Onboarding: cortar, clarificar, desbloquear pós-OAuth](#b)
3. [Pilar C — Convites e papel Read-only de verdade](#c)
4. [Pilar D — Visualização universal de documentos (Inbox + Modal)](#d)
5. [Pilar E — Qualidade dos dados (duplicação, status, IVA, NIF)](#e)
6. [Pilar F — Categorias, tipos de documento e filtros](#f)
7. [Pilar G — Admin, suporte e exports](#g)
8. [Ordem de execução recomendada](#ordem)
9. [Métricas de sucesso](#metricas)
10. [Riscos transversais](#riscos)

---

<a id="a"></a>
## PILAR A — Bugs Bloqueantes (P0)

> Tudo aqui é "produção partida". Atacar primeiro.

### A1 — CORS quebra "Forçar sync de email" no admin

**Sintoma:** `Access to fetch at '.../sync-email' has been blocked by CORS policy: Request header field x-admin-tenant-id is not allowed by Access-Control-Allow-Headers in preflight response.`

**Causa raiz:** [supabase/functions/_shared/cors.ts:36](supabase/functions/_shared/cors.ts#L36) lista `"authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-secret"` mas **omite `x-admin-tenant-id`**. O cliente envia esse header em [src/components/admin/TenantBetaControls.tsx:53](src/components/admin/TenantBetaControls.tsx#L53) e o Edge Function lê-o em [supabase/functions/sync-email/index.ts:47](supabase/functions/sync-email/index.ts#L47). Preflight rejeita.

**Fix (S):**
1. Adicionar `x-admin-tenant-id` ao `Access-Control-Allow-Headers` em `cors.ts`.
2. Auditar **todos** os custom headers que o frontend envia vs. o que o `cors.ts` permite (`grep -r "headers:" src/lib | grep -i "x-"`). Provavelmente este é o único, mas confirmar.
3. Redeploy de **todas** as Edge Functions (não só sync-email — qualquer função admin que partilhe `cors.ts` herda a fix).

**Esforço:** 30 min. **Dependências:** nenhuma.

---

### A2 — "Marcar como pago" não faz nada

**Sintoma:** clicar em "Marcar como pago" no detalhe da fatura: nada acontece, sem toast, sem update.

**Causa provável:** o campo `paid_at` foi adicionado no Pilar 5.2 (memory `project_pilar5_state.md`), mas a UI invoca uma mutation que ou (a) não está implementada, (b) está implementada mas não invalida a lista, ou (c) está bloqueada por RLS para `member` (só `owner`/`admin` podem marcar?).

**Tarefas (S):**
1. Localizar o handler do botão (`grep -r "marcar.*pago\|mark.*paid\|paid_at" src/components/faturas src/pages/Faturas.tsx`).
2. Se mutation falta: implementar `UPDATE invoices SET paid_at = now() WHERE id = ?`, com `invalidateInvoiceLists(qc)` no `onSuccess`.
3. Se RLS bloqueia: verificar policy — qualquer membro com role `member`+ deve poder marcar pago (não é destrutivo).
4. Se já existia mas estava silenciosa: adicionar `toast.success` + actualizar badge para "Pago" no `StatusBadge`.
5. Bonus: adicionar acção em massa via [BulkActionBar.tsx](src/components/faturas/BulkActionBar.tsx).

**Esforço:** 2-3h.

---

### A3 — Leads abrem em rota errada no admin

**Sintoma:** notificação Slack de novo lead → click em "Abrir no admin" leva a `/admin/onboarding`, que não é onde os leads estão.

**Tarefas (S):**
1. Confirmar onde leads ficam (provavelmente tabela `enterprise_leads` ou `onboarding_submissions` filtrada por `selectedPlan='entreprise'`).
2. Identificar que página devia abrir — candidatos: nova `/admin/leads`, ou tab dentro de [admin/AdminTenants.tsx](src/pages/admin/AdminTenants.tsx).
3. Corrigir o link/URL na notificação Slack (`grep -r "admin/onboarding" src/lib/slack supabase/functions`).
4. Se a página não existe ainda, criar tabela mínima `LeadsList` com colunas: nome, empresa, plano pedido, data, contacto, estado, botão "Marcar como contactado / convertido".

**Esforço:** 4-6h (depende de existir ou não a página).

---

### A4 — Fatura "Fidelidade" com matemática de IVA inválida

**Sintoma:** valor s/IVA = 186,12; valor c/IVA = 212,85; mas `taxa_iva = 0%`. Matematicamente impossível.

**Causa raiz:** o Gemini está a extrair um campo que parece ser "valor s/IVA" mas na verdade é um "prémio comercial" (linha decorativa do PDF). A combinação dos campos nunca foi validada server-side.

**Tarefas (M):**
1. **Validador no Edge Function** ([supabase/functions/analyze-document/index.ts](supabase/functions/analyze-document/index.ts)) após o `JSON.parse` do output Gemini:
   - Se `valor_total != null && valor_sem_iva != null && valor_iva != null`: verificar `Math.abs((valor_sem_iva + valor_iva) - valor_total) < 0.02`.
   - Se `taxa_iva === 0` mas `valor_iva > 0` ou `valor_total > valor_sem_iva + 0.02`: inconsistente.
   - Se `taxa_iva > 0`: verificar `Math.abs(valor_sem_iva * (1 + taxa_iva/100) - valor_total) < 0.02`.
   - Em qualquer inconsistência: marcar `manual_review = true`, `status = 'review'`, popular `review_reason = 'iva_inconsistente'` (novo campo TEXT — migration).
2. **Reforçar prompt Gemini** ([_shared/promptBuilder.ts](supabase/functions/_shared/promptBuilder.ts)): regra explícita "se houver subtotal ‑ desconto ‑ prémio ‑ etc., só usar a linha rotulada literalmente como base tributável / valor sem IVA / total líquido. Nunca confundir prémios comerciais com base tributável."
3. **UI:** badge "IVA suspeito" + tooltip a explicar a inconsistência (ver E3).

**Esforço:** 1 dia. **Dependências:** Pilar 1 do PLAN_FASE2 (prompt afinado).

---

<a id="b"></a>
## PILAR B — Onboarding: Cortar, Clarificar, Desbloquear Pós-OAuth

> O Pilar 2 do PLAN_FASE2 já tinha como target "5 passos máximos". Esta iteração é a execução concreta + bugs específicos do fluxo OAuth que só apareceram em uso real.

### B1 — De 7 para 5 passos: cortar Step 5 + reformatar Step 4

**Estado actual:** [OnboardingWizard.tsx:33](src/components/onboarding/OnboardingWizard.tsx#L33) declara `TOTAL_STEPS = 7`. Steps em [OnboardingWizard.tsx:352-358](src/components/onboarding/OnboardingWizard.tsx#L352):
1. Empresa
2. Invoice Intel
3. Storage
4. Dashboard (relatórios automáticos)
5. Automation
6. Review
7. Payment + criar conta

**Decisão:** baseado no feedback do utilizador, manter Steps 1, 2, 3, 6, 7 (re-numerados como 1-5). **Cortar Step 5 (Automation)** — é puramente informativo/automático e o utilizador não lê. **Reformatar Step 4 (Dashboard)** sem perguntar email (B3).

**Tarefas:**
1. `TOTAL_STEPS = 5` em [OnboardingWizard.tsx:33](src/components/onboarding/OnboardingWizard.tsx#L33).
2. Migrar lógica útil de [StepAutomation.tsx](src/components/onboarding/StepAutomation.tsx) para uma única linha informativa em StepReview (ex: "Vamos sincronizar os emails uma vez por dia. Podes ligar/desligar em Definições."). Deletar StepAutomation depois de confirmar que nenhum dado é salvo só lá.
3. Renumerar `step === N` no JSX e em `validateStep`/`validateAllUpTo` ([src/lib/onboarding/validation.ts](src/lib/onboarding/validation.ts)).
4. Actualizar `ONBOARDING_STEP_NAMES` em [src/lib/analytics/events.ts](src/lib/analytics/events.ts).
5. Actualizar [ProgressBar.tsx](src/components/onboarding/ProgressBar.tsx) — verifica que `totalSteps={5}` chega correctamente.
6. Limpar `loadStoredOnboarding` para não puxar `step=5/6/7` antigos do localStorage de utilizadores em curso (clamp: `Math.min(stored.step, TOTAL_STEPS)`).

**Esforço:** 1 dia.

---

### B2 — Step 2: limpar UX da primeira pergunta

**Sintoma:** "estes burros ainda não perceberam" — a primeira pergunta do Step 2 não comunica claramente o que o utilizador deve responder.

**Tarefas (S):**
1. Abrir [StepInvoiceIntel.tsx](src/components/onboarding/StepInvoiceIntel.tsx) e identificar o primeiro input/pergunta.
2. Aplicar padrão consistente: **título grande** ("Como é que aparecem os teus documentos?"), **frase explicativa** ("Marca todos os tipos que recebes — vamos ensinar a IA a reconhecê-los."), **chips ou checkboxes grandes** (não dropdowns escondidos), **exemplo concreto** abaixo (mini print ou texto: "ex.: PDF da MEO, scan de talão da bomba, fatura digital da Anthropic").
3. Validação inline: bloquear "Seguinte" até o utilizador marcar pelo menos 1 opção, com erro claro ("Escolhe pelo menos um tipo de documento. Sem isto, não conseguimos afinar a IA para o teu caso.").

**Esforço:** 3-4h. **Sucesso:** ≥80% dos novos signups passam o Step 2 em <30s sem voltar atrás.

---

### B3 — Step 4 (Dashboard / Relatórios): NÃO pedir email

**Sintoma:** "passo 4 - relatórios automáticos, não pedir email, não faz sentido."

**Causa:** o email do utilizador já está no `auth.users.email`. Pedir outra vez é fricção redundante. Para casos onde o destinatário do relatório é diferente (contabilista), isso é configuração avançada que pertence a Settings → Reports (Pilar 3 do PLAN_FASE2), não ao onboarding.

**Tarefas (S):**
1. Em [StepDashboard.tsx](src/components/onboarding/StepDashboard.tsx), remover qualquer input de `reportEmail`.
2. No [createTenantForCurrentUser](src/components/onboarding/OnboardingWizard.tsx#L156), `report_email: data.reportEmail.trim() || null` → `report_email: activeEmail` (default sensato).
3. UI: substituir o input por uma linha tipo "Vamos enviar para `{user.email}`. Podes mudar/adicionar destinatários em Definições → Relatórios."
4. Manter o toggle frequência (nunca/semanal/mensal) — esse continua a fazer sentido aqui.

**Esforço:** 1h.

---

### B4 — Step 7 (criar conta): clarificar "Google OU email", checkbox de termos visível

**Sintoma:** "as pessoas mesmo assim não sabem que é ou um ou outro e não sabem clicar na checkbox de termos e política de privacidade. Não faz sentido estar onde está."

**Causa:** o [AccountInlinePanel.tsx](src/components/onboarding/AccountInlinePanel.tsx) provavelmente apresenta os 2 caminhos sem hierarquia visual e o `LegalConsentCheckboxes` está enterrado.

**Tarefas (S/M):**
1. Reorganizar AccountInlinePanel:
   - Bloco Google em destaque, com título "**Continuar com Google** (recomendado, 1 clique)" + 1 botão grande.
   - Separador visual claro (`────── ou criar com email ──────`).
   - Form de email/password colapsado por default ou em segundo plano visual.
2. Mover `LegalConsentCheckboxes` para **logo acima** do botão "Continuar com Google" (e do submit do email), não escondido. Tornar a checkbox **obrigatória para qualquer dos caminhos** (validação client + server-side em `finishStarterPro`).
3. Texto da checkbox: "Aceito os [Termos de Utilização](/legal/terms) e a [Política de Privacidade](/legal/privacy)." Links abrem em nova tab.
4. Bloqueio: botão Google e submit email ambos `disabled={!termsAccepted}`. Tooltip: "Aceita os termos para continuar."

**Esforço:** 4-6h.

---

### B5 — Pós-OAuth Google no Step 7: ir directo para dashboard, NÃO voltar ao onboarding

**Sintoma:** "após Google OAuth no passo 7, não faz sentido voltar ao onboarding, vai direto para dashboard."

**Causa raiz:** quando o utilizador faz "Continuar com Google" no Step 7, o callback redirect do Google leva-o de volta a `/onboarding`. O `useEffect` em [OnboardingWizard.tsx:104-121](src/components/onboarding/OnboardingWizard.tsx#L104) verifica se já tem `tenant_users`, mas como acabou de criar a conta ainda não tem → fica preso no Step 7. A intenção é: completar o tenant **automaticamente** no return do OAuth e ir direto para `/`.

**Tarefas (M):**
1. Confirmar que `persistOnboardingNow(data, step)` é chamado em `onBeforeOAuth` (já está, linha 370). OK.
2. No callback do OAuth (ou seja, quando o utilizador volta ao `/onboarding` com `user` recém-criado), **se houver dados completos no localStorage** (`validateAllUpTo(TOTAL_STEPS, stored.data) === null`) **e não houver tenant**, despoletar `finishStarterPro` automaticamente sem clicar em nada. Já há um sinal: `isFreshOAuthUser` ([linha 285](src/components/onboarding/OnboardingWizard.tsx#L285)).
3. Mostrar um spinner full-screen durante esse auto-submit ("A finalizar a tua conta…") em vez do Step 7.
4. Edge cases:
   - Dados inválidos no localStorage: voltar para o primeiro step inválido, não submeter.
   - Já tem tenant: o redirect existente para `/` cobre.
5. Testar: abrir incognito → onboarding → preencher tudo → OAuth Google novo → verificar que aterra em `/` sem ver o Step 7 outra vez.

**Esforço:** 1 dia.

---

### B6 — Pós-OAuth "Ligar conta Google" (em Settings): NÃO redireccionar para /upload nem para onboarding

**Sintoma:** "não faz sentido ele redireccionar para /upload após o Google OAuth de ligar conta."

**Causa raiz:** o redirect `state` ou `return_url` do OAuth callback está hardcoded para `/upload` em algum sítio (provavelmente em [src/lib/google/oauth.ts](src/lib/google/oauth.ts) ou no Edge Function `oauth-callback`).

**Tarefas (S):**
1. `grep -r "/upload" src/lib/google supabase/functions/oauth-callback` para encontrar.
2. Padrão correcto: o `state` do OAuth deve incluir `return_to` baseado no `window.location.pathname` antes do redirect. Quem inicia da página `/settings` volta para `/settings`. Quem inicia de outro sítio volta para esse outro sítio.
3. Helper único `redirectToGoogleOAuth({ scopes, returnTo: window.location.pathname })` em [src/lib/google/oauth.ts](src/lib/google/oauth.ts) — CLAUDE.md já obriga a usar este helper, então o problema pode estar no helper, não em chamadas dispersas.
4. Validar que o callback faz `navigate(state.return_to ?? '/')` em vez de hardcoded.

**Esforço:** 2-3h.

---

### B7 — Botão "Verificar emails" desactivado até ligar Google

**Sintoma:** "botão de verificar emails agora tem de estar desactivado até ligar conta google."

**Causa:** UX confusa — utilizadores clicam, falha silenciosamente ou dá erro feio.

**Tarefas (S):**
1. Localizar o botão (provavelmente [src/components/automations/CheckEmails.tsx](src/components/automations/CheckEmails.tsx) ou em Settings).
2. Verificar se `tenant.has_gmail_account` ou equivalente está disponível (query a `google_accounts WHERE has_gmail_scope=true`).
3. `disabled={!hasGmailAccount}`, com tooltip: "Liga primeiro uma conta Google em Definições → Contas Google."
4. Bonus: link directo no tooltip → `/settings#google` ou abrir o dialog de connect inline.

**Esforço:** 1-2h.

---

### B8 — Utilizadores logged-in sem tenant: poder sair do onboarding

**Sintoma:** "pessoas já logged in não devem ser obrigados a ir para onboarding, deviam conseguir ir à homepage e até dar logout da home e do onboarding."

**Causa raiz:** [RequireTenant](src/components/auth/RequireTenant.tsx) bloqueia tudo até `onboarding_completed=true`. Quem fica preso a meio (ex.: criou conta Google mas abandonou no Step 3) não consegue voltar à landing nem fazer logout. Loop frustrante.

**Tarefas (S):**
1. **No header do `OnboardingWizard`** ([linha 326-342](src/components/onboarding/OnboardingWizard.tsx#L326)) adicionar:
   - Link "Voltar à landing" (left side, secundário).
   - Menu utilizador (dropdown) com email + "Sair" → `supabase.auth.signOut()` + `navigate('/')`.
2. **Na landing** ([src/pages/Landing.tsx](src/pages/Landing.tsx)): quando `user` está autenticado, mostrar header com email + Sair + "Continuar onboarding" (em vez do CTA "Criar conta").
3. **RequireTenant:** permitir as rotas `/`, `/legal/*`, `/logout` mesmo sem tenant. Restantes redireccionam para `/onboarding/<step actual>`.
4. **Testar:** logged-in user sem tenant deve conseguir: ver `/`, fazer signOut da landing, fazer signOut do onboarding, voltar de qualquer momento ao onboarding e retomar do mesmo step.

**Esforço:** 4-6h.

---

<a id="c"></a>
## PILAR C — Convites e Papel Read-only de Verdade

> Memory `project_pilar6_state.md` confirma que 3 roles (`owner`, `member`, `readonly`), convites com token e página `/invite/:token` foram entregues. Mas o role `readonly` em produção comporta-se como `member`. Crítico para vender ao contabilista.

### C1 — Default tab no `/invite/:token` = "Criar conta"

**Estado actual:** [InviteAccept.tsx:60](src/pages/InviteAccept.tsx#L60) — `useState<Tab>('login')`. A maioria dos convidados (contabilistas, novos colaboradores) **nunca usaram o FaturaAI**, logo o default certo é "Criar conta".

**Fix (XS):** trocar para `useState<Tab>('signup')`.

**Esforço:** 5 min.

---

### C2 — Read-only é mesmo read-only (enforcement real)

**Estado actual:** o role existe na BD, a UI distingue labels ([InviteAccept.tsx:16-20](src/pages/InviteAccept.tsx#L16)), mas **as RLS policies e a UI tratam `readonly` igual a `member`**. Resultado: o utilizador read-only consegue ver/usar Upload, Settings, faturação, etc.

**Tarefas (M/L) — abordagem em camadas:**

#### C2.1 — RLS server-side (fonte da verdade)

1. Auditar **todas** as policies `INSERT/UPDATE/DELETE` em tabelas `invoices`, `invoice_line_items`, `suppliers`, `categories`, `companies`, `tenants` e Storage `invoices`. Usar `mcp__supabase__list_tables` + `get_advisors` para mapear.
2. Adicionar predicate: `(SELECT role FROM tenant_users WHERE user_id = (select auth.uid()) AND tenant_id = invoices.tenant_id) IN ('owner', 'admin', 'member')` para qualquer mutation. `readonly` falha automaticamente.
3. SELECT continua aberto a `readonly`.
4. Helper SQL `SECURITY DEFINER` se houver risco de recursion.

#### C2.2 — UI: hook + gate

1. Criar `src/hooks/useRole.ts`: `useRole(): { role: Role; can: (action: 'edit_invoice' | 'upload' | 'manage_billing' | 'manage_team' | 'view_settings_personal' | ...) => boolean }`.
2. Matriz de permissões num único módulo `src/lib/auth/permissions.ts`:
   ```
   readonly:    [view_invoices, view_dashboard, export, view_suppliers, view_categories,
                 view_settings_personal, view_settings_password, support]
   member:      readonly + [upload, edit_invoice, mark_paid, manage_suppliers, manage_categories,
                            manage_email_accounts (próprias), trigger_sync]
   admin:       member + [invite_members, manage_companies, manage_billing_view]
   owner:       admin + [manage_billing, delete_tenant]
   ```
3. **Sidebar** ([src/components/layout/Sidebar.tsx](src/components/layout/Sidebar.tsx)): esconder Upload, Faturação (billing), Definições > Equipa para `readonly`. Mostrar apenas Definições > Conta + Definições > Password + Suporte.
4. **Páginas:** wrapper `<RequirePermission action="..."><Page/></RequirePermission>` que faz `Navigate('/')` ou ecrã "Sem permissão" para acções negadas.
5. **Botões inline** (editar fatura, eliminar, marcar pago): `disabled` + tooltip "Conta de consulta — sem permissão para editar."

#### C2.3 — Definições reduzidas

Para `readonly`, página `/settings` mostra apenas:
- Card "Conta" (nome, email — editável).
- Card "Password" (mudar password).
- Card "Suporte" (link form — ver G3).
- Tudo o resto **escondido**, não apenas desactivado (cleaner).

**Esforço total:** 2 dias.

---

### C3 — Componente reutilizável "Ligar Conta Google" para excluir do read-only

**Sintoma:** "pede para ligar conta google (separar isto e tornar um componente para ser mais fácil retirar dos read only)."

**Tarefas (S):**
1. Identificar onde o prompt "ligar Google" aparece (provavelmente [src/components/settings/GoogleAccountsUnified.tsx](src/components/settings/GoogleAccountsUnified.tsx) e talvez no Onboarding/Step ou em Automations).
2. Extrair para um único componente `GoogleAccountConnectCard` consumido nos vários sítios.
3. Em `readonly`, esse componente devolve `null` (controlado pelo hook do C2.2).
4. Bonus: o convite `/invite/:token` para `readonly` **não deve sequer mencionar** ligação a Google — actualizar `ROLE_DESC` em [InviteAccept.tsx:18](src/pages/InviteAccept.tsx#L18).

**Esforço:** 3h.

---

<a id="d"></a>
## PILAR D — Visualização Universal de Documentos (Inbox + Modal)

### D1 — Modal universal: qualquer item da inbox abre como fatura

**Sintoma:** "não ser doc nem fatura deve aparecer o modal como se fosse fatura para fácil visualização sem precisar de abrir o link."

**Estado actual:** [InvoiceDetailDrawer.tsx](src/components/faturas/InvoiceDetailDrawer.tsx) só funciona para items com `status='processed'/'review'/'inbox'` que são tratados como faturas. Items "ignored" (não-fatura) abrem direct no Drive ou nem abrem.

**Tarefas (M):**
1. Generalizar `InvoiceDetailDrawer` ou criar `DocumentPreviewDrawer` que aceita qualquer registo `documents`/`invoices` (mesma tabela hoje? confirmar com `mcp__supabase__list_tables`).
2. Para items não-fatura: mostrar pré-visualização do PDF/imagem (já existe via [InvoiceDocPreview.tsx](src/components/faturas/InvoiceDocPreview.tsx)) + meta-dados extraídos pelo Gemini (título, fornecedor presumível, data, razão para ignorar).
3. Acções aplicáveis: "Reclassificar como fatura", "Eliminar", "Re-processar".
4. Click outside fecha (D2).

**Esforço:** 1 dia.

---

### D2 — Click outside fecha o modal de fatura

**Sintoma:** "clicar fora do modal de fatura deve fechá-lo, sem ter que clicar na cruz."

**Análise:**
- [InvoiceDetailDrawer.tsx:120](src/components/faturas/InvoiceDetailDrawer.tsx#L120) JÁ tem `onClick={onClose}` no overlay — funciona.
- [InvoiceReviewDialog.tsx:48](src/components/faturas/InvoiceReviewDialog.tsx#L48) JÁ tem `onClick={onClose}` no overlay — funciona.
- Provavelmente o problema está em [InvoiceEditDialog.tsx](src/components/faturas/InvoiceEditDialog.tsx) (modo edição), que provavelmente usa `Dialog` shadcn sem `onPointerDownOutside` configurado, ou tem `e.preventDefault()` por causa do form.

**Tarefas (S):**
1. Auditar **todos** os modais relacionados com faturas: `InvoiceEditDialog`, `InvoiceReviewDialog`, `InvoiceNormalDrawer`, `InvoiceDetailDrawer`, `SaftExportDialog`, `ConfirmDialog`, `DuplicatePairCard` (modal?).
2. Padronizar: overlay com `onClick={onClose}`. Conteúdo com `onClick={(e) => e.stopPropagation()}`.
3. **Excepção justificada:** `InvoiceEditDialog` quando há `dirty` (mudanças não guardadas) — em vez de fechar silenciosamente, mostrar `ConfirmDialog` "Descartar alterações?". Sem `dirty`, fecha normal.
4. ESC sempre fecha (já está em alguns; standardizar).

**Esforço:** 3-4h.

---

### D3 — Tab "Ignored": preencher título, fornecedor e data sempre

**Sintoma:** "tudo que está na tab ignored e não é documento/fatura, deve ter o título, fornecedor e data preenchidos na mesma, para ser fácil de identificar."

**Causa raiz:** quando o Gemini classifica como não-fatura, alguns campos podem ficar `null`. A UI [IgnoradasTable.tsx](src/components/faturas/IgnoradasTable.tsx) deve mostrar **sempre** algo identificável — vir do Gemini ou fallback do source (subject do email, nome do ficheiro Drive).

**Tarefas (S):**
1. No prompt do Gemini ([_shared/promptBuilder.ts](supabase/functions/_shared/promptBuilder.ts)): mesmo quando `is_invoice=false`, exigir `title`, `supplier_name_guess`, `date_guess`. Se Gemini não extrai, retornar `null` e preencher a posteriori.
2. No save (`analyze-document` ou pipeline): se `supplier_name == null && source='email'` → usar `email.from_name` como fallback. Se `doc_date == null` → `email.received_at`. Se `title == null` → `email.subject` ou `file_name` do Drive.
3. UI: garantir que esses 3 campos aparecem na linha da tabela mesmo para ignored.

**Esforço:** 4h.

---

### D4 — Items duplicados/com 404 no Drive: re-upload em vez de mostrar 404

**Sintoma:** "FlixBus e Anthropic estão duplicados e aparece 404 no doc, mais vale referenciar o mesmo ou fazer outra introdução no bucket, pq pode estar errado e nem ser duplicado."

**Causa raiz:** quando duplicate detection apanha um par, a fatura "secundária" pode apontar para `drive_file_id` que entretanto foi apagado/movido (ou nunca foi feito upload porque o detector cortou cedo). Resultado: `https://drive.google.com/file/d/X/preview` devolve 404.

**Tarefas (S/M):**
1. Validar a hipótese: query `SELECT id, supplier_name, drive_file_id FROM invoices WHERE drive_file_id IS NOT NULL` + `HEAD` request a cada para detectar 404. Pode haver script de saúde diário.
2. **Quando detectar duplicado** ([invoiceProcessor.ts](src/lib/invoiceProcessor.ts)): em vez de descartar a secundária silenciosa, **fazer upload do PDF para Drive na mesma**, salvar como `invoices.duplicate_of = primary_id` + `status='processed'`, mas mantém `drive_file_id` próprio.
3. **Para fatura existente com 404:** botão "Re-uploadar do email original" no modal — chama Edge Function que vai à mensagem Gmail, baixa o anexo, faz upload para Drive, actualiza `drive_file_id`.
4. Eliminar a noção de "duplicado sem ficheiro" — toda a fatura na BD tem ficheiro válido na Drive.

**Esforço:** 1 dia.

---

<a id="e"></a>
## PILAR E — Qualidade dos Dados

### E1 — Refinar dedup de faturas (Rede Expressos, FlixBus, Anthropic)

**Estado actual:** Pilar 5.3 entregou `find_potential_duplicates` RPC + widget Dashboard + `/invoices/duplicates`. Mas em produção apareceu:
- Rede Expressos: pega na **fatura E no bilhete** do mesmo email → 2 registos.
- FlixBus, Anthropic: duplicados clássicos não apanhados pelas 3 estratégias.

**Diagnóstico:**
- Caso "fatura+bilhete" do mesmo email: **mesmo PDF? ou 2 anexos diferentes?** Se 2 anexos, `file_hash` não chega — precisa de dedup ao nível "1 fatura por email" se ambos forem do mesmo fornecedor + valor.
- FlixBus/Anthropic: provavelmente o `doc_number` é extraído com formato ligeiramente diferente em cada chamada (Gemini não-determinístico) → estratégia 1 falha. Estratégia 2 (supplier+date+amount fuzzy) devia apanhar — investigar threshold.

**Tarefas (M):**
1. **Adicionar 4ª estratégia "1 fatura per email message"**: se `email_message_id` é o mesmo entre 2 faturas, **manter só uma** (a com mais campos preenchidos). Bilhete pode ser anexo separado mas raramente queres registá-lo como custo independente.
2. **Reduzir threshold da estratégia 2** de `similarity >= 0.7` para `>= 0.5` (mais agressivo). Trade-off: mais falsos positivos no widget. Aceitável: o widget pede confirmação humana antes de eliminar.
3. **Normalizar `doc_number` antes de comparar:** strip espaços, minúsculas, remover prefixo do fornecedor (ex: "FT-2024/0001" e "FT 2024/0001" e "FT2024/0001" devem matchar).
4. **Logging:** quando duplicate detection NÃO apanha um par que parece óbvio (verificável pelo widget posterior), registar em `error_logs` com `severity='info'` e os 2 IDs — depois iterar com base nesses dados.

**Esforço:** 1 dia.

---

### E2 — Dedup de fornecedores (RNE / Rede Nacional Expressos)

**Sintoma:** "fornecedor RNE (rede nacional expressos) duplicou."

**Causa raiz:** o Gemini extrai o nome em formato livre — "Rede Nacional Expressos", "RNE", "Rede Nac. Expressos" — e cada um cria um `suppliers` row novo se a comparação for por nome exacto.

**Tarefas (M) — abordagem rule-based primeiro (não AI):**
1. **NIF é a chave canónica.** Se 2 fornecedores têm o mesmo `nif` válido (9 dígitos PT), são o mesmo. Migration: índice único `(tenant_id, nif) WHERE nif IS NOT NULL`.
2. **Antes de inserir** ([src/lib/utils/suppliers.ts](src/lib/utils/suppliers.ts)): `findOrCreateSupplier({ name, nif })`:
   - Se `nif`: SELECT por NIF. Se existe, retornar id e fazer UPDATE do `name` se o novo for mais longo (mais informativo).
   - Se sem `nif`: SELECT por nome normalizado (lowercase, sem acentos, espaços colapsados). Aplicar `pg_trgm similarity >= 0.85` antes de criar novo.
3. **Backfill: RPC `merge_suppliers(primary_id, secondary_id)`** que move todas as `invoices.supplier_id = secondary` para `primary`, depois soft-delete `secondary`.
4. **UI Settings → Fornecedores:** botão "Detectar duplicados" → lista pares com `similarity >= 0.7` ou mesmo NIF → utilizador escolhe primary + clica "Fundir".
5. **Não usar AI para isto** — o cost/benefit não compensa quando rule-based resolve 95% dos casos.

**Esforço:** 1 dia.

---

### E3 — Status "Em revisão" sem clareza

**Sintoma:** "fatura da fidelidade ficou eternamente em revisão. Não devia dizer na tag algo tipo: 'necessita de verificação manual'? Ou a verificar é o LLM que ainda está a tentar mas falhou?"

**Causa raiz:** `status='review'` cobre 2 casos hoje: (a) a IA não teve confiança suficiente, (b) a IA falhou tecnicamente (timeout, parse error, validação E4 falhou). UI não distingue.

**Tarefas (S):**
1. Adicionar coluna `invoices.review_reason` (TEXT, nullable). Valores: `low_confidence`, `iva_inconsistente`, `parse_error`, `timeout`, `manual_request`.
2. Em `analyze-document`, popular `review_reason` consistentemente.
3. **UI** ([StatusBadge.tsx](src/components/faturas/StatusBadge.tsx)): mostrar "Verificação manual" + tooltip com texto humano por reason. Cores distintas: amber para low_confidence, red para erros técnicos.
4. **Acção "Re-tentar análise"**: botão no modal para faturas em `parse_error` ou `timeout` que re-chama `analyze-document` com o ficheiro original.
5. **Watchdog cron**: faturas em `status='review'` há mais de 7 dias sem acção → enviar email de lembrete ao tenant ("3 faturas a precisar de revisão").

**Esforço:** 1 dia. **Sinergia:** A4 (validação IVA) escreve `review_reason='iva_inconsistente'`.

---

### E4 — Validação de cálculo IVA (relacionado com A4)

Coberto em A4. Pôr aqui só para referência cruzada.

---

### E5 — "Aviso de pagamento" classificado como fatura

**Sintoma:** "aviso de pagamento da dominios.pt apareceu como fatura - é suposto? nem sei."

**Decisão pedida:** o utilizador não tem certeza se é bug. Precisa de regra de negócio.

**Recomendação:**
- **Aviso de pagamento** (recibo / pre-aviso de débito) **não é fatura** mas é **documento financeiro relevante**.
- Adicionar `document_type = 'aviso_pagamento'` ao prompt + enum.
- Mostrar em tab própria ou misturar em "Inbox" com badge claro.
- Para efeitos de relatórios/SAF-T: **excluir por default** (não conta como custo).

**Tarefas (S):**
1. Prompt: lista explícita de `document_type` com regras (fatura, recibo, nota_credito, aviso_pagamento, talão, orçamento, ignored_other).
2. Migration: extender enum/check constraint.
3. UI: badge dedicado + filtro nos relatórios.

**Esforço:** 4-6h. **Sinergia:** F2 (tipos de documento como secção formal).

---

### E6 — NIF: normalização e validação

**Sintoma 1:** "fornecedor UP FOZ fica com nif PT... em vez de ser só número, ao contrário dos outros."
**Sintoma 2:** "devo ter verificação de nif dos fornecedores pq só começam por 5?"

**Decisão de regras (PT-only, conforme schema):**
- NIF PT são 9 dígitos. Primeiro dígito **não é só "5"**: 1/2/3 = singular, 5 = colectiva, 6/7/8/9 = entidades especiais. Empresas são tipicamente 5xx, mas particulares como fornecedor de serviços podem ter 1/2/3xx.
- Prefixo "PT" não pertence ao NIF — é country code para VIES (intra-UE).
- Há um algoritmo de **dígito de controlo** (módulo 11) que valida formalmente.

**Tarefas (S):**
1. Helper único `src/lib/utils/nif.ts`:
   ```
   normalizeNifPT(raw): string  // strip "PT", espaços, não-dígitos. Devolve 9 chars ou null.
   isValidNifPT(nif): boolean   // 9 dígitos + algoritmo módulo 11.
   nifKindPT(nif): 'singular' | 'colectiva' | 'outro' | 'invalido'
   ```
2. Aplicar `normalizeNifPT` em **todos** os pontos de entrada: extracção Gemini, formulário "criar fornecedor", import de SAF-T, edição de fornecedor.
3. UI: input com mask `### ### ###`, validação inline com mensagem clara ("NIF inválido — verifica o último dígito").
4. **Não bloquear** insert se NIF inválido — só warning. Há fornecedores reais com NIF mal extraído pelo Gemini que precisam de ser editados depois.
5. Backfill: script que corre `normalizeNifPT` em `suppliers` existentes (UP FOZ e quaisquer outros com prefixo "PT").

**Esforço:** 4-6h. **Sinergia:** E2 (dedup por NIF canónico).

---

<a id="f"></a>
## PILAR F — Categorias, Tipos de Documento e Filtros

### F1 — Cadeado de categorias: legenda + repensar fixo/variável

**Estado actual:** [CategoriesCard.tsx:91](src/components/settings/CategoriesCard.tsx#L91) descreve mas não mostra legenda visual. Cadeado violeta = fixo, cinzento = variável.

**Análise (decisão pedida):**
- Pergunta do utilizador: "deve haver categorias que têm ambos os tipos de custos?". Resposta: **sim, isto é a realidade** (ex: "Electricidade" pode ter contrato fixo + extras variáveis; "Software" pode ter SaaS mensal + compras pontuais).
- **Recomendação:** o flag `is_fixed` na categoria deixa de ser uma "regra" e passa a ser um **default** para novas faturas dessa categoria. Cada fatura individual mantém o próprio `is_fixed` editável. Conflito = não há, porque a categoria é só o sugestão.
- Migration: já existe `invoices.is_fixed` (memory `project_pt_only_categoria.md`). OK.

**Tarefas (S):**
1. UI [CategoriesCard.tsx](src/components/settings/CategoriesCard.tsx):
   - Adicionar legenda visível acima da grelha de chips:
     ```
     [🔓] Custo variável (default)    [🔒] Custo fixo (default)
     Cada fatura nesta categoria pode ser ajustada individualmente.
     ```
   - Mudar texto da subline (linha 91) para essa explicação.
2. **No edit de fatura individual** ([InvoiceEditDialog](src/components/faturas/InvoiceEditDialog.tsx)): toggle `is_fixed` editável, default da categoria mas user override.
3. **Default ao criar fatura nova:** copiar `is_fixed` da categoria. Se utilizador muda em settings, só afecta novas faturas, nunca retroactivo.

**Esforço:** 3-4h.

---

### F2 — Tipos de Documento como secção formal

**Sintoma:** "se no onboarding pede tipos de docs no passo 2 (fatura, orçamento, etc) então aqui devia haver essa secção para categorizar e para filtrar e afins."

**Causa raiz:** os `documentTypes` que o user marca em [StepInvoiceIntel](src/components/onboarding/StepInvoiceIntel.tsx) são salvos em `tenants.onboarding_data.documentTypes` mas **não são depois usados em lado nenhum** — nem para filtro, nem para validação, nem aparecem em Settings.

**Tarefas (M):**
1. **Mover de `onboarding_data.documentTypes` para tabela `tenant_document_types`** (ou coluna `tenants.allowed_document_types text[]`). Mais consultável.
2. **Settings → Documentos:** card que lista tipos activos, permite adicionar/remover.
3. **Filtro em Faturas:** novo dropdown "Tipo: Tudo / Fatura / Recibo / Nota de Crédito / Aviso de Pagamento / ...".
4. **Validação no analyze-document:** se o Gemini classifica como tipo X mas X não está na lista do tenant, marcar `manual_review` + razão "tipo de documento desconhecido para esta empresa".
5. **Sinergia E5:** os tipos vêm do mesmo enum.

**Esforço:** 1 dia.

---

### F3 — Fornecedores com 0 faturas não aparecem no filtro

**Sintoma:** "por ter eliminado fatura e o fornecedor dessa fatura só ter uma fatura, não devia aparecer esse fornecedor (com nr 0 claro) sequer no filtro de fornecedores."

**Causa raiz:** [SupplierCombobox.tsx](src/components/faturas/SupplierCombobox.tsx) ou [FaturasFilters.tsx](src/components/faturas/FaturasFilters.tsx) carrega todos os fornecedores via `SELECT * FROM suppliers WHERE tenant_id=?` sem filtrar pelos que têm faturas activas.

**Tarefas (S):**
1. View ou RPC `suppliers_with_invoice_counts`: `SELECT s.*, COUNT(i.id) FILTER (WHERE i.deleted_at IS NULL) AS invoice_count FROM suppliers s LEFT JOIN invoices i ON i.supplier_id = s.id WHERE s.tenant_id = $1 GROUP BY s.id`.
2. **No combobox de filtro:** apenas mostrar fornecedores com `invoice_count > 0`. Sort por count desc.
3. **Em Settings → Fornecedores:** mostrar todos (incluindo zero) com badge "0 faturas" + acção "Eliminar fornecedor" (soft-delete).
4. **No combobox de criar/editar fatura:** mostrar todos (precisamos de poder atribuir uma fatura a um fornecedor existente que ainda não tem nenhuma).

**Esforço:** 3-4h.

---

<a id="g"></a>
## PILAR G — Admin, Suporte e Exports

### G1 — Admin: rota correcta para abrir lead (cobre A3)

Coberto em A3. Não duplicar.

---

### G2 — Admin: simplificar estados de plano

**Sintoma:** "escolha de estado de plano no admin não faz sentido, há demais, simplificar."

**Análise:** provavelmente [AdminTenants.tsx](src/pages/admin/AdminTenants.tsx) expõe todos os valores Stripe (`trialing, active, past_due, unpaid, canceled, incomplete, incomplete_expired, paused`). Para uso interno, 4 estados chegam:
- **Trial** (em prova)
- **Activo** (a pagar)
- **Em atraso** (past_due / unpaid)
- **Cancelado** (canceled / paused)

**Tarefas (S):**
1. Helper `getPlanDisplayState(stripe_status): 'trial' | 'active' | 'overdue' | 'cancelled'`.
2. Dropdown no admin com estes 4. UI mostra apenas estes; mapping interno traduz de/para Stripe.
3. Bonus: badge colorido consistente em todo o admin.

**Esforço:** 2h.

---

### G3 — `/account/suspended`: form web em vez de mailto

**Sintoma:** "em account/suspended o contactar suporte não devia ser um mailto:, mas sim um forms na web reutilizado dos outros, algo simples."

**Tarefas (S):**
1. Já existe formulário de tickets ([src/components/tickets/NewTicketForm.tsx](src/components/tickets/NewTicketForm.tsx)). Reutilizar.
2. Em [src/pages/AccountSuspended.tsx](src/pages/AccountSuspended.tsx) (ou equivalente), substituir o `mailto:` por modal com `<NewTicketForm preset={{ category: 'billing', subject: 'Conta suspensa' }} />`.
3. Funciona mesmo que o utilizador esteja logged-in mas sem tenant activo — verificar que RLS deixa criar ticket nesse estado (pode precisar de policy especial: `INSERT to tickets allowed if user_id = auth.uid() regardless of tenant`).

**Esforço:** 2-3h.

---

### G4 — Excel de extracto: adicionar versão "ano completo"

**Sintoma:** "excel de extrato do ano dentro da pasta está bonita, mas devia ter um para o ano todo para além de cada mês."

**Estado actual:** o cron / Drive job cria um Excel por mês dentro da pasta do ano. Falta um agregado anual.

**Tarefas (S):**
1. Identificar onde os Excels mensais são gerados ([src/lib/google/sheets.ts](src/lib/google/sheets.ts) ou Edge Function).
2. Adicionar geração de `Extracto_2026.xlsx` na raiz da pasta do ano com **todas as faturas do ano**, mesmo template das mensais (mesmas colunas, mesmas formulas de subtotal, mesmo brand).
3. Trigger:
   - Recriar quando uma fatura é adicionada/editada/eliminada num mês desse ano (debounce 30s para não correr a cada mutation).
   - Ou: cron diário que recria sempre.
4. Decidir: file novo a cada vez, ou update in-place (preferível — link estável).

**Esforço:** 1 dia.

---

### G5 — Export de faturas (UI) usa o mesmo template do extracto anual

**Sintoma:** "export de faturas deve pegar no mesmo template que o excel de extrato do ano inteiro dentro da drive, para ser tão bonito e manter a mesma tipologia."

**Tarefas (S):**
1. Extrair gerador do Excel "extracto" para um helper único `src/lib/exports/invoiceExtract.ts` que aceita `{ invoices, period, tenant }` e devolve um `Blob` xlsx.
2. [ExportButton.tsx](src/components/faturas/ExportButton.tsx) e [ZipExportButton.tsx](src/components/faturas/ZipExportButton.tsx) chamam o mesmo helper.
3. Sheets cron (G4) chama o mesmo gerador (output → Drive em vez de download).
4. Único ponto de mudança para evolução de template.

**Esforço:** 1 dia. **Sinergia:** G4 partilha helper.

---

<a id="ordem"></a>
## ORDEM DE EXECUÇÃO RECOMENDADA

> 1 dev full-time, ~2.5 semanas. Atacar P0 em paralelo com cortes de UX óbvios.

**Dia 1 — Bugs bloqueantes**
- A1 (CORS — 30 min)
- A2 (marcar pago — 2-3h)
- C1 (default invite tab — 5 min)
- B7 (botão verificar emails disabled — 1-2h)
- A3 / G1 (rota leads — 4-6h)

**Dia 2-3 — Onboarding cortes + fluxos OAuth**
- B1 (7→5 steps)
- B3 (step 4 sem email)
- B5 (pós-OAuth signup → dashboard)
- B6 (pós-OAuth ligar conta → return_to correcto)
- B8 (logged-in pode sair do onboarding)

**Dia 4 — Onboarding polish**
- B2 (UX step 2)
- B4 (step 7 + termos)

**Dia 5-6 — Read-only real**
- C2.1 (RLS audit + fix)
- C2.2 (UI permissões + sidebar)
- C2.3 (settings reduzidas)
- C3 (componente Google extraído)

**Dia 7 — Visualização**
- D1 (modal universal)
- D2 (click outside todos os modais)
- D3 (ignored com fields)

**Dia 8-9 — Qualidade dos dados**
- E6 (NIF normalize/validate) — pré-requisito de E2
- E2 (dedup fornecedores)
- E1 (refinar dedup faturas)
- D4 (re-upload 404)

**Dia 10 — Status, IVA, tipos**
- A4 (validação IVA)
- E3 (review_reason + UI)
- E5 (aviso pagamento)
- F2 (tipos de documento como filtro)

**Dia 11 — Categorias + filtros**
- F1 (cadeado UX)
- F3 (fornecedores zero faturas)

**Dia 12 — Admin + suporte**
- G2 (estados plano simplificar)
- G3 (suspended → web form)

**Dia 13-14 — Exports**
- G5 (extrair helper)
- G4 (extracto anual)

**Dia 15 — QA + agentes + deploy**
- `Agent code-reviewer`, `Agent security-auditor`, build, deploy.

---

<a id="metricas"></a>
## MÉTRICAS DE SUCESSO

| Métrica | Baseline | Target |
|---|---|---|
| Erros CORS no admin | >0/dia | 0 |
| Faturas "marcadas como pago" / mês | 0 (botão broken) | mensurável |
| Steps de onboarding completados (mediana) | 7 | 5 |
| Tempo médio de onboarding (signup → primeira fatura) | desconhecido | ≤5 min |
| Faturas duplicadas detectadas pós-Pilar 5.3 que ainda escapam | ~3 reportadas/sessão | 0 reportadas em 1 semana de uso |
| Read-only members que conseguem editar | 100% (broken) | 0% |
| Suppliers com nome duplicado por tenant | >0 | 0 (após backfill E2) |
| Suppliers com `nif` em formato "PT..." | >0 | 0 (após backfill E6) |
| Faturas em `status='review'` há >7 dias sem `review_reason` | 100% | 0% |

---

<a id="riscos"></a>
## RISCOS TRANSVERSAIS

1. **RLS readonly (C2.1) é a maior caixa preta.** Auditar todas as policies é tedioso e fácil deixar buraco. Mitigar: testes manuais com 3 contas (owner, member, readonly) percorrendo o app inteiro antes do deploy.

2. **Backfills (E2 dedup fornecedores, E6 NIF):** correm contra dados reais. Sempre dry-run primeiro (`SELECT` versão da query) e copiar o output para revisão antes do `UPDATE`. Aplicar em tenants em batches.

3. **Mudança no `OnboardingWizard` (B1, B5, B8):** quem está a meio do onboarding com `step` alto no localStorage pode ficar confuso. Clamp + reset graceful.

4. **Validação IVA (A4) marca como `review` faturas que antes passavam.** Correr `SELECT COUNT(*)` da regra antes de activar — se forem >100, pode haver onboarding-shock. Fasear: log-only durante 3 dias, depois aplicar.

5. **Refinar dedup (E1) com threshold mais agressivo:** falsos positivos no widget. Aceitável — é confirmado por humano.

6. **Drive 404 backfill (D4):** depende de o email original ainda existir no Gmail e não ter expirado o token. Confirmar antes de prometer "sempre re-uploadável".

7. **Não tocar em Pilares 1, 3, 4 do PLAN_FASE2** (motor, relatórios, Stripe) durante esta iteração — manter scope. Excepção: A4 toca em `analyze-document`, mas é fix de validação, não rework do prompt.

---

## NOTAS FINAIS

- Este documento substitui qualquer outro plano de feedback até concluído. Riscar items à medida que se entregam (`✅` no início da linha do título).
- Antes de cada commit: `npm run build` + `npm run lint` (CLAUDE.md).
- Antes do deploy do Pilar C (read-only RLS): `Agent subagent_type=security-auditor`.
- Após cada pilar: actualizar memory `project_pilar_*` correspondente para evitar regressões nas próximas sessões.
- Não criar ficheiros `.md` adicionais (anti-slop). Tudo neste documento.
