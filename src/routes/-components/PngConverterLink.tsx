import { Link } from "@tanstack/react-router";
import { Wand2 } from "lucide-react";

export function PngConverterLink() {
    return (
        <Link
            to="/png-converter"
            className="group flex items-center gap-2 px-4 py-2 border border-zinc-700 rounded-full hover:bg-white hover:text-black transition-all interactive"
        >
            <Wand2
                size={16}
                className="group-hover:rotate-12 transition-transform"
            />
            <span className="text-xs font-mono font-bold hidden sm:inline">
                IMAGE → SVG
            </span>
        </Link>
    );
}
