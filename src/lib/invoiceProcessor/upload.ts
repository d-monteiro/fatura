import { uploadInvoiceToDrive, ensureFolder, getOrCreateYearlySheet } from '@/lib/google/drive';
import { formatMonthFolder } from '@/lib/utils/months';
import type { GeminiInvoiceData } from '@/types/database';
import type { TenantContext } from './tenant';

export function buildFolderPath(
  structure: string,
  root: string,
  companyName: string,
  year: number,
  monthLabel: string,
  categoryLabel: string,
  supplierName: string,
): string[] {
  switch (structure) {
    case 'year_type':
      return [root, companyName, String(year), categoryLabel || 'Outros'];
    case 'year_supplier':
      return [root, companyName, String(year), supplierName || 'OUTROS'];
    case 'year_month':
    default:
      return [root, companyName, String(year), monthLabel];
  }
}

export interface DriveTarget {
  parentFolderId: string;
  spreadsheetId: string | null;
  fileName: string;
}

export async function ensureDriveTarget(
  g: GeminiInvoiceData,
  file: File,
  companyName: string,
  token: string,
  tenant: TenantContext,
): Promise<DriveTarget> {
  const year = g.doc_year || new Date().getFullYear();
  const monthIdx = g.doc_date ? new Date(g.doc_date).getMonth() : new Date().getMonth();
  const monthLabel = formatMonthFolder(monthIdx, tenant.language);
  const categoryLabel = g.category
    ? g.category.charAt(0).toUpperCase() + g.category.slice(1).replace(/_/g, ' ')
    : 'Outros';

  const path = buildFolderPath(
    tenant.folderStructure,
    tenant.rootFolderName,
    companyName,
    year,
    monthLabel,
    categoryLabel,
    g.supplier_name || 'OUTROS',
  );

  let parentId = '';
  for (const segment of path) {
    parentId = await ensureFolder(token, segment, parentId || undefined);
  }

  let spreadsheetId: string | null = null;
  if (tenant.autoSheets) {
    const yearFolder = await ensureFolder(
      token,
      String(year),
      await ensureFolder(token, companyName, await ensureFolder(token, tenant.rootFolderName)),
    );
    spreadsheetId = await getOrCreateYearlySheet(token, year, yearFolder, tenant.language);
  }

  const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
  const fileName = `${g.doc_date}_${g.supplier_name}_${g.valor_total?.toFixed(2) || '0.00'}.${ext}`
    .replace(/[/\\?%*:|"<>]/g, '_');

  return { parentFolderId: parentId, spreadsheetId, fileName };
}

export async function uploadFileToDriveTarget(
  file: File,
  fileName: string,
  parentFolderId: string,
  token: string,
): Promise<{ id: string; webViewLink: string; webContentLink: string }> {
  const buf = await file.arrayBuffer();
  return uploadInvoiceToDrive(token, new Uint8Array(buf), fileName, parentFolderId, file.type);
}
