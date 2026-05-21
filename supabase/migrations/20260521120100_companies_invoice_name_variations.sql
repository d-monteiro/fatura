-- Empresas secundárias passam a ser tão completas como a principal: ganham
-- 'invoice_name_variations' próprio. A IA usa estas variações para identificar
-- a que empresa do tenant uma fatura recebida foi endereçada (destinatario).

alter table public.companies
  add column if not exists invoice_name_variations text[] not null default '{}';

-- A empresa principal herda as variações que viviam no perfil do tenant.
update public.companies c
set invoice_name_variations = t.invoice_name_variations
from public.tenants t
where c.tenant_id = t.id
  and c.is_default = true
  and coalesce(array_length(t.invoice_name_variations, 1), 0) > 0
  and coalesce(array_length(c.invoice_name_variations, 1), 0) = 0;

-- Limpeza do nome curto sujo: pontuação/espaços no fim, ex.: 'FASHIONVIANA,'
-- que a geração automática apanhava de 'FASHIONVIANA, LDA'.
update public.companies
set short_name = regexp_replace(btrim(short_name), '[\s,.;:]+$', '')
where short_name <> regexp_replace(btrim(short_name), '[\s,.;:]+$', '');
