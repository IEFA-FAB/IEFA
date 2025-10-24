// apps/sisub/app/auth/resetPassword.tsx

import { Route } from "./+types/login";

import { ResetPassword } from "@iefa/auth";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Reset sua senha" },
    { name: "description", content: "Altere sua senha" },
  ];
}

export default ResetPassword;
