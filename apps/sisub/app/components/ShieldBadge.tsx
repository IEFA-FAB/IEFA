import { ShieldCheck } from "lucide-react";

export default function ShieldBadge() {
  return (
    <span className="inline-flex items-center justify-center rounded-full w-5 h-5 bg-blue-100 text-blue-700">
      <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
    </span>
  );
}
