import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";

export function BlogLink() {
    return (
        <Link
            to="/blog"
            className="group flex items-center gap-2 px-4 py-2 border border-zinc-700 rounded-full hover:bg-white hover:text-black transition-all interactive"
        >
            <BookOpen
                size={16}
                className="group-hover:scale-110 transition-transform"
            />
            <span className="text-xs font-mono font-bold">
                BLOG
            </span>
        </Link>
    );
}