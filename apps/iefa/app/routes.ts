import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  layout("routes/layout.tsx", [
    index("routes/home.tsx"),
    route("facilidades/pregoeiro", "routes/facilities/pregoeiro.tsx"),
  ]),
] satisfies RouteConfig;
