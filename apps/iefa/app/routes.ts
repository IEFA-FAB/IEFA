import {
  type RouteConfig,
  index,
  layout,
  prefix,
  route,
} from "@react-router/dev/routes";

export default [
  route("healthz", "routes/health.tsx"),

  layout("routes/layout.tsx", [
    index("routes/home.tsx"),
    route("chat/rada", "routes/chatRada.tsx"),
    ...prefix("facilidades", [
      index("routes/facilities/index.tsx"),
      route("pregoeiro", "routes/facilities/pregoeiro.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
