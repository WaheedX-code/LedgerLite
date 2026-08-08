import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public routes: marketing page, auth pages, and the API-key-authenticated
// integration endpoint (which does its OWN auth in the route handler via
// getUserByApiKey — it must stay off Clerk's session-based gate).
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/v1(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
