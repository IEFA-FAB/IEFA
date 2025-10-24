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
import { UserLevelOrNull } from "@iefa/auth";

export type NewUserPayload = {
  id: string;
  email: string;
  name: string;
  saram: string;
  role: UserLevelOrNull;
  om?: string | null;
};

type Option = { value: string; label: string };

export default function AddUserDialog({
  open,
  onOpenChange,
  isLoading,
  unidades,
  isLoadingUnidades,
  unidadesError,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading: boolean;
  unidades: Option[];
  isLoadingUnidades: boolean;
  unidadesError?: string | null;
  onSubmit: (payload: NewUserPayload) => void | Promise<void>;
}) {
  const [id, setId] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [saram, setSaram] = React.useState("");
  const [role, setRole] = React.useState<UserLevelOrNull>(null);
  const [om, setOm] = React.useState<string>("");

  React.useEffect(() => {
    if (!open) {
      setId("");
      setEmail("");
      setName("");
      setSaram("");
      setRole(null);
      setOm("");
    }
  }, [open]);

  const handleSubmit = () => {
    onSubmit({ id, email, name, saram, role, om });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Adicionar Novo Usuário</DialogTitle>
          <DialogDescription>
            Preencha todos os campos para cadastrar o usuário em profiles_admin.
            O ID deve ser o UUID do usuário que se tornará Admin.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="id" className="text-right">
              ID (UUID)
            </Label>
            <Input
              id="id"
              value={id}
              onChange={(e) => setId(e.target.value)}
              className="col-span-3"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Nome
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-3"
              placeholder="Nome completo"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="email" className="text-right">
              Email
            </Label>
            <Input
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="col-span-3"
              placeholder="usuario@exemplo.com"
              type="email"
            />
          </div>

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
              inputMode="numeric"
              pattern="\d{7}"
              placeholder="Apenas 7 números"
            />
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
                    isLoadingUnidades
                      ? "Carregando OMs..."
                      : "Selecione a OM (opcional)"
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

          {unidadesError && (
            <p className="col-span-4 text-sm text-destructive">
              {unidadesError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Adicionando..." : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
