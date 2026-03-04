import type { Project } from "../types";

export const PROJECTS: Project[] = [
    {
        id: "2",
        title: "GetShip",
        description: "Desktop SDLC for AI engineers",
        tech: ["Rust", "TypeScript", "React"],
        link: "https://getship.dev",
        image: "/getship.png",
    },
    {
        id: "1",
        title: "BeneFit",
        description: "AI native fitness application",
        tech: ["React", "Typescript", "Cloudflare Workers"],
        link: "https://staging.getbene.fit",
        image: "/BeneFit.png",
    },
];
