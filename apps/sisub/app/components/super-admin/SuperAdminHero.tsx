import ShieldBadge from "~/components/ShieldBadge";

export default function SuperAdminHero() {
  return (
    <div className="text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm bg-blue-50 text-blue-700 border border-blue-200 mb-3">
        <ShieldBadge />
        Painel SuperAdmin
      </div>
      <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
        Controle do Sistema
      </h1>
      <p className="text-gray-600 max-w-2xl mx-auto">
        Gerencie permissões, cadastre administradores e acompanhe indicadores
        gerais do SISUB.
      </p>
    </div>
  );
}
