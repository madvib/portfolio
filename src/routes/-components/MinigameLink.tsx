import { Link } from "@tanstack/react-router";
import { Gamepad2 } from "lucide-react";

export function MinigameLink() {
    return (
        <Link
            to="/minigame"
            className="group flex items-center gap-2 px-4 py-2 border border-zinc-700 rounded-full hover:bg-white hover:text-black transition-all interactive"
        >
            <Gamepad2
                size={16}
                className="group-hover:animate-bounce"
            />
            <span className="text-xs font-mono font-bold">
                PLAY MINIGAME
            </span>
        </Link>
    );
}