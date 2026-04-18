-- ============================================
-- RPC create_tenant_with_owner — versionado
-- ============================================
-- Antes vivia só na Supabase cloud sem migration. Agora versionado.
-- Cria tenant + row tenant_users (owner) numa transacção atómica.
-- SECURITY DEFINER necessário porque tenant_users tem RLS que exige ser membro
-- antes do INSERT. Valida que o user só pode criar um tenant (já reforçado
-- pela policy auth_insert_tenant via NOT EXISTS).

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
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  -- Um user não pode criar mais que um tenant como owner
  IF EXISTS (SELECT 1 FROM tenant_users WHERE user_id = uid AND role = 'owner' AND is_active = true) THEN
    RAISE EXCEPTION 'user já é owner de um tenant';
  END IF;

  -- Resolver plan_id server-side a partir do plan_slug (não confiar no plan_id do cliente)
  requested_plan_slug := tenant_data->>'plan_slug';
  IF requested_plan_slug IS NOT NULL THEN
    SELECT id INTO resolved_plan_id FROM plans WHERE slug = requested_plan_slug AND is_active = true;
  END IF;

  -- Fallback: se plan_id foi passado, valida que existe
  IF resolved_plan_id IS NULL AND (tenant_data->>'plan_id') IS NOT NULL THEN
    SELECT id INTO resolved_plan_id FROM plans WHERE id = (tenant_data->>'plan_id')::uuid AND is_active = true;
  END IF;

  INSERT INTO tenants (
    name, slug, nif, sector, country, language, currency,
    primary_color, secondary_color, plan_id,
    plan_status, trial_ends_at, onboarding_completed, setup_status,
    storage_provider, folder_structure, auto_sheets, auto_reports,
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
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(tenant_data->'invoice_name_variations')),
      ARRAY[]::TEXT[]
    ),
    COALESCE(tenant_data->'onboarding_data', '{}'::jsonb)
  )
  RETURNING id INTO new_tenant_id;

  INSERT INTO tenant_users (tenant_id, user_id, role, is_active, accepted_at)
  VALUES (new_tenant_id, uid, 'owner', true, now());

  RETURN new_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION create_tenant_with_owner(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_tenant_with_owner(JSONB) TO authenticated;
