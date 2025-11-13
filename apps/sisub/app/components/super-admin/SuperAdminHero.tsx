import { Shield } from "lucide-react";

export default function SuperAdminHero() {
    return (
        <div className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm mb-3">
                <Shield />
                Painel SuperAdmin
            </div>
            <h1 className="text-3xl md:text-4xl font-bold  mb-3">Controle do Sistema</h1>
            <p className=" max-w-2xl mx-auto">
                Gerencie permissões, cadastre administradores e acompanhe indicadores gerais do SISUB.
            </p>
        </div>
    );
}
