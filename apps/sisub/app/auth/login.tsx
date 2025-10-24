// apps/sisub/app/auth/login.tsx

import { Route } from "./+types/login";

import { Login } from "@iefa/auth";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Login" },
    { name: "description", content: "Faça seu Login" },
  ];
}

export default Login;
