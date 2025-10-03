import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  layout("routes/layout.tsx", [
    index("routes/home.tsx"),
    route("pregoeiro/facilidades", "routes/pregoeiro/facilities.tsx"),
  ]),
] satisfies RouteConfig;
