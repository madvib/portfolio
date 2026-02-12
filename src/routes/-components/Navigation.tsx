import { Link } from "@tanstack/react-router";
import { BlogLink } from "./BlogLink";
import { MinigameLink } from "./MinigameLink";

export function Navigation() {
    return (
        <nav className="fixed top-0 left-0 w-full z-30 px-6 py-6 flex justify-between items-center mix-blend-exclusion">
            <Link
                to="/"
                className="text-xl font-bold tracking-tighter text-white hover:text-cyan-400 transition-colors"
            >
                MICAH<span className="text-cyan-400">COTTON</span>_
            </Link>
            <div className="flex items-center gap-4">
                <BlogLink />
                <MinigameLink />
            </div>
        </nav>
    );
}