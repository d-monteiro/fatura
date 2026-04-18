export type Lang = 'pt';

const translations = {
  // Navigation
  'nav.dashboard': { pt: 'Dashboard' },
  'nav.invoices': { pt: 'Faturas' },
  'nav.upload': { pt: 'Upload' },
  'nav.suppliers': { pt: 'Fornecedores' },
  'nav.settings': { pt: 'Definições' },
  'nav.billing': { pt: 'Faturação' },
  'nav.tickets': { pt: 'Suporte' },

  // Faturas tabs
  'fat.tab_review': { pt: 'A rever' },
  'fat.tab_all': { pt: 'Todas' },
  'fat.tab_processed': { pt: 'Arquivadas' },
  'fat.analyzing': { pt: 'A analisar' },
  'fat.failed': { pt: 'Falhou' },
  'fat.reprocess': { pt: 'Reprocessar' },
  'fat.reprocess_started': { pt: 'Análise reiniciada' },
  'pag.prev': { pt: 'Anterior' },
  'pag.next': { pt: 'Seguinte' },

  // Dashboard
  'dash.total_expenses': { pt: 'Total despesas' },
  'dash.fixed_costs': { pt: 'Custos fixos' },
  'dash.variable_costs': { pt: 'Custos variáveis' },
  'dash.to_review': { pt: 'A rever' },
  'dash.trends': { pt: 'Tendências' },
  'dash.categories': { pt: 'Categorias' },
  'dash.recent': { pt: 'Faturas recentes' },
  'dash.top_suppliers': { pt: 'Top fornecedores' },
  'dash.vs_last_month': { pt: 'vs mês anterior' },
  'dash.this_month': { pt: 'Este mês' },

  // Invoices
  'inv.date': { pt: 'Data' },
  'inv.supplier': { pt: 'Fornecedor' },
  'inv.nif': { pt: 'NIF' },
  'inv.metier': { pt: 'Especialidade' },
  'inv.nature': { pt: 'Natureza' },
  'inv.cost_type': { pt: 'Tipo custo' },
  'inv.doc_number': { pt: 'N° documento' },
  'inv.amount_ht': { pt: 'Valor s/IVA' },
  'inv.tva': { pt: 'IVA' },
  'inv.amount_ttc': { pt: 'Valor c/IVA' },
  'inv.tva_rate': { pt: 'Taxa IVA' },
  'inv.summary': { pt: 'Resumo' },
  'inv.status': { pt: 'Estado' },
  'inv.due_date': { pt: 'Data vencimento' },
  'inv.payment': { pt: 'Pagamento' },
  'inv.line_items': { pt: 'Linhas da fatura' },
  'inv.autoliquidation': { pt: 'Autoliquidação IVA' },

  // Upload
  'upload.title': { pt: 'Upload de faturas' },
  'upload.drag': { pt: 'Arraste ficheiros ou clique para selecionar' },
  'upload.formats': { pt: 'JPG, PNG, PDF ou HEIC (max 10MB)' },
  'upload.processing': { pt: 'A processar...' },
  'upload.analyzing': { pt: 'A analisar com IA...' },
  'upload.done': { pt: 'Processamento concluído' },
  'upload.error': { pt: 'Erro no processamento' },
  'upload.duplicate': { pt: 'Fatura duplicada' },
  'upload.no_google': { pt: 'Conecte uma conta Google para fazer upload de faturas.' },
  'upload.go_settings': { pt: 'Ir para Defini\u00e7\u00f5es' },
  'upload.no_company': { pt: 'Selecione uma empresa no menu lateral.' },
  'upload.files_count': { pt: 'ficheiro(s)' },
  'upload.success_count': { pt: 'processado(s)' },
  'upload.error_count': { pt: 'erro(s)' },
  'upload.checking_auth': { pt: 'A verificar autenticação...' },
  'upload.checking_auth_desc': { pt: 'A renovar tokens automaticamente se necessário.' },
  'upload.ready': { pt: 'Pronto para upload!' },
  'upload.ready_desc': { pt: 'Conta Google conectada.' },
  'upload.no_account': { pt: 'Nenhuma conta configurada' },
  'upload.no_account_desc': { pt: 'Adicione uma conta Google em Definições para fazer upload de faturas.' },
  'upload.configure_account': { pt: 'Configurar conta' },
  'upload.token_error': { pt: 'Erro ao renovar token' },
  'upload.retry': { pt: 'Tentar novamente' },
  'upload.rate_limit': { pt: 'Limite de uploads atingido' },
  'upload.rate_limit_desc': { pt: 'Aguarde {seconds} segundos antes de tentar.' },
  'upload.understood': { pt: 'Entendi' },
  'upload.take_photo': { pt: 'Tirar foto' },
  'upload.choose_file': { pt: 'Escolher ficheiro' },
  'upload.camera_tip_title': { pt: 'Dicas de qualidade' },
  'upload.camera_tip_1': { pt: 'Boa iluminação (sem sombras)' },
  'upload.camera_tip_2': { pt: 'Fatura bem enquadrada' },
  'upload.camera_tip_3': { pt: 'Texto legível e focado' },
  'upload.camera_tip_4': { pt: 'Evitar reflexos' },
  'upload.camera_confirm': { pt: 'Tirar foto' },
  'upload.processing_x_of_y': { pt: 'A processar {current} de {total}...' },
  'upload.uploading': { pt: 'A carregar...' },
  'upload.analyzing_ai': { pt: 'A analisar com IA...' },
  'upload.pending': { pt: 'A aguardar...' },
  'upload.processed_msg': { pt: 'Processado!' },
  'upload.complete': { pt: 'Processamento concluído!' },
  'upload.load_more': { pt: 'Carregar mais' },
  'upload.clear': { pt: 'Limpar' },
  'upload.how_title': { pt: 'Como funciona' },
  'upload.how_1': { pt: 'Carregue até {max} faturas de uma vez (imagens ou PDFs)' },
  'upload.how_2': { pt: 'A IA (Gemini) extrai automaticamente os dados de cada fatura' },
  'upload.how_3': { pt: 'Os dados são guardados e organizados no Google Drive' },
  'upload.how_4': { pt: 'Consulte tudo na página "Faturas"' },
  'upload.how_tip': { pt: 'Dica: Quanto melhor a qualidade da imagem, mais precisa será a análise.' },
  'upload.drag_mobile': { pt: 'Tire foto ou selecione ficheiros (max {max}, 10MB)' },
  'upload.drop_here': { pt: 'Solte os ficheiros aqui' },
  'upload.drag_desktop': { pt: 'Arraste faturas ou clique para selecionar' },
  'upload.formats_detail': { pt: 'Formatos aceites: JPG, PNG, PDF (max 10MB, máximo {max} ficheiros)' },

  // Inbox
  'inbox.empty': { pt: 'Nenhuma fatura a verificar' },

  // Suppliers
  'sup.name': { pt: 'Nome' },
  'sup.total_spent': { pt: 'Total gasto' },
  'sup.invoice_count': { pt: 'N° faturas' },
  'sup.subcontractor': { pt: 'Subempreiteiro' },
  'sup.detail': { pt: 'Detalhes fornecedor' },
  'sup.recent_invoices': { pt: 'Faturas recentes' },
  'sup.address': { pt: 'Morada' },
  'sup.iban': { pt: 'IBAN' },
  'sup.edit': { pt: 'Editar' },
  'sup.no_invoices': { pt: 'Sem faturas' },
  'sup.saved': { pt: 'Fornecedor guardado' },
  'sup.nif_invalid': { pt: 'NIF deve ter 9 dígitos' },

  // Settings
  'set.companies': { pt: 'Empresas' },
  'set.categories': { pt: 'Categorias' },
  'set.email_accounts': { pt: 'Contas email' },
  'set.language': { pt: 'Idioma' },

  // Automations (sync email card)
  'auto.check_emails': { pt: 'Verificar emails' },
  'auto.check_emails_desc': { pt: 'Verifica emails das últimas 24h com faturas PDF, processa com IA e guarda no Drive' },
  'auto.check_now': { pt: 'Verificar emails agora' },
  'auto.checking': { pt: 'A verificar emails...' },

  // Actions
  'action.save': { pt: 'Guardar' },
  'action.cancel': { pt: 'Cancelar' },
  'action.delete': { pt: 'Eliminar' },
  'action.export_excel': { pt: 'Exportar Excel' },
  'action.exporting': { pt: 'A exportar...' },
  'action.export_zip': { pt: 'Descarregar ZIP' },
  'action.approve': { pt: 'Aprovar' },
  'action.search': { pt: 'Pesquisar...' },
  'action.filter': { pt: 'Filtrar' },
  'action.clear_filters': { pt: 'Limpar filtros' },
  'action.view_pdf': { pt: 'Ver PDF' },
  'action.connect_google': { pt: 'Conectar Google' },
  'action.disconnect': { pt: 'Desconectar' },

  // Status
  'status.pending': { pt: 'Pendente' },
  'status.inbox': { pt: 'A verificar' },
  'status.processed': { pt: 'Processado' },
  'status.review': { pt: 'Em revisão' },

  // Companies
  'company.all': { pt: 'Todas as empresas' },
  'company.name': { pt: 'Nome' },
  'company.nif': { pt: 'NIF' },
  'company.address': { pt: 'Morada' },
  'company.saved': { pt: 'Empresa guardada' },

  // Errors
  'error.file_too_large': { pt: 'Ficheiro demasiado grande (max 10MB)' },
  'error.invalid_format': { pt: 'Formato não suportado. Use JPG, PNG, PDF ou HEIC.' },
  'error.no_google': { pt: 'Adicione uma conta Google em Automações.' },
  'error.analysis_failed': { pt: 'Erro ao analisar documento.' },
  'error.not_invoice': { pt: 'Este documento não é uma fatura.' },
  'error.illegible': { pt: 'Documento ilegível. Envie melhor qualidade.' },

  // Bulk
  'bulk.selected': { pt: 'selecionado(s)' },
  'bulk.select_all': { pt: 'Selecionar tudo' },
  'bulk.approve': { pt: 'Aprovar' },
  'bulk.delete': { pt: 'Eliminar' },

  // Export
  'export.pdf_link': { pt: 'Link PDF' },

  // Drawer / Detail
  'drawer.title': { pt: 'Detalhes da fatura' },
  'drawer.edit': { pt: 'Editar' },
  'drawer.delete': { pt: 'Eliminar' },
  'drawer.view_doc': { pt: 'Ver documento' },
  'drawer.view_pdf': { pt: 'Ver PDF' },
  'drawer.open_sheets': { pt: 'Abrir Sheets' },
  'drawer.company': { pt: 'Empresa' },
  'drawer.confidence': { pt: 'Confianca IA' },
  'drawer.iban': { pt: 'IBAN fornecedor' },
  'drawer.delete_confirm': { pt: 'Eliminar esta fatura?' },
  'drawer.delete_confirm_detail': { pt: 'Esta acao nao pode ser revertida.' },
  'drawer.no_items': { pt: 'Sem linhas de fatura' },
  'drawer.added_at': { pt: 'Adicionada em' },
  'drawer.doc_not_available': { pt: 'Documento nao disponivel' },
  'drawer.total': { pt: 'Total c/IVA' },
  'drawer.deleting': { pt: 'A eliminar...' },

  // Review
  'review.title': { pt: 'Rever fatura' },
  'review.approve': { pt: 'Aprovar fatura' },
  'review.badge': { pt: 'A verificar' },
  'review.close': { pt: 'Fechar' },

  // Edit Modal
  'edit.title': { pt: 'Editar fatura' },
  'edit.saving': { pt: 'A guardar...' },

  // Company-email integration
  'company.email': { pt: 'Email associado' },
  'company.no_email': { pt: 'Nenhum email conectado' },
  'company.connect_gmail': { pt: 'Conectar Gmail' },
  'company.disconnect_gmail': { pt: 'Desconectar' },
  'company.gmail_connected': { pt: 'Gmail conectado' },
  'company.oauth_success': { pt: 'Conta Gmail conectada com sucesso!' },
  'company.oauth_error': { pt: 'Erro ao conectar Gmail' },

  // Navigation extras
  'nav.logout': { pt: 'Terminar sessão' },

  // Generic
  'generic.loading': { pt: 'A carregar...' },
  'generic.no_data': { pt: 'Sem dados' },
  'generic.confirm_remove': { pt: 'Confirmar remoção?' },

  // Supplier extras
  'sup.none': { pt: 'Nenhum fornecedor' },
  'sup.unknown': { pt: 'Fornecedor desconhecido' },
  'sup.sous_traitant': { pt: 'Subempreiteiro' },

  // Categories (nature depense)
  'cat.materiaux': { pt: 'Materiais' },
  'cat.sous_traitants': { pt: 'Subempreiteiros' },
  'cat.location_materiel': { pt: 'Aluguer equipamento' },
  'cat.restauration': { pt: 'Alimentação' },
  'cat.carburant': { pt: 'Combustível' },
  'cat.atelier': { pt: 'Oficina' },
  'cat.assurances': { pt: 'Seguros' },
  'cat.comptabilite': { pt: 'Contabilidade' },
  'cat.fournitures_bureau': { pt: 'Mat. escritório' },
  'cat.autre': { pt: 'Outro' },

  // Cost types
  'cat.cout_fixe': { pt: 'Custo fixo' },
  'cat.cout_variable': { pt: 'Custo variável' },

  // Metiers
  'cat.electricite': { pt: 'Eletricidade' },
  'cat.plomberie': { pt: 'Canalização' },
  'cat.chauffage': { pt: 'Aquecimento' },
  'cat.platrerie': { pt: 'Estuque' },

  // Filters
  'filter.year': { pt: 'Ano' },
  'filter.month': { pt: 'Mês' },
  'filter.metier': { pt: 'Especialidade' },
  'filter.nature': { pt: 'Natureza' },
  'filter.cost_type': { pt: 'Tipo' },
  'filter.all_metiers': { pt: 'Todas especialidades' },
  'filter.all_natures': { pt: 'Todas naturezas' },
  'filter.all_types': { pt: 'Todos os tipos' },
  'filter.all_years': { pt: 'Todos os anos' },
  'filter.all_months': { pt: 'Todos os meses' },

  // Inbox extras
  'inbox.no_invoices': { pt: 'Sem faturas' },

  // Sync toasts
  'sync.processed': { pt: 'fatura(s) processada(s)!' },
  'sync.duplicates': { pt: 'duplicada(s) encontrada(s)' },
  'sync.no_emails': { pt: 'Nenhum email com faturas nas últimas 24h' },
  'sync.error': { pt: 'Erro ao verificar' },

  // Month abbreviations
  'month_abbr.1': { pt: 'Jan' },
  'month_abbr.2': { pt: 'Fev' },
  'month_abbr.3': { pt: 'Mar' },
  'month_abbr.4': { pt: 'Abr' },
  'month_abbr.5': { pt: 'Mai' },
  'month_abbr.6': { pt: 'Jun' },
  'month_abbr.7': { pt: 'Jul' },
  'month_abbr.8': { pt: 'Ago' },
  'month_abbr.9': { pt: 'Set' },
  'month_abbr.10': { pt: 'Out' },
  'month_abbr.11': { pt: 'Nov' },
  'month_abbr.12': { pt: 'Dez' },

  // Months
  'month.1': { pt: 'Janeiro' },
  'month.2': { pt: 'Fevereiro' },
  'month.3': { pt: 'Março' },
  'month.4': { pt: 'Abril' },
  'month.5': { pt: 'Maio' },
  'month.6': { pt: 'Junho' },
  'month.7': { pt: 'Julho' },
  'month.8': { pt: 'Agosto' },
  'month.9': { pt: 'Setembro' },
  'month.10': { pt: 'Outubro' },
  'month.11': { pt: 'Novembro' },
  'month.12': { pt: 'Dezembro' },
} as const;

export type TranslationKey = keyof typeof translations;

// Kept for non-React code (edge cases). Prefer useI18n() hook in components.
export function setLang(_lang: Lang) { /* no-op: só PT */ }
export function getLang(): Lang { return 'pt'; }

function resolve(key: TranslationKey): string {
  const entry = translations[key];
  return entry?.pt ?? key;
}

export function t(key: TranslationKey): string {
  return resolve(key);
}

// React-aware translation (lang ignorado — só PT por agora)
export function translate(key: TranslationKey, _lang: Lang): string {
  return resolve(key);
}
