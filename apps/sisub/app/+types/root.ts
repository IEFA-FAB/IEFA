export namespace Route {
  export type LinksFunction = () => Array<{
    rel: string;
    href: string;
    crossOrigin?: string;
  }>;

  export interface ErrorBoundaryProps {
    error: unknown;
  }
}