import { useMemo, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import {
  QrCode,
  AlertCircle,
  Copy,
  CheckCircle2,
  Download,
} from "lucide-react";
import { UnitSelector } from "~/components/UnitSelector";

type AdminStatus = "checking" | "authorized" | "unauthorized";

export default function QRAutoCheckinCard({
  selectedOm,
  onChangeSelectedOm,
  status,
}: {
  selectedOm: string;
  onChangeSelectedOm: (value: string) => void;
  status: AdminStatus;
}) {
  const baseUrl = "https://app.previsaosisub.com.br/checkin";
  const currentOm = selectedOm?.trim();

  const qrValue = useMemo(() => {
    const url = new URL(baseUrl);
    const om = (currentOm ?? "").normalize("NFKC").trim();
    url.searchParams.set("u", om);
    return url.toString();
  }, [baseUrl, currentOm]);

  // Ações do QR (copiar / baixar)
  const qrWrapRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyOm = async () => {
    try {
      if (!currentOm) return;
      await navigator.clipboard.writeText(currentOm);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("Não foi possível copiar a OM.");
    }
  };

  const handleDownloadPng = () => {
    const canvas: HTMLCanvasElement | null =
      (qrWrapRef.current?.querySelector("canvas") as HTMLCanvasElement) ?? null;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-auto-checkin-${currentOm || "om"}.png`;
    a.click();
  };

  return (
    <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-2">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
          <QrCode className="h-4 w-4" aria-hidden="true" />
          Auto Check-In
        </div>
        {currentOm ? (
          <span className="text-xs text-gray-500">OM: {currentOm}</span>
        ) : (
          <span className="text-xs text-gray-400">OM não definida</span>
        )}
      </div>

      <h2 className="text-xl font-bold text-gray-900 mb-4">
        QR Code de Auto Check-In
      </h2>

      {/* UnitSelector — escolhe a OM do QR */}
      <div className="mb-4">
        <UnitSelector
          value={selectedOm}
          onChange={onChangeSelectedOm}
          disabled={status !== "authorized"}
          hasDefaultUnit={false}
          showValidation={true}
          size="md"
          placeholder="Selecione uma unidade..."
        />
      </div>

      <div className="text-gray-600 text-sm mb-4">
        Exiba este QR no ponto de acesso. Usuários autorizados farão check-in
        pela câmera do celular.
      </div>

      <div
        ref={qrWrapRef}
        className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-6"
      >
        {currentOm ? (
          <QRCodeCanvas
            value={qrValue}
            size={256}
            level="Q"
            bgColor="#ffffff"
            fgColor="#1f2937"
            aria-label="QR code para auto check-in da OM"
            marginSize={2}
          />
        ) : (
          <div
            className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700"
            role="status"
            aria-live="polite"
          >
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            Defina uma OM para gerar o QR Code.
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <button
          onClick={handleCopyOm}
          disabled={!currentOm}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-150 shadow-sm ${
            currentOm
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {copied ? (
            <>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Copiado
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copiar OM
            </>
          )}
        </button>
        <button
          onClick={handleDownloadPng}
          disabled={!currentOm}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-150 border ${
            currentOm
              ? "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              : "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Baixar PNG do QR
        </button>
      </div>
    </div>
  );
}
