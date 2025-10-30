// apps/sisub/app/auth/layout.tsx
import { AuthLayout } from "@iefa/auth";

export default function Layout() {
  return (
    <div className="flex-1 h-full flex items-center align-middle content-center">
      <AuthLayout variant="strip" />
    </div>
  );
}
