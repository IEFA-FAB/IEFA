// src/components/RouteSelector.tsx

"use client";

import * as React from "react";
import { useLocation, useNavigate } from "react-router";
import { Calendar, ScanQrCode } from "lucide-react";

// Importações dos componentes ShadCN UI
import { Button } from "@iefa/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@iefa/ui";

import type { UserLevelOrNull } from "@iefa/auth";

interface RouteSelectorProps {
  userLevel: UserLevelOrNull;
}

// Definição das rotas e seus labels
const routeOptions = [
  {
    value: "previsao",
    label: "Previsão",
    path: "/rancho",
    roles: ["user", "admin", "superadmin"],
  },
  {
    value: "fiscal",
    label: "Fiscal",
    path: "/fiscal",
    roles: ["user", "admin", "superadmin"],
  },
  {
    value: "admin",
    label: "Admin",
    path: "/admin",
    roles: ["admin", "superadmin"],
  },
  {
    value: "superadmin",
    label: "Superadmin",
    path: "/superadmin",
    roles: ["superadmin"],
  },
];

export default function RouteSelector({ userLevel }: RouteSelectorProps) {
  const location = useLocation();
  const navigate = useNavigate();

  // Hook para evitar renderização no lado do servidor que cause "hydration mismatch"
  const [isClient, setIsClient] = React.useState(false);
  React.useEffect(() => {
    setIsClient(true);
  }, []);

  // Determina a view/rota atual com base no pathname
  const getCurrentView = () => {
    const currentPath = location.pathname;
    if (currentPath.startsWith("/rancho")) return "previsao";
    if (currentPath.startsWith("/fiscal")) return "fiscal";
    if (currentPath.startsWith("/admin")) return "admin";
    if (currentPath.startsWith("/superadmin")) return "superadmin";
    return "";
  };

  const currentView = getCurrentView();

  // Handler de navegação para o Select
  const handleNavigation = (value: string) => {
    const selectedRoute = routeOptions.find((opt) => opt.value === value);
    if (selectedRoute) {
      navigate(selectedRoute.path);
    }
  };

  if (!userLevel) {
    return null;
  }

  if (userLevel === "user") {
    const isOnRancho = currentView === "previsao";
    const toggleTarget = isOnRancho ? "/fiscal" : "/rancho";
    const toggleLabel = isOnRancho ? "Fiscal" : "Previsão";
    const ToggleIcon = isOnRancho ? ScanQrCode : Calendar;

    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate(toggleTarget)}
        className="flex items-center space-x-2 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all duration-200 shadow-sm cursor-pointer"
      >
        <ToggleIcon className="h-4 w-4" />
        {isClient && window.innerWidth >= 640 && (
          <span className="font-medium">{toggleLabel}</span>
        )}
      </Button>
    );
  }

  // Renderização para "admin" e "superadmin" (Select)
  if (userLevel === "admin" || userLevel === "superadmin") {
    // Filtra as opções de rota com base no nível do usuário
    const availableOptions = routeOptions.filter((opt) =>
      opt.roles.includes(userLevel)
    );

    return (
      <Select value={currentView} onValueChange={handleNavigation}>
        <SelectTrigger className="w-[180px] h-9 cursor-pointer">
          <SelectValue placeholder="Selecionar Módulo" />
        </SelectTrigger>
        <SelectContent>
          {availableOptions.map((option) => (
            <SelectItem
              className="cursor-pointer"
              key={option.value}
              value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // Retorno padrão (não deve ser alcançado se userLevel for um dos tipos esperados)
  return null;
}
