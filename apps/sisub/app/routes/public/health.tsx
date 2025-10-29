// app/routes/healthz.tsx
export async function loader() {
  return new Response("OK", { status: 200 });
}

// Nada a renderizar; opcional manter vazio
export default function Health() {
  return null;
}
