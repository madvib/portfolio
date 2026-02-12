import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ScrollToTop } from "../components/ScrollToTop";
import { Navigation, Footer } from "./-components";

export const rootRoute = createRootRoute({
    component: RootComponent,
});

export const Route = rootRoute;

function RootComponent() {
    return (
        <div className="bg-zinc-950 min-h-screen text-zinc-100 selection:bg-cyan-500 selection:text-white overflow-x-hidden">
            <ScrollToTop />
            <Navigation />
            <Outlet />
            <Footer />
        </div>
    );
}
