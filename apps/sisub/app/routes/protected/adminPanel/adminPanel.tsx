import { useEffect, useState } from "react";
import type { Route } from "./+types/adminPanel";
import { Navigate } from "react-router";
import { useAuth } from "@iefa/auth";
import { checkUserLevel } from "~/components/UserLevel/AdminService";

// Componentes refatorados
import AdminHero from "~/components/admin/AdminHero";
import IndicatorsCard from "~/components/admin/IndicatorsCard";
import QRAutoCheckinCard from "~/components/admin/QRAutoCheckinCard"; /* 
import LoadingSkeletons from "~/components/admin/LoadingSkeletons"; */

type AdminStatus = "checking" | "authorized" | "unauthorized";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Painel Admin" },
    { name: "description", content: "Controle sua unidade" },
  ];
}

export default function AdminPanel() {
  const { user } = useAuth();

  const [status, setStatus] = useState<AdminStatus>("checking");
  const [error, setError] = useState<string | null>(null);

  // Unidade selecionada no QR
  const [selectedOm, setSelectedOm] = useState<string>("");

  // Entrada com fade-in
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 10);
    return () => clearTimeout(t);
  }, []);

  // Checagem de nível de usuário
  useEffect(() => {
    let active = true;
    const fetchUserLevel = async () => {
      if (!user?.id) return;
      setStatus("checking");
      setError(null);
      try {
        const userLevel = await checkUserLevel(user.id);
        if (!active) return;
        if (userLevel === "admin" || userLevel === "superadmin") {
          setStatus("authorized");
        } else {
          setStatus("unauthorized");
        }
      } catch (e) {
        if (!active) return;
        setError(
          "Não foi possível verificar suas permissões. Tente novamente."
        );
        setStatus("unauthorized");
      }
    };
    fetchUserLevel();
    return () => {
      active = false;
    };
  }, [user?.id]);

  // Redirect se não tem permissão
  if (status === "unauthorized") {
    return <Navigate to="/rancho" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Hero */}
      <section
        id="hero"
        className={`container mx-auto max-w-screen-2xl px-4 pt-10 md:pt-14 transition-all duration-500 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <AdminHero error={error} />
      </section>

      {/* Conteúdo */}
      <section
        id="content"
        className={`container mx-auto max-w-screen-2xl px-4 py-10 md:py-14 transition-all duration-500 delay-100 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <div className="grid grid-cols-1 gap-6 lg:gap-8">
          <IndicatorsCard />
          <QRAutoCheckinCard
            selectedOm={selectedOm}
            onChangeSelectedOm={setSelectedOm}
            status={status}
          />
        </div>
      </section>
    </div>
  );
}
