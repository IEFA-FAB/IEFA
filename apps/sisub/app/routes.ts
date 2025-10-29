import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  layout("./auth/layout.tsx", [
    route("login", "./auth/login.tsx"),
    route("register", "./auth/register.tsx"),
    route("/auth/reset-password", "./auth/resetPassword.tsx"),
  ]),

  layout("./routes/layouts/public-layout.tsx", [
    index("routes/public/home.tsx"),
    route("tutorial", "routes/public/tutorial.tsx"),
    route("changelog", "routes/public/changelog.tsx"),
    route("health", "routes/public/health.tsx"),
  ]),

  layout("./routes/layouts/app-layout.tsx", [
    route("profile", "./routes/protected/profile.tsx"),
    route("rancho", "./routes/protected/rancho.tsx"),
    route("checkin", "./routes/protected/selfCheckIn.tsx"),
    route("fiscal", "./routes/protected/presence.tsx"),
    route("admin", "./routes/protected/adminPanel.tsx"),
    route("superadmin", "./routes/protected/superAdminPanel.tsx"),
  ]),
] satisfies RouteConfig;
