-- ============================================
-- FaturaAI - LGM - Row Level Security
-- ============================================
-- Executar DEPOIS do SCHEMA.sql
-- Usa (select auth.uid()) para evitar recursion

-- 1. ATIVAR RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- 2. COMPANIES (all authenticated users can read)
CREATE POLICY "Authenticated can view companies"
  ON companies FOR SELECT
  TO authenticated
  USING (is_active = true);

-- 3. INVOICES (user sees own, filtered by company)
CREATE POLICY "Users can view own invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    AND deleted_at IS NULL
  );

CREATE POLICY "Users can insert own invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- No DELETE policy — soft delete only (UPDATE deleted_at)

-- Service role bypass for Edge Functions (sync-email)
CREATE POLICY "Service role full access invoices"
  ON invoices FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. LINE ITEMS (via invoice ownership)
CREATE POLICY "Users can view own line items"
  ON invoice_line_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_line_items.invoice_id
      AND invoices.user_id = (select auth.uid())
      AND invoices.deleted_at IS NULL
    )
  );

CREATE POLICY "Users can insert own line items"
  ON invoice_line_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_line_items.invoice_id
      AND invoices.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can update own line items"
  ON invoice_line_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_line_items.invoice_id
      AND invoices.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Service role full access line items"
  ON invoice_line_items FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. SUPPLIERS (all authenticated can read, write)
CREATE POLICY "Authenticated can view suppliers"
  ON suppliers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert suppliers"
  ON suppliers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update suppliers"
  ON suppliers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 6. CATEGORIES (all authenticated can read)
CREATE POLICY "Authenticated can view categories"
  ON categories FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Authenticated can manage categories"
  ON categories FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 7. EMAIL ACCOUNTS (own only)
CREATE POLICY "Users can view own email accounts"
  ON email_accounts FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own email accounts"
  ON email_accounts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own email accounts"
  ON email_accounts FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own email accounts"
  ON email_accounts FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Service role full access email accounts"
  ON email_accounts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 8. OAUTH TOKENS (own only)
CREATE POLICY "Users can view own tokens"
  ON user_oauth_tokens FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own tokens"
  ON user_oauth_tokens FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own tokens"
  ON user_oauth_tokens FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own tokens"
  ON user_oauth_tokens FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Service role full access tokens"
  ON user_oauth_tokens FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 9. AUDIT LOG (own only, read-only)
CREATE POLICY "Users can view own audit log"
  ON audit_log FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Insert via trigger (service role), not directly by users
CREATE POLICY "Service role full access audit"
  ON audit_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 10. STORAGE
CREATE POLICY "Authenticated can upload invoices"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'invoices');

CREATE POLICY "Authenticated can view invoices"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'invoices');

CREATE POLICY "Authenticated can delete invoice files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'invoices');
