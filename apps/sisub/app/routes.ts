import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/home/home.tsx"),
  route("changelog", "routes/home/changelog.tsx"),
  route("tutorial", "routes/home/tutorial.tsx"),
  route("health", "routes/home/health.tsx"),

  layout("./auth/layout.tsx", [
    route("login", "./auth/login.tsx"),
    route("register", "./auth/register.tsx"),
    route("/auth/reset-password", "./auth/resetPassword.tsx"),
  ]),

  layout("./routes/protected/layout.tsx", [
    route("rancho", "./routes/protected/home/rancho.tsx"),
    route("checkin", "./routes/protected/home/selfCheckIn.tsx"),
    route("fiscal", "./routes/protected/presence/presence.tsx"),
    route("admin", "./routes/protected/adminPanel/adminPanel.tsx"),
    route(
      "superadmin",
      "./routes/protected/superAdminPanel/superAdminPanel.tsx"
    ),
  ]),
] satisfies RouteConfig;
