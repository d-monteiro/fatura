-- ============================================
-- RPC create_tenant_with_owner — v2: timezone + report_email
-- ============================================
-- Acrescenta:
--   timezone     — default 'Europe/Lisbon' se não for passado.
--   report_email — opcional; NULL se string vazia.
-- Preserva toda a lógica existente em produção (seeds default_company + categories).

CREATE OR REPLACE FUNCTION create_tenant_with_owner(tenant_data JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  new_tenant_id UUID;
  trial_days INT := 7;
  requested_plan_slug TEXT;
  resolved_plan_id UUID;
  default_company JSONB;
  categories_data JSONB;
  cat JSONB;
  company_name TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF EXISTS (SELECT 1 FROM tenant_users WHERE user_id = uid AND role = 'owner' AND is_active = true) THEN
    RAISE EXCEPTION 'user já é owner de um tenant';
  END IF;

  requested_plan_slug := tenant_data->>'plan_slug';
  IF requested_plan_slug IS NOT NULL THEN
    SELECT id INTO resolved_plan_id FROM plans WHERE slug = requested_plan_slug AND is_active = true;
  END IF;

  IF resolved_plan_id IS NULL AND (tenant_data->>'plan_id') IS NOT NULL THEN
    SELECT id INTO resolved_plan_id FROM plans WHERE id = (tenant_data->>'plan_id')::uuid AND is_active = true;
  END IF;

  INSERT INTO tenants (
    name, slug, nif, sector, country, language, currency, timezone,
    primary_color, secondary_color, plan_id,
    plan_status, trial_ends_at, onboarding_completed, setup_status,
    storage_provider, folder_structure, auto_sheets, auto_reports, report_email,
    invoice_name_variations, onboarding_data
  )
  VALUES (
    tenant_data->>'name',
    tenant_data->>'slug',
    NULLIF(tenant_data->>'nif', ''),
    NULLIF(tenant_data->>'sector', ''),
    COALESCE(tenant_data->>'country', 'PT'),
    COALESCE(tenant_data->>'language', 'pt'),
    COALESCE(tenant_data->>'currency', 'EUR'),
    COALESCE(tenant_data->>'timezone', 'Europe/Lisbon'),
    NULLIF(tenant_data->>'primary_color', ''),
    NULLIF(tenant_data->>'secondary_color', ''),
    resolved_plan_id,
    'trialing',
    now() + (trial_days || ' days')::interval,
    COALESCE((tenant_data->>'onboarding_completed')::boolean, false),
    COALESCE(tenant_data->>'setup_status', 'pending'),
    COALESCE(tenant_data->>'storage_provider', 'google_drive'),
    COALESCE(tenant_data->>'folder_structure', 'year_month'),
    COALESCE((tenant_data->>'auto_sheets')::boolean, true),
    COALESCE(tenant_data->>'auto_reports', 'never'),
    NULLIF(tenant_data->>'report_email', ''),
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(tenant_data->'invoice_name_variations')),
      ARRAY[]::TEXT[]
    ),
    COALESCE(tenant_data->'onboarding_data', '{}'::jsonb)
  )
  RETURNING id INTO new_tenant_id;

  INSERT INTO tenant_users (tenant_id, user_id, role, is_active, accepted_at)
  VALUES (new_tenant_id, uid, 'owner', true, now());

  default_company := tenant_data->'default_company';
  IF default_company IS NOT NULL AND (default_company->>'name') IS NOT NULL AND length(default_company->>'name') > 0 THEN
    company_name := default_company->>'name';
    INSERT INTO companies (tenant_id, name, short_name, nif, is_default, is_active)
    VALUES (
      new_tenant_id,
      company_name,
      COALESCE(NULLIF(default_company->>'short_name', ''), substring(upper(split_part(company_name, ' ', 1)) from 1 for 16)),
      NULLIF(default_company->>'nif', ''),
      true,
      true
    );
  END IF;

  categories_data := tenant_data->'categories';
  IF categories_data IS NOT NULL AND jsonb_typeof(categories_data) = 'array' THEN
    FOR cat IN SELECT * FROM jsonb_array_elements(categories_data) LOOP
      IF (cat->>'axis') IS NOT NULL AND (cat->>'code') IS NOT NULL AND (cat->>'label') IS NOT NULL THEN
        INSERT INTO categories (tenant_id, axis, code, label, sort_order, is_active)
        VALUES (
          new_tenant_id,
          cat->>'axis',
          cat->>'code',
          cat->>'label',
          COALESCE((cat->>'sort_order')::int, 0),
          true
        )
        ON CONFLICT (tenant_id, axis, code) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN new_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION create_tenant_with_owner(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_tenant_with_owner(JSONB) TO authenticated;
