// apps/sisub/app/auth/register.tsx

import { Route } from "./+types/register";

import { Register } from "@iefa/auth";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Registre-se" },
    { name: "description", content: "Faça seu Registro" },
  ];
}

export default Register;
