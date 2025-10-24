import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@iefa/ui";
import { Button } from "@iefa/ui";
import { Input } from "@iefa/ui";
import { Label } from "@iefa/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@iefa/ui";
import type { ProfileAdmin } from "./ProfilesManager";
import { UserLevelOrNull } from "@iefa/auth";

export type EditUserPayload = {
  saram: string;
  role: UserLevelOrNull;
  om?: string | null;
};

type Option = { value: string; label: string };

export default function EditUserDialog({
  open,
  onOpenChange,
  isLoading,
  profile,
  unidades,
  isLoadingUnidades,
  unidadesError,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading: boolean;
  profile: ProfileAdmin | null;
  unidades: Option[];
  isLoadingUnidades: boolean;
  unidadesError?: string | null;
  onSubmit: (payload: EditUserPayload) => void | Promise<void>;
}) {
  const [saram, setSaram] = React.useState("");
  const [role, setRole] = React.useState<UserLevelOrNull>(null);
  const [om, setOm] = React.useState<string>("");

  React.useEffect(() => {
    if (profile && open) {
      setSaram(profile.saram || "");
      setRole(profile.role || null);
      setOm(profile.om || "");
    }
  }, [profile, open]);

  const handleSubmit = () => {
    onSubmit({ saram, role, om });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Editar Perfil</DialogTitle>
          <DialogDescription>
            Altere o SARAM, OM e a Role do usuário:{" "}
            <span className="font-medium text-gray-900">{profile?.email}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="saram" className="text-right">
              SARAM
            </Label>
            <Input
              id="saram"
              value={saram}
              onChange={(e) => setSaram(e.target.value)}
              className="col-span-3"
              maxLength={7}
              pattern="\d{7}"
              placeholder="Apenas 7 números"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="om" className="text-right">
              OM
            </Label>
            <Select
              value={om || ""}
              onValueChange={(value) => setOm(value)}
              disabled={isLoadingUnidades}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue
                  placeholder={
                    isLoadingUnidades ? "Carregando OMs..." : "Selecione a OM"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(unidades || []).map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="role" className="text-right">
              Role
            </Label>
            <Select
              value={role ?? ""}
              onValueChange={(value) => setRole(value as UserLevelOrNull)}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Selecione uma role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="superadmin">Superadmin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {unidadesError && (
            <p className="col-span-4 text-sm text-destructive">
              {unidadesError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Salvando..." : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
