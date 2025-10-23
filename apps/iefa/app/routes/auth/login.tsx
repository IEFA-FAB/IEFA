// apps/iefa/app/route/auth/login.tsx

import type { Route } from "./+types/login";

import { Login } from "@iefa/auth";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Login" },
    { name: "description", content: "Faça seu Login" },
  ];
}

export default Login;
