/**
 * FaturaAI - i18n FR/PT
 */

export type Lang = 'fr' | 'pt';

const translations = {
  // Navigation
  'nav.dashboard': { fr: 'Tableau de bord', pt: 'Dashboard' },
  'nav.inbox': { fr: 'Boîte de réception', pt: 'Inbox' },
  'nav.invoices': { fr: 'Toutes les factures', pt: 'Todas as faturas' },
  'nav.upload': { fr: 'Télécharger', pt: 'Upload' },
  'nav.suppliers': { fr: 'Fournisseurs', pt: 'Fornecedores' },
  'nav.settings': { fr: 'Paramètres', pt: 'Definições' },
  'nav.automations': { fr: 'Automatisations', pt: 'Automações' },

  // Dashboard
  'dash.total_expenses': { fr: 'Total dépenses', pt: 'Total despesas' },
  'dash.fixed_costs': { fr: 'Coûts fixes', pt: 'Custos fixos' },
  'dash.variable_costs': { fr: 'Coûts variables', pt: 'Custos variáveis' },
  'dash.to_review': { fr: 'À vérifier', pt: 'A rever' },
  'dash.trends': { fr: 'Tendances', pt: 'Tendências' },
  'dash.categories': { fr: 'Catégories', pt: 'Categorias' },
  'dash.recent': { fr: 'Factures récentes', pt: 'Faturas recentes' },
  'dash.top_suppliers': { fr: 'Top fournisseurs', pt: 'Top fornecedores' },
  'dash.vs_last_month': { fr: 'vs mois précédent', pt: 'vs mês anterior' },
  'dash.this_month': { fr: 'Ce mois', pt: 'Este mês' },

  // Invoices
  'inv.date': { fr: 'Date', pt: 'Data' },
  'inv.supplier': { fr: 'Fournisseur', pt: 'Fornecedor' },
  'inv.siret': { fr: 'SIRET', pt: 'SIRET' },
  'inv.metier': { fr: 'Métier', pt: 'Especialidade' },
  'inv.nature': { fr: 'Nature', pt: 'Natureza' },
  'inv.cost_type': { fr: 'Type coût', pt: 'Tipo custo' },
  'inv.doc_number': { fr: 'N° document', pt: 'N° documento' },
  'inv.amount_ht': { fr: 'Montant HT', pt: 'Valor s/IVA' },
  'inv.tva': { fr: 'TVA', pt: 'IVA' },
  'inv.amount_ttc': { fr: 'Montant TTC', pt: 'Valor c/IVA' },
  'inv.tva_rate': { fr: 'Taux TVA', pt: 'Taxa IVA' },
  'inv.summary': { fr: 'Résumé', pt: 'Resumo' },
  'inv.status': { fr: 'Statut', pt: 'Estado' },
  'inv.due_date': { fr: 'Date échéance', pt: 'Data vencimento' },
  'inv.payment': { fr: 'Paiement', pt: 'Pagamento' },
  'inv.line_items': { fr: 'Lignes de facture', pt: 'Linhas da fatura' },
  'inv.autoliquidation': { fr: 'Autoliquidation TVA', pt: 'Autoliquidação IVA' },

  // Upload
  'upload.title': { fr: 'Télécharger des factures', pt: 'Upload de faturas' },
  'upload.drag': { fr: 'Glissez des fichiers ou cliquez pour sélectionner', pt: 'Arraste ficheiros ou clique para selecionar' },
  'upload.formats': { fr: 'JPG, PNG, PDF ou HEIC (max 10 Mo)', pt: 'JPG, PNG, PDF ou HEIC (max 10MB)' },
  'upload.processing': { fr: 'Traitement en cours...', pt: 'A processar...' },
  'upload.analyzing': { fr: 'Analyse avec IA...', pt: 'A analisar com IA...' },
  'upload.done': { fr: 'Traitement terminé', pt: 'Processamento concluído' },
  'upload.error': { fr: 'Erreur de traitement', pt: 'Erro no processamento' },
  'upload.duplicate': { fr: 'Facture en double', pt: 'Fatura duplicada' },
  'upload.no_google': { fr: 'Connectez un compte Google pour uploader des factures.', pt: 'Conecte uma conta Google para fazer upload de faturas.' },
  'upload.go_settings': { fr: 'Aller aux Param\u00e8tres', pt: 'Ir para Defini\u00e7\u00f5es' },
  'upload.no_company': { fr: 'S\u00e9lectionnez une entreprise dans le menu lat\u00e9ral.', pt: 'Selecione uma empresa no menu lateral.' },
  'upload.files_count': { fr: 'fichier(s)', pt: 'ficheiro(s)' },
  'upload.success_count': { fr: 'trait\u00e9(s)', pt: 'processado(s)' },
  'upload.error_count': { fr: 'erreur(s)', pt: 'erro(s)' },

  // Inbox
  'inbox.title': { fr: 'Factures à vérifier', pt: 'Faturas a verificar' },
  'inbox.approve': { fr: 'Approuver', pt: 'Aprovar' },
  'inbox.reject': { fr: 'Rejeter', pt: 'Rejeitar' },
  'inbox.edit': { fr: 'Modifier', pt: 'Editar' },
  'inbox.empty': { fr: 'Aucune facture à vérifier', pt: 'Nenhuma fatura a verificar' },

  // Suppliers
  'sup.name': { fr: 'Nom', pt: 'Nome' },
  'sup.total_spent': { fr: 'Total dépensé', pt: 'Total gasto' },
  'sup.invoice_count': { fr: 'Nb factures', pt: 'N° faturas' },
  'sup.subcontractor': { fr: 'Sous-traitant', pt: 'Subempreiteiro' },
  'sup.detail': { fr: 'Détails fournisseur', pt: 'Detalhes fornecedor' },
  'sup.recent_invoices': { fr: 'Factures récentes', pt: 'Faturas recentes' },
  'sup.address': { fr: 'Adresse', pt: 'Morada' },
  'sup.iban': { fr: 'IBAN', pt: 'IBAN' },
  'sup.tva_intracom': { fr: 'TVA Intracom', pt: 'IVA Intracom' },
  'sup.edit': { fr: 'Modifier', pt: 'Editar' },
  'sup.no_invoices': { fr: 'Aucune facture', pt: 'Sem faturas' },
  'sup.saved': { fr: 'Fournisseur enregistré', pt: 'Fornecedor guardado' },
  'sup.siret_invalid': { fr: 'SIRET doit contenir 14 chiffres', pt: 'SIRET deve ter 14 digitos' },

  // Settings
  'set.companies': { fr: 'Entreprises', pt: 'Empresas' },
  'set.categories': { fr: 'Catégories', pt: 'Categorias' },
  'set.email_accounts': { fr: 'Comptes email', pt: 'Contas email' },
  'set.language': { fr: 'Langue', pt: 'Idioma' },

  // Actions
  'action.save': { fr: 'Enregistrer', pt: 'Guardar' },
  'action.cancel': { fr: 'Annuler', pt: 'Cancelar' },
  'action.delete': { fr: 'Supprimer', pt: 'Eliminar' },
  'action.export_excel': { fr: 'Exporter Excel', pt: 'Exportar Excel' },
  'action.exporting': { fr: 'Export en cours...', pt: 'A exportar...' },
  'action.export_zip': { fr: 'Télécharger ZIP', pt: 'Descarregar ZIP' },
  'action.approve': { fr: 'Approuver', pt: 'Aprovar' },
  'action.search': { fr: 'Rechercher...', pt: 'Pesquisar...' },
  'action.filter': { fr: 'Filtrer', pt: 'Filtrar' },
  'action.clear_filters': { fr: 'Effacer filtres', pt: 'Limpar filtros' },
  'action.view_pdf': { fr: 'Voir PDF', pt: 'Ver PDF' },
  'action.connect_google': { fr: 'Connecter Google', pt: 'Conectar Google' },
  'action.disconnect': { fr: 'Déconnecter', pt: 'Desconectar' },

  // Status
  'status.pending': { fr: 'En attente', pt: 'Pendente' },
  'status.inbox': { fr: 'À vérifier', pt: 'A verificar' },
  'status.processed': { fr: 'Traité', pt: 'Processado' },
  'status.review': { fr: 'À réviser', pt: 'Em revisão' },

  // Companies
  'company.all': { fr: 'Toutes les entreprises', pt: 'Todas as empresas' },
  'company.name': { fr: 'Nom', pt: 'Nome' },
  'company.siret': { fr: 'SIRET', pt: 'SIRET' },
  'company.tva_intracom': { fr: 'TVA Intracom', pt: 'IVA Intracom' },
  'company.address': { fr: 'Adresse', pt: 'Morada' },
  'company.saved': { fr: 'Entreprise enregistrée', pt: 'Empresa guardada' },

  // Errors
  'error.file_too_large': { fr: 'Fichier trop volumineux (max 10 Mo)', pt: 'Ficheiro demasiado grande (max 10MB)' },
  'error.invalid_format': { fr: 'Format non supporté. Utilisez JPG, PNG, PDF ou HEIC.', pt: 'Formato não suportado. Use JPG, PNG, PDF ou HEIC.' },
  'error.no_google': { fr: 'Ajoutez un compte Google dans Automatisations.', pt: 'Adicione uma conta Google em Automações.' },
  'error.analysis_failed': { fr: "Erreur lors de l'analyse du document.", pt: 'Erro ao analisar documento.' },
  'error.not_invoice': { fr: "Ce document n'est pas une facture.", pt: 'Este documento não é uma fatura.' },
  'error.illegible': { fr: 'Document illisible. Veuillez envoyer une meilleure qualité.', pt: 'Documento ilegível. Envie melhor qualidade.' },

  // Bulk
  'bulk.selected': { fr: 'sélectionné(s)', pt: 'selecionado(s)' },
  'bulk.select_all': { fr: 'Tout sélectionner', pt: 'Selecionar tudo' },
  'bulk.approve': { fr: 'Approuver', pt: 'Aprovar' },
  'bulk.delete': { fr: 'Supprimer', pt: 'Eliminar' },

  // Export
  'export.pdf_link': { fr: 'Lien PDF', pt: 'Link PDF' },

  // Drawer / Detail
  'drawer.title': { fr: 'Détails de la facture', pt: 'Detalhes da fatura' },
  'drawer.edit': { fr: 'Modifier', pt: 'Editar' },
  'drawer.delete': { fr: 'Supprimer', pt: 'Eliminar' },
  'drawer.view_doc': { fr: 'Voir le document', pt: 'Ver documento' },
  'drawer.company': { fr: 'Entreprise', pt: 'Empresa' },
  'drawer.confidence': { fr: 'Confiance IA', pt: 'Confianca IA' },
  'drawer.iban': { fr: 'IBAN fournisseur', pt: 'IBAN fornecedor' },
  'drawer.delete_confirm': { fr: 'Voulez-vous vraiment supprimer cette facture ?', pt: 'Tem a certeza que pretende eliminar esta fatura?' },
  'drawer.no_items': { fr: 'Aucune ligne de facture', pt: 'Sem linhas de fatura' },

  // Edit Modal
  'edit.title': { fr: 'Modifier la facture', pt: 'Editar fatura' },
  'edit.saving': { fr: 'Enregistrement...', pt: 'A guardar...' },

  // Months
  'month.1': { fr: 'Janvier', pt: 'Janeiro' },
  'month.2': { fr: 'Février', pt: 'Fevereiro' },
  'month.3': { fr: 'Mars', pt: 'Março' },
  'month.4': { fr: 'Avril', pt: 'Abril' },
  'month.5': { fr: 'Mai', pt: 'Maio' },
  'month.6': { fr: 'Juin', pt: 'Junho' },
  'month.7': { fr: 'Juillet', pt: 'Julho' },
  'month.8': { fr: 'Août', pt: 'Agosto' },
  'month.9': { fr: 'Septembre', pt: 'Setembro' },
  'month.10': { fr: 'Octobre', pt: 'Outubro' },
  'month.11': { fr: 'Novembre', pt: 'Novembro' },
  'month.12': { fr: 'Décembre', pt: 'Dezembro' },
} as const;

export type TranslationKey = keyof typeof translations;

// Kept for non-React code (edge cases). Prefer useI18n() hook in components.
let currentLang: Lang = 'fr';
export function setLang(lang: Lang) { currentLang = lang; }
export function getLang(): Lang { return currentLang; }
export function t(key: TranslationKey): string {
  return translations[key]?.[currentLang] || key;
}

// React-aware translation
export function translate(key: TranslationKey, lang: Lang): string {
  return translations[key]?.[lang] || key;
}
