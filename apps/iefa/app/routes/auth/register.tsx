// apps/iefa/app/route/auth/register.tsx

import type { Route } from "./+types/register";

import { Register } from "@iefa/auth";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Registre-se" },
    { name: "description", content: "Faça seu Registro" },
  ];
}

export default Register;
