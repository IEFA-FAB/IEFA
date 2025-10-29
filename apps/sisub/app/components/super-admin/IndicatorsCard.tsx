import { useMemo, useState } from "react";
import { AlertCircle, ExternalLink, Maximize2 } from "lucide-react";

export default function IndicatorsCard() {
  const [expanded, setExpanded] = useState(false);
  const frameHeight = useMemo(() => "clamp(520px, 78vh, 1000px)", []);
  const toggleExpanded = () => setExpanded((e) => !e);

  const powerBiUrl =
    "https://app.powerbi.com/view?r=eyJrIjoiMmQ5MDYwODMtODJjNy00NzVkLWFjYzgtYjljYzE4NmM0ZDgxIiwidCI6IjNhMzY0ZGI2LTg2NmEtNDRkOS1iMzY5LWM1ODk1OWQ0NDhmOCJ9";

  return (
    <div
      className={`rounded-2xl border  shadow-sm ${
        expanded ? "p-0" : "p-6"
      }`}
    >
      {/* Barra superior */}
      <div
        className={`${expanded ? "px-4 py-3" : "mb-4"} flex items-center justify-between`}
      >
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs  border ">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          Indicadores Gerais
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              window.open(powerBiUrl, "_blank", "noopener,noreferrer")
            }
            className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border "
            aria-label="Abrir relatório em nova aba"
            title="Abrir em nova aba"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Abrir
          </button>

          <button
            onClick={toggleExpanded}
            className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border "
            aria-pressed={expanded}
            aria-label={expanded ? "Reduzir" : "Expandir"}
            title={expanded ? "Reduzir" : "Expandir"}
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
            {expanded ? "Reduzir" : "Expandir"}
          </button>
        </div>
      </div>

      <div className={expanded ? "" : "px-0"}>
        <div className={`${expanded ? "" : "px-6"} pb-4`}>
          {!expanded && (
            <>
              <h2 className="text-xl font-bold ">
                Indicadores do Sistema
              </h2>
              <p className=" text-sm">
                Acompanhe métricas gerais do SISUB. Expanda para tela cheia para
                melhor visualização.
              </p>
            </>
          )}
        </div>

        <div className={`${expanded ? "" : "px-6"} pb-6`}>
          <div className="rounded-2xl border  overflow-hidden ">
            <iframe
              title="Sistema_sisub_FINALFINAL"
              className="w-full"
              style={{ height: frameHeight }}
              src={powerBiUrl}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <div className="mt-3 text-xs  px-1">
            Dica: use o botão de tela cheia dentro do relatório para melhor
            experiência.
          </div>
        </div>
      </div>
    </div>
  );
}
