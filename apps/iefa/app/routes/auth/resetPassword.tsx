// apps/iefa/app/route/auth/resetPassword.tsx

import type { Route } from "./+types/login";

import { ResetPassword } from "@iefa/auth";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Reset sua senha" },
    { name: "description", content: "Altere sua senha" },
  ];
}

export default ResetPassword;
