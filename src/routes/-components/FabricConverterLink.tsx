import { Link } from "@tanstack/react-router";
import { Layers } from "lucide-react";

export function FabricConverterLink() {
    return (
        <Link
            to="/fabric-converter"
            className="group flex items-center gap-2 px-4 py-2 border border-zinc-700 rounded-full hover:bg-white hover:text-black transition-all interactive"
        >
            <Layers
                size={16}
                className="group-hover:scale-110 transition-transform"
            />
            <span className="text-xs font-mono font-bold hidden sm:inline">
                CANVAS → SVG
            </span>
        </Link>
    );
}
