import {
  type RouteConfig,
  index,
  layout,
  prefix,
  route,
} from "@react-router/dev/routes";

export default [
  route("health", "routes/health.tsx"),

  layout("routes/layout.tsx", [
    index("routes/home.tsx"),
    route("chat/rada", "routes/chatRada.tsx"),
    ...prefix("facilidades", [
      index("routes/facilities/index.tsx"),
      route("pregoeiro", "routes/facilities/pregoeiro.tsx"),
    ]),
    route("dashboard", "routes/overseerDashboard.tsx"),
    
    layout("routes/auth/layout.tsx", [
      route("login", "routes/auth/login.tsx"),
      route("register", "routes/auth/register.tsx"),
      route("/auth/reset-password", "routes/auth/resetPassword.tsx"),
    ]),
  ]),

  route("*", "routes/notFound.tsx"),
] satisfies RouteConfig;
