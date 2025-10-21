import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  route("healthz", "routes/health.tsx"),

  layout("routes/layout.tsx", [
    index("routes/home.tsx"),
    route("chat/rada", "routes/chatRada.tsx"),
    route("facilidades/pregoeiro", "routes/facilities/pregoeiro.tsx"),
  ]),
] satisfies RouteConfig;
