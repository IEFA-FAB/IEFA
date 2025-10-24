import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import { ThemeProvider } from "@iefa/ui";


import type { Route } from "./+types/root";
import "./app.css";
import { AuthProvider } from "@iefa/auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

const queryClient = new QueryClient();

export function Layout({ children }: { children: React.ReactNode }) {
const noFlashScript = `
(function() {
  try {
    var key = 'iefa-theme';
    var stored = localStorage.getItem(key);
    var mql = window.matchMedia('(prefers-color-scheme: dark)');
    var system = mql.matches ? 'dark' : 'light';
    var theme = stored || 'system';
    var resolved = theme === 'dark' || (theme === 'system' && system === 'dark') ? 'dark' : 'light';
    var root = document.documentElement;
    if (resolved === 'dark') root.classList.add('dark'); else root.classList.remove('dark');
    root.style.colorScheme = resolved; // ajusta scrollbars/controles nativos
  } catch (e) {}
})();`;

  return (
    <html lang="pt-br">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark light" />
        <link rel="icon" type="image/svg" href="/favicon.svg"></link>
        <Meta />
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
        <Links />
      </head>
      <body suppressHydrationWarning>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider defaultTheme="system" storageKey="iefa-theme">
            <AuthProvider>{children}</AuthProvider>
          </ThemeProvider>
          <ScrollRestoration />
          <Scripts />
        </QueryClientProvider>
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
