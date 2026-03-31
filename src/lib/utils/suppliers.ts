/**
 * Normalisation fournisseurs FR (construction)
 */
export function normalizeSupplierName(name: string | null): string | null {
  if (!name) return null;
  const upper = name.toUpperCase().trim();

  // Construction / BTP
  if (upper.includes('LEROY MERLIN')) return 'LEROY MERLIN';
  if (upper.includes('POINT P') || upper.includes('POINT.P')) return 'POINT P';
  if (upper.includes('CEDEO')) return 'CEDEO';
  if (upper.includes('REXEL')) return 'REXEL';
  if (upper.includes('YESSS') || upper.includes('YESS')) return 'YESSS';
  if (upper.includes('WURTH') || upper.includes('WÜRTH')) return 'WURTH';
  if (upper.includes('BIGMAT') || upper.includes('TOUJAS')) return 'BIGMAT TOUJAS & COLL';
  if (upper.includes('LUCIAT') || upper.includes('ISDI')) return 'LUCIAT';
  if (upper.includes('HILTI')) return 'HILTI';
  if (upper.includes('SONEPAR')) return 'SONEPAR';
  if (upper.includes('BROSSETTE')) return 'BROSSETTE';
  if (upper.includes('PROLIANS')) return 'PROLIANS';
  if (upper.includes('DESCOURS') || upper.includes('CABAUD')) return 'DESCOURS & CABAUD';
  if (upper.includes('PLACOPLATRE') || upper.includes('PLACO')) return 'PLACO';
  if (upper.includes('SAINT-GOBAIN') || upper.includes('SAINT GOBAIN')) return 'SAINT-GOBAIN';
  if (upper.includes('KILOUTOU')) return 'KILOUTOU';
  if (upper.includes('LOXAM')) return 'LOXAM';

  // Energie
  if (upper.includes('EDF') || upper.includes('ELECTRICITE DE FRANCE')) return 'EDF';
  if (upper.includes('ENGIE') || upper.includes('GDF')) return 'ENGIE';
  if (upper.includes('TOTAL') && upper.includes('ENERG')) return 'TOTALENERGIES';

  // Carburant
  if (upper.includes('TOTALENERGIES') || (upper.includes('TOTAL') && !upper.includes('ENERG'))) return 'TOTALENERGIES';
  if (upper.includes('SHELL')) return 'SHELL';
  if (upper.includes('BP ') || upper === 'BP') return 'BP';

  // Telecom
  if (upper.includes('ORANGE') || upper.includes('FRANCE TELECOM')) return 'ORANGE';
  if (upper.includes('SFR')) return 'SFR';
  if (upper.includes('FREE') || upper.includes('ILIAD')) return 'FREE';
  if (upper.includes('BOUYGUES TELECOM')) return 'BOUYGUES TELECOM';

  // Assurances
  if (upper.includes('AXA')) return 'AXA';
  if (upper.includes('MAIF')) return 'MAIF';
  if (upper.includes('MAAF')) return 'MAAF';
  if (upper.includes('ALLIANZ')) return 'ALLIANZ';

  // Comptabilité
  if (upper.includes('EXPERT COMPTABLE') || upper.includes('EXPERTISE COMPTABLE')) return upper;

  return upper;
}
