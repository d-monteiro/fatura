---
name: LGM Project Spec
description: New invoicing platform for LGM (French construction) - Alvaro + Aicinio, secretary as main user, 3 companies, iCloud storage, email capture, French UI
type: project
---

Client: LGM (Alvaro + Aicinio)
Main user: Secretary (French)
Companies: LGM, Holding, Imobiliaria (multi-tenant)
Language: French (all UI, dates DD/MM/AAAA, values 1 234,56 EUR)
Storage: iCloud (client requirement)
Supabase project ref: wvopuqyotvwgronujvrb
Timeline: ~3 weeks from 2026-03-27

**Why:** Flowzi client, invoicing automation for French construction company. Need email capture, AI categorization, Google Drive storage, Excel export for accountant.

**How to apply:** All decisions should prioritize simplicity for the French secretary user. Multi-company architecture is critical. Google Drive for PDF storage (iCloud has no API). OpenRouter API (not direct Gemini) for AI extraction. French-specific: TVA rates (20/10/5.5%), SIRET validation, autoliquidation for subcontractors. Edge Function secret: OPENROUTER_API_KEY (not GEMINI_API_KEY).
