import { AlertCircle } from "lucide-react";
import ShieldBadge from "~/components/ShieldBadge";

export default function AdminHero({ error }: { error: string | null }) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm bg-blue-50 text-blue-700 border border-blue-200 mb-3">
        <ShieldBadge />
        Painel Administrativo
      </div>
      <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
        Controles da sua OM
      </h1>
      <p className="text-gray-600 max-w-2xl mx-auto">
        Gere o QR de auto check-in e acompanhe indicadores da unidade em tempo
        real.
      </p>

      {error && (
        <div
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-red-700"
          role="alert"
        >
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
