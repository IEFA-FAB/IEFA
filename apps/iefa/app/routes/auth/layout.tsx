// apps/iefa/app/route/auth/layout.tsx
import { AuthLayout } from "@iefa/auth";

export default function Layout() {
  return (
    <AuthLayout
      variant="strip"
      config={{
        defaultRedirect: "/",
        publicPaths: [
          "/",
          "/chat/rada",
          "/health",
          "/favicon.ico",
          "/favicon.svg",
          (p) => p.startsWith("/"),
        ],
      }}
    />
  );
}
