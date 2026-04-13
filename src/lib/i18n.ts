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
  'nav.billing': { fr: 'Facturation', pt: 'Faturação' },
  'nav.tickets': { fr: 'Support', pt: 'Suporte' },

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
  'upload.checking_auth': { fr: "Vérification de l'authentification...", pt: 'A verificar autenticação...' },
  'upload.checking_auth_desc': { fr: 'Renouvellement automatique des tokens si nécessaire.', pt: 'A renovar tokens automaticamente se necessário.' },
  'upload.ready': { fr: "Prêt pour l'upload !", pt: 'Pronto para upload!' },
  'upload.ready_desc': { fr: 'Compte Google connecté. Token valide.', pt: 'Conta Google conectada. Token válido.' },
  'upload.no_account': { fr: 'Aucun compte configuré', pt: 'Nenhuma conta configurada' },
  'upload.no_account_desc': { fr: 'Ajoutez un compte Google dans Paramètres pour uploader des factures.', pt: 'Adicione uma conta Google em Definições para fazer upload de faturas.' },
  'upload.configure_account': { fr: 'Configurer un compte', pt: 'Configurar conta' },
  'upload.token_error': { fr: 'Erreur de renouvellement de token', pt: 'Erro ao renovar token' },
  'upload.retry': { fr: 'Réessayer', pt: 'Tentar novamente' },
  'upload.rate_limit': { fr: "Limite d'uploads atteint", pt: 'Limite de uploads atingido' },
  'upload.rate_limit_desc': { fr: 'Attendez {seconds} secondes avant de réessayer.', pt: 'Aguarde {seconds} segundos antes de tentar.' },
  'upload.understood': { fr: 'Compris', pt: 'Entendi' },
  'upload.take_photo': { fr: 'Prendre une photo', pt: 'Tirar foto' },
  'upload.choose_file': { fr: 'Choisir un fichier', pt: 'Escolher ficheiro' },
  'upload.camera_tip_title': { fr: 'Conseils qualité photo', pt: 'Dicas de qualidade' },
  'upload.camera_tip_1': { fr: 'Bon éclairage (pas d\'ombres)', pt: 'Boa iluminação (sem sombras)' },
  'upload.camera_tip_2': { fr: 'Facture bien cadrée', pt: 'Fatura bem enquadrada' },
  'upload.camera_tip_3': { fr: 'Texte lisible et net', pt: 'Texto legível e focado' },
  'upload.camera_tip_4': { fr: 'Éviter les reflets', pt: 'Evitar reflexos' },
  'upload.camera_confirm': { fr: 'Prendre la photo', pt: 'Tirar foto' },
  'upload.processing_x_of_y': { fr: 'Traitement {current} sur {total}...', pt: 'A processar {current} de {total}...' },
  'upload.uploading': { fr: 'Téléchargement...', pt: 'A carregar...' },
  'upload.analyzing_ai': { fr: 'Analyse avec IA...', pt: 'A analisar com IA...' },
  'upload.pending': { fr: 'En attente...', pt: 'A aguardar...' },
  'upload.processed_msg': { fr: 'Traité !', pt: 'Processado!' },
  'upload.complete': { fr: 'Traitement terminé !', pt: 'Processamento concluído!' },
  'upload.load_more': { fr: 'Charger plus', pt: 'Carregar mais' },
  'upload.clear': { fr: 'Effacer', pt: 'Limpar' },
  'upload.how_title': { fr: 'Comment ça marche', pt: 'Como funciona' },
  'upload.how_1': { fr: "Chargez jusqu'à {max} factures à la fois (images ou PDFs)", pt: 'Carregue até {max} faturas de uma vez (imagens ou PDFs)' },
  'upload.how_2': { fr: "L'IA (Gemini) extrait automatiquement les données de chaque facture", pt: 'A IA (Gemini) extrai automaticamente os dados de cada fatura' },
  'upload.how_3': { fr: 'Les données sont sauvegardées et organisées dans Google Drive', pt: 'Os dados são guardados e organizados no Google Drive' },
  'upload.how_4': { fr: 'Consultez tout sur la page « Factures »', pt: 'Consulte tudo na página "Faturas"' },
  'upload.how_tip': { fr: 'Astuce : Plus la qualité de l\'image est bonne, plus l\'analyse sera précise.', pt: 'Dica: Quanto melhor a qualidade da imagem, mais precisa será a análise.' },
  'upload.drag_mobile': { fr: 'Prenez une photo ou sélectionnez des fichiers (max {max}, 10 Mo)', pt: 'Tire foto ou selecione ficheiros (max {max}, 10MB)' },
  'upload.drop_here': { fr: 'Déposez les fichiers ici', pt: 'Solte os ficheiros aqui' },
  'upload.drag_desktop': { fr: 'Glissez des factures ou cliquez pour sélectionner', pt: 'Arraste faturas ou clique para selecionar' },
  'upload.formats_detail': { fr: 'Formats acceptés : JPG, PNG, PDF (max 10 Mo, maximum {max} fichiers)', pt: 'Formatos aceites: JPG, PNG, PDF (max 10MB, máximo {max} ficheiros)' },

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

  // Automations
  'auto.title': { fr: 'Automatisations', pt: 'Automações' },
  'auto.subtitle': { fr: 'Synchronisation automatique de factures depuis Gmail', pt: 'Sincronização automática de faturas do Gmail' },
  'auto.connected_accounts': { fr: 'Comptes connectés', pt: 'Contas conectadas' },
  'auto.connected_desc': { fr: "Comptes Gmail vérifiés. Le compte avec l'étoile stocke les fichiers.", pt: 'Contas Gmail verificadas. A conta com estrela guarda os ficheiros.' },
  'auto.add_account': { fr: 'Ajouter un compte', pt: 'Adicionar conta' },
  'auto.no_accounts': { fr: 'Aucun compte connecté', pt: 'Nenhuma conta conectada' },
  'auto.no_accounts_desc': { fr: 'Ajoutez un compte Gmail pour activer la synchronisation automatique.', pt: 'Adicione uma conta Gmail para ativar a sincronização automática.' },
  'auto.token_expired': { fr: 'Token expiré !', pt: 'Token expirado!' },
  'auto.token_expired_desc': { fr: "Le compte de stockage n'a pas de refresh token. Ré-authentifiez pour continuer.", pt: 'A conta de armazenamento não tem refresh token. Re-autentique para continuar.' },
  'auto.storage': { fr: 'Stockage', pt: 'Armazenamento' },
  'auto.reauth': { fr: 'Ré-authentifier', pt: 'Re-autenticar' },
  'auto.auto_renew': { fr: 'Auto', pt: 'Auto' },
  'auto.token_auto_renew': { fr: 'Le token se renouvelle automatiquement', pt: 'Token renova automaticamente' },
  'auto.token_expired_at': { fr: 'Expiré le', pt: 'Expirou em' },
  'auto.token_expires_at': { fr: 'Expire le', pt: 'Expira em' },
  'auto.set_primary': { fr: 'Définir comme stockage principal', pt: 'Definir como armazenamento principal' },
  'auto.removed_revoked': { fr: 'Compte supprimé et accès révoqué sur Google.', pt: 'Conta removida e acesso revogado no Google.' },
  'auto.removed': { fr: 'Compte supprimé.', pt: 'Conta removida.' },
  'auto.set_primary_ok': { fr: 'défini comme compte de stockage', pt: 'definida como conta de armazenamento' },
  'auto.check_emails': { fr: 'Vérifier les emails', pt: 'Verificar emails' },
  'auto.check_emails_desc': { fr: "Vérifie les emails des dernières 24h avec des factures PDF, analyse avec l'IA et stocke dans Drive", pt: 'Verifica emails das últimas 24h com faturas PDF, processa com IA e guarda no Drive' },
  'auto.check_now': { fr: 'Vérifier les emails maintenant', pt: 'Verificar emails agora' },
  'auto.checking': { fr: 'Vérification en cours...', pt: 'A verificar emails...' },
  'auto.result_processed': { fr: 'Traitées', pt: 'Processadas' },
  'auto.result_duplicates': { fr: 'Doublons', pt: 'Duplicadas' },
  'auto.result_skipped': { fr: 'Ignorées', pt: 'Ignoradas' },
  'auto.result_errors': { fr: 'Erreurs', pt: 'Erros' },
  'auto.step_read': { fr: 'Lit les emails avec des PDFs joints', pt: 'Lê emails com PDFs anexados' },
  'auto.step_analyze': { fr: 'Analyse avec Gemini AI et extrait les données', pt: 'Analisa com Gemini AI e extrai dados' },
  'auto.step_store': { fr: 'Stocke dans Google Drive et enregistre dans la base', pt: 'Guarda no Google Drive e regista na base' },
  'auto.step_mark': { fr: 'Marque les emails comme lus après traitement', pt: 'Marca emails como lidos após processar' },
  'auto.sync_title': { fr: 'Synchronisation automatique', pt: 'Sincronização automática' },
  'auto.sync_desc': { fr: 'Tous les jours à 23h58, vérifie les emails des dernières 24h avec des annexes PDF', pt: 'Todos os dias às 23:58, verifica emails das últimas 24h com anexos PDF' },
  'auto.how_it_works': { fr: 'Comment ça marche', pt: 'Como funciona' },
  'auto.step_scan': { fr: 'Vérifie les emails des dernières 24h avec des annexes PDF', pt: 'Verifica emails das últimas 24h com anexos PDF' },
  'auto.step_ai': { fr: 'Analyse avec Gemini AI — ne traite que les factures/reçus', pt: 'Analisa com Gemini AI — só processa faturas/recibos' },
  'auto.step_drive': { fr: 'Organise dans Google Drive par année et type de coût', pt: 'Organiza no Google Drive por ano e tipo de custo' },
  'auto.step_db': { fr: 'Enregistre dans Supabase et Google Sheets', pt: 'Regista no Supabase e Google Sheets' },
  'auto.step_dedup': { fr: 'Ignore les doublons automatiquement', pt: 'Ignora duplicados automaticamente' },
  'auto.errors_webhook': { fr: 'Les erreurs sont envoyées automatiquement au webhook de surveillance.', pt: 'Os erros são enviados automaticamente para o webhook de monitorização.' },

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
  'drawer.view_pdf': { fr: 'Voir PDF', pt: 'Ver PDF' },
  'drawer.open_sheets': { fr: 'Ouvrir Sheets', pt: 'Abrir Sheets' },
  'drawer.company': { fr: 'Entreprise', pt: 'Empresa' },
  'drawer.confidence': { fr: 'Confiance IA', pt: 'Confianca IA' },
  'drawer.iban': { fr: 'IBAN fournisseur', pt: 'IBAN fornecedor' },
  'drawer.delete_confirm': { fr: 'Supprimer cette facture ?', pt: 'Eliminar esta fatura?' },
  'drawer.delete_confirm_detail': { fr: 'Cette action ne peut pas être annulée.', pt: 'Esta acao nao pode ser revertida.' },
  'drawer.no_items': { fr: 'Aucune ligne de facture', pt: 'Sem linhas de fatura' },
  'drawer.added_at': { fr: 'Ajoutée le', pt: 'Adicionada em' },
  'drawer.doc_not_available': { fr: 'Document non disponible', pt: 'Documento nao disponivel' },
  'drawer.total': { fr: 'Total TTC', pt: 'Total c/IVA' },
  'drawer.deleting': { fr: 'Suppression...', pt: 'A eliminar...' },

  // Review
  'review.title': { fr: 'Vérifier la facture', pt: 'Rever fatura' },
  'review.approve': { fr: 'Approuver la facture', pt: 'Aprovar fatura' },
  'review.badge': { fr: 'À vérifier', pt: 'A verificar' },
  'review.close': { fr: 'Fermer', pt: 'Fechar' },

  // Edit Modal
  'edit.title': { fr: 'Modifier la facture', pt: 'Editar fatura' },
  'edit.saving': { fr: 'Enregistrement...', pt: 'A guardar...' },

  // Company-email integration
  'company.email': { fr: 'Email lié', pt: 'Email associado' },
  'company.no_email': { fr: 'Aucun email connecté', pt: 'Nenhum email conectado' },
  'company.connect_gmail': { fr: 'Connecter Gmail', pt: 'Conectar Gmail' },
  'company.disconnect_gmail': { fr: 'Déconnecter', pt: 'Desconectar' },
  'company.gmail_connected': { fr: 'Gmail connecté', pt: 'Gmail conectado' },
  'company.default': { fr: 'Par défaut', pt: 'Predefinida' },
  'company.oauth_success': { fr: 'Compte Gmail connecté avec succès !', pt: 'Conta Gmail conectada com sucesso!' },
  'company.oauth_error': { fr: 'Erreur de connexion Gmail', pt: 'Erro ao conectar Gmail' },

  // Navigation extras
  'nav.logout': { fr: 'Déconnexion', pt: 'Terminar sessão' },

  // Generic
  'generic.loading': { fr: 'Chargement...', pt: 'A carregar...' },
  'generic.no_data': { fr: 'Aucune donnée', pt: 'Sem dados' },
  'generic.confirm_remove': { fr: 'Confirmer la suppression ?', pt: 'Confirmar remoção?' },

  // Supplier extras
  'sup.none': { fr: 'Aucun fournisseur', pt: 'Nenhum fornecedor' },
  'sup.unknown': { fr: 'Fournisseur inconnu', pt: 'Fornecedor desconhecido' },
  'sup.sous_traitant': { fr: 'Sous-traitant', pt: 'Subempreiteiro' },

  // Categories (nature depense)
  'cat.materiaux': { fr: 'Matériaux', pt: 'Materiais' },
  'cat.sous_traitants': { fr: 'Sous-traitants', pt: 'Subempreiteiros' },
  'cat.location_materiel': { fr: 'Location matériel', pt: 'Aluguer equipamento' },
  'cat.restauration': { fr: 'Restauration', pt: 'Alimentação' },
  'cat.carburant': { fr: 'Carburant', pt: 'Combustível' },
  'cat.atelier': { fr: 'Atelier', pt: 'Oficina' },
  'cat.assurances': { fr: 'Assurances', pt: 'Seguros' },
  'cat.comptabilite': { fr: 'Comptabilité', pt: 'Contabilidade' },
  'cat.fournitures_bureau': { fr: 'Fourn. bureau', pt: 'Mat. escritório' },
  'cat.autre': { fr: 'Autre', pt: 'Outro' },

  // Cost types
  'cat.cout_fixe': { fr: 'Coût fixe', pt: 'Custo fixo' },
  'cat.cout_variable': { fr: 'Coût variable', pt: 'Custo variável' },

  // Metiers
  'cat.electricite': { fr: 'Électricité', pt: 'Eletricidade' },
  'cat.plomberie': { fr: 'Plomberie', pt: 'Canalização' },
  'cat.chauffage': { fr: 'Chauffage', pt: 'Aquecimento' },
  'cat.platrerie': { fr: 'Plâtrerie', pt: 'Estuque' },

  // Filters
  'filter.year': { fr: 'Année', pt: 'Ano' },
  'filter.month': { fr: 'Mois', pt: 'Mês' },
  'filter.metier': { fr: 'Métier', pt: 'Especialidade' },
  'filter.nature': { fr: 'Nature', pt: 'Natureza' },
  'filter.cost_type': { fr: 'Type', pt: 'Tipo' },
  'filter.all_metiers': { fr: 'Tous les métiers', pt: 'Todas especialidades' },
  'filter.all_natures': { fr: 'Toutes les natures', pt: 'Todas naturezas' },
  'filter.all_types': { fr: 'Tous les types', pt: 'Todos os tipos' },
  'filter.all_years': { fr: 'Toutes les années', pt: 'Todos os anos' },
  'filter.all_months': { fr: 'Tous les mois', pt: 'Todos os meses' },

  // Inbox extras
  'inbox.confidence': { fr: 'confiance', pt: 'confiança' },
  'inbox.no_invoices': { fr: 'Aucune facture', pt: 'Sem faturas' },

  // Sync toasts
  'sync.processed': { fr: 'facture(s) traitée(s) !', pt: 'fatura(s) processada(s)!' },
  'sync.duplicates': { fr: 'doublon(s) trouvé(s)', pt: 'duplicada(s) encontrada(s)' },
  'sync.no_emails': { fr: 'Aucun email avec factures dans les dernières 24h', pt: 'Nenhum email com faturas nas últimas 24h' },
  'sync.error': { fr: 'Erreur lors de la vérification', pt: 'Erro ao verificar' },

  // Month abbreviations
  'month_abbr.1': { fr: 'Jan', pt: 'Jan' },
  'month_abbr.2': { fr: 'Fév', pt: 'Fev' },
  'month_abbr.3': { fr: 'Mar', pt: 'Mar' },
  'month_abbr.4': { fr: 'Avr', pt: 'Abr' },
  'month_abbr.5': { fr: 'Mai', pt: 'Mai' },
  'month_abbr.6': { fr: 'Jun', pt: 'Jun' },
  'month_abbr.7': { fr: 'Jul', pt: 'Jul' },
  'month_abbr.8': { fr: 'Aoû', pt: 'Ago' },
  'month_abbr.9': { fr: 'Sep', pt: 'Set' },
  'month_abbr.10': { fr: 'Oct', pt: 'Out' },
  'month_abbr.11': { fr: 'Nov', pt: 'Nov' },
  'month_abbr.12': { fr: 'Déc', pt: 'Dez' },

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
