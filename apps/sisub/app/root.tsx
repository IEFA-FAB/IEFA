import { AuthProvider } from "@iefa/auth";
import { ThemeProvider } from "@iefa/ui";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import supabase from "./utils/supabase";
import "./app.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Route } from "./+types/root";

const queryClient = new QueryClient();

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
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
    },
    {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=K2D:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800&display=swap",
    },
];

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
        <html lang="pt-BR">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link rel="icon" type="image/svg" href="/favicon.svg"></link>
                <Meta />
                <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
                <Links />
            </head>
            <body>
                <QueryClientProvider client={queryClient}>
                    <ThemeProvider defaultTheme="system" storageKey="iefa-theme">
                        <AuthProvider supabase={supabase}>{children}</AuthProvider>
                    </ThemeProvider>
                </QueryClientProvider>
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}

export default function App() {
    return <Outlet />;
}
