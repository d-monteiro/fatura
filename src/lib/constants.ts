// Defaults globais para a UI quando o tenant ainda não tem categorias
// configuradas. A taxonomia oficial vive em `categories` (axis='category')
// — estes labels servem só como fallback para categorias herdadas em invoices
// antigas.

export const FALLBACK_CATEGORY_LABELS: Record<string, string> = {
  materiais: 'Materiais',
  subcontratacao: 'Subcontratação',
  subempreiteiros: 'Subempreiteiros',
  aluguer_de_equipamento: 'Aluguer de equipamento',
  alimentacao: 'Alimentação',
  combustivel: 'Combustível',
  oficina: 'Oficina',
  seguros: 'Seguros',
  contabilidade: 'Contabilidade',
  material_escritorio: 'Material de escritório',
  eletricidade: 'Eletricidade',
  canalizacao: 'Canalização',
  aquecimento: 'Aquecimento',
  carpintaria: 'Carpintaria',
  pintura: 'Pintura',
  estuque: 'Estuque',
  alvenaria: 'Alvenaria',
  marketing: 'Marketing',
  software_saas: 'Software / SaaS',
  formacao: 'Formação',
  deslocacoes: 'Deslocações',
  renda: 'Renda',
  rendas: 'Renda',
  transporte: 'Transporte',
  embalagem: 'Embalagem',
  mercadorias: 'Mercadorias',
  outro: 'Outro',
};
