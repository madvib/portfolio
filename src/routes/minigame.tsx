import { createRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { rootRoute } from "./__root";
import { Minigame } from "../components/minigame";

export const minigameRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/minigame",
    component: MinigamePage,
});

export const Route = minigameRoute;

function MinigamePage() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen pt-24 px-4 pb-8">
            {/* Back button */}
            <div className="max-w-6xl mx-auto mb-6">
                <Link
                    to="/"
                    className="inline-flex items-center gap-2 text-zinc-400 hover:text-cyan-500 transition-colors group"
                >
                    <ArrowLeft
                        size={20}
                        className="group-hover:-translate-x-1 transition-transform"
                    />
                    <span className="font-mono text-sm">BACK TO HOME</span>
                </Link>
            </div>

            {/* Minigame Component */}
            <div className="max-w-6xl mx-auto">
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8">
                    <Minigame onClose={() => navigate({ to: "/" })} />
                </div>
            </div>
        </div>
    );
}
