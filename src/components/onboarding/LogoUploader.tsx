import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload, Trash2, ImagePlus, Sparkles } from 'lucide-react';
import { extractLogoColors } from '@/lib/utils/extractLogoColors';

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o ficheiro.'));
    reader.readAsDataURL(file);
  });
}

interface Props {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  onPaletteExtracted?: (colors: { primary: string; secondary: string }) => void;
}

export function LogoUploader({ value, onChange, onPaletteExtracted }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paletteExtracted, setPaletteExtracted] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Só são aceites ficheiros de imagem.');
      return;
    }
    setUploading(true);
    setPaletteExtracted(false);
    try {
      const url = await fileToDataUrl(file);
      onChange(url);
      if (onPaletteExtracted) {
        const palette = await extractLogoColors(url);
        if (palette) {
          onPaletteExtracted(palette);
          setPaletteExtracted(true);
        }
      }
    } catch {
      setError('Não foi possível ler o ficheiro.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    onChange(null);
    setPaletteExtracted(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label>Logótipo</Label>
        <span className="text-[11px] text-muted-foreground">Opcional</span>
      </div>

      {value ? (
        <div className="flex items-center gap-3 rounded-lg border bg-gradient-to-br from-muted/20 to-muted/40 p-3">
          <div className="h-16 w-16 rounded-lg overflow-hidden bg-white border shadow-sm flex items-center justify-center shrink-0">
            <img src={value} alt="Logo" className="max-h-full max-w-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            {paletteExtracted ? (
              <>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Cores detetadas
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Extraímos a paleta da sua marca automaticamente.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">Logótipo carregado</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Defina as cores manualmente abaixo.
                </p>
              </>
            )}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={handleRemove} className="gap-1 text-muted-foreground hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" /> Remover
          </Button>
        </div>
      ) : (
        <label
          htmlFor="logo-upload"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          className={`group relative flex items-center gap-4 rounded-lg border-2 border-dashed p-4 cursor-pointer transition-all ${
            dragOver
              ? 'border-primary bg-primary/5 scale-[1.01]'
              : 'border-muted-foreground/20 hover:border-primary/50 hover:bg-primary/[0.02]'
          }`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 text-primary shrink-0 group-hover:scale-105 transition-transform">
            {uploading ? <Upload className="h-5 w-5 animate-pulse" /> : <ImagePlus className="h-5 w-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {uploading ? 'A processar…' : 'Arraste ou clique para carregar'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Detetamos as cores da sua marca automaticamente
            </p>
          </div>
          <input
            ref={fileInputRef}
            id="logo-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </label>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
