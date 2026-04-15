-- ============================================
-- FaturaAI - RLS multi-tenant
-- ============================================
-- Executar DEPOIS do SCHEMA.sql.
-- Padrão: tenant_id IN (SELECT get_user_tenant_ids((select auth.uid())))
-- O helper é SECURITY DEFINER → não dispara recursão RLS em tenant_users.

-- 1. ATIVAR RLS
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- 2. PLANS — todos os autenticados podem ler
CREATE POLICY "auth_read_plans" ON plans FOR SELECT TO authenticated USING (is_active = true);

-- 3. TENANTS
CREATE POLICY "members_read_tenant" ON tenants FOR SELECT TO authenticated
  USING (id IN (SELECT get_user_tenant_ids((select auth.uid()))) AND deleted_at IS NULL);

CREATE POLICY "members_update_tenant" ON tenants FOR UPDATE TO authenticated
  USING (id IN (SELECT get_user_tenant_ids((select auth.uid()))))
  WITH CHECK (id IN (SELECT get_user_tenant_ids((select auth.uid()))));

-- INSERT é feito durante onboarding pelo próprio user (que ainda não é membro).
-- Depois o trigger/handleSubmit cria a row em tenant_users imediatamente.
CREATE POLICY "auth_insert_tenant" ON tenants FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "service_all_tenants" ON tenants FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. TENANT_USERS
CREATE POLICY "members_read_membership" ON tenant_users FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))));

-- O próprio user insere a sua membership owner durante onboarding.
CREATE POLICY "self_insert_membership" ON tenant_users FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "service_all_members" ON tenant_users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. ONBOARDING_SUBMISSIONS — só o próprio user
CREATE POLICY "self_read_onboarding" ON onboarding_submissions FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "self_insert_onboarding" ON onboarding_submissions FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "self_update_onboarding" ON onboarding_submissions FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "service_all_onboarding" ON onboarding_submissions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. COMPANIES
CREATE POLICY "members_read_companies" ON companies FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))));

CREATE POLICY "members_write_companies" ON companies FOR ALL TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))))
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))));

CREATE POLICY "service_all_companies" ON companies FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7. INVOICES
CREATE POLICY "members_read_invoices" ON invoices FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))) AND deleted_at IS NULL);

CREATE POLICY "members_insert_invoices" ON invoices FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))));

CREATE POLICY "members_update_invoices" ON invoices FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))))
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))));
-- Sem DELETE — soft-delete via UPDATE deleted_at.

CREATE POLICY "service_all_invoices" ON invoices FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8. INVOICE LINE ITEMS
CREATE POLICY "members_read_line_items" ON invoice_line_items FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))));

CREATE POLICY "members_write_line_items" ON invoice_line_items FOR ALL TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))))
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))));

CREATE POLICY "service_all_line_items" ON invoice_line_items FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9. SUPPLIERS
CREATE POLICY "members_read_suppliers" ON suppliers FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))));

CREATE POLICY "members_write_suppliers" ON suppliers FOR ALL TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))))
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))));

CREATE POLICY "service_all_suppliers" ON suppliers FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 10. CATEGORIES
CREATE POLICY "members_read_categories" ON categories FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))) AND is_active = true);

CREATE POLICY "members_write_categories" ON categories FOR ALL TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))))
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))));

CREATE POLICY "service_all_categories" ON categories FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 11. EMAIL ACCOUNTS
CREATE POLICY "members_read_email_accounts" ON email_accounts FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))));

CREATE POLICY "members_write_email_accounts" ON email_accounts FOR ALL TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))))
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))));

CREATE POLICY "service_all_email_accounts" ON email_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 12. OAUTH TOKENS — ligados ao user, não ao tenant
CREATE POLICY "self_read_tokens" ON user_oauth_tokens FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "self_write_tokens" ON user_oauth_tokens FOR ALL TO authenticated
  USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "service_all_tokens" ON user_oauth_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 13. AUDIT LOG — só leitura ao próprio tenant
CREATE POLICY "members_read_audit" ON audit_log FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids((select auth.uid()))));

CREATE POLICY "service_all_audit" ON audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 14. STORAGE
CREATE POLICY "auth_upload_invoices" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoices');

CREATE POLICY "auth_view_invoices" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'invoices');

CREATE POLICY "auth_delete_invoice_files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'invoices');
