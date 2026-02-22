import { createRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, ArrowRight, Code } from "lucide-react";
import { PROJECTS, PORTFOLIO_DATA, SKILLS } from "../constants";
import SplashCursor from "../components/SplashCursor";
import LogoLoop from "../components/LogoLoop";
import { getBlogPosts } from "../content/blog/posts";
import { rootRoute } from "./__root";

export const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: HomeComponent,
});

export const Route = indexRoute;

function HomeComponent() {
    const [introSectionEl, setIntroSectionEl] = useState<HTMLElement | null>(
        null,
    );
    const digitalRef = useRef<HTMLSpanElement>(null);
    const architectRef = useRef<HTMLSpanElement>(null);
    const boundaryRef = useRef<HTMLDivElement>(null);

    // Ref-based parallax: direct DOM transform, no React re-render
    useEffect(() => {
        let rafId: number | null = null;

        const handleScroll = () => {
            if (rafId !== null) return;
            rafId = requestAnimationFrame(() => {
                const y = window.scrollY;
                if (digitalRef.current) {
                    digitalRef.current.style.transform = `translateX(${-y * 0.5}px)`;
                }
                if (architectRef.current) {
                    architectRef.current.style.transform = `translateX(${y * 0.5}px)`;
                }
                rafId = null;
            });
        };
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", handleScroll);
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, []);

    // Set boundary element after mount to ensure correct dimensions
    useEffect(() => {
        if (boundaryRef.current) {
            setIntroSectionEl(boundaryRef.current);
        }
    }, []);

    return (
        <>
            {/* Fluid Splash Cursor */}
            <SplashCursor boundaryElement={introSectionEl} />

            {/* Boundary wrapper - spans intro + skills to avoid parallax shift */}
            <div ref={boundaryRef} className="relative">
                {/* Intro Section - Parallax */}
                <section className="relative h-screen flex items-center justify-center overflow-hidden">
                    <div className="relative z-10 max-w-4xl px-6 text-center">
                        <h1 className="text-6xl md:text-9xl font-black tracking-tighter mb-6 leading-tight">
                            <span
                                ref={digitalRef}
                                className="block will-change-transform"
                            >
                                DIGITAL
                            </span>
                            <span
                                ref={architectRef}
                                className="block text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-fuchsia-500 will-change-transform"
                            >
                                ARCHITECT
                            </span>
                        </h1>
                        <p className="text-xl md:text-2xl text-zinc-400 max-w-2xl mx-auto mb-12 font-light">
                            {PORTFOLIO_DATA.bio}
                        </p>
                        <div className="flex justify-center gap-6">
                            {["React", "Typescript", "AI"].map((tech) => (
                                <span
                                    key={tech}
                                    className="px-4 py-1 border border-zinc-800 rounded-full text-xs font-mono text-zinc-500 uppercase"
                                >
                                    {tech}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 animate-bounce">
                        <ArrowRight className="rotate-90 text-zinc-600" />
                    </div>
                </section>

                {/* Tech Skills Loop */}
                <div className="w-full bg-zinc-900 border-y border-zinc-800 py-8 overflow-hidden">
                    <div className="px-6">
                        <h2 className="text-3xl font-bold text-center mb-8 text-zinc-400">
                            SKILLS & TECHNOLOGIES
                        </h2>
                        <LogoLoop
                            logos={SKILLS.map((skill) => ({
                                node: (
                                    <span className="flex items-center gap-3 text-zinc-300 font-mono text-sm group/skill">
                                        <span
                                            className={`w-6 h-6 [&>svg]:w-full [&>svg]:h-full [&>svg]:fill-current text-zinc-300 transition-colors bg-white/5 rounded p-0.5`}
                                            dangerouslySetInnerHTML={{
                                                __html: skill.svg,
                                            }}
                                            style={{ color: skill.color }}
                                        />
                                        <span
                                            className={`text-zinc-200 font-medium`}
                                        >
                                            {skill.name}
                                        </span>
                                    </span>
                                ),
                                title: skill.name,
                            }))}
                            speed={60}
                            direction="left"
                            logoHeight={40}
                            gap={48}
                            pauseOnHover={true}
                            hoverSpeed={0}
                            scaleOnHover={true}
                            className="py-4"
                            width="100vw"
                            ariaLabel="Skills and technologies carousel"
                        />
                    </div>
                </div>
            </div>

            {/* Projects Section - Horizontal-ish Layout */}
            <section className="py-32 px-6">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-baseline justify-between mb-16">
                        <h2 className="text-4xl md:text-6xl font-bold tracking-tight">
                            SELECTED <br /> WORKS
                        </h2>
                        <span className="text-zinc-500 font-mono">
                            01 // PROJECTS
                        </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {PROJECTS.map((project) => (
                            <a
                                key={project.title}
                                href={project.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group relative bg-zinc-900 border border-zinc-800 overflow-hidden hover:border-zinc-700 transition-colors block"
                            >
                                <div className="relative  bg-zinc-800 overflow-hidden grayscale group-hover:grayscale-0 transition-all duration-500">
                                    <img
                                        src={project.image}
                                        alt={project.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                                    />
                                    <div className="absolute inset-0 bg-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <div className="p-4">
                                    <div className="flex justify-between items-start mb-2 gap-2">
                                        <h3 className="text-xl md:text-2xl font-bold text-white group-hover:text-cyan-500 transition-colors">
                                            {project.title}
                                        </h3>
                                        <ExternalLink
                                            size={20}
                                            className="text-zinc-600 group-hover:text-white transition-colors shrink-0"
                                        />
                                    </div>
                                    <p className="text-zinc-400 text-sm mb-4">
                                        {project.description}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {project.tech.map((t) => (
                                            <span
                                                key={t}
                                                className="text-xs font-mono text-zinc-500 bg-zinc-950 px-2 py-1 rounded"
                                            >
                                                {t}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </a>
                        ))}
                    </div>
                </div>
            </section>

            {/* Blog Section - Terminal Style */}
            <section className="py-32 bg-zinc-900/30 border-y border-zinc-800">
                <div className="max-w-4xl mx-auto px-6">
                    <div className="flex items-baseline justify-between mb-16">
                        <h2 className="text-4xl font-bold flex items-center gap-4">
                            <Code className="text-fuchsia-500" />
                            THOUGHT LOGS
                        </h2>
                        <span className="text-zinc-500 font-mono">
                            02 // BLOG
                        </span>
                    </div>

                    <div className="space-y-4">
                        {getBlogPosts()
                            .slice(0, 3)
                            .map((post) => (
                                <Link
                                    key={post.id}
                                    to="/blog/$postId"
                                    params={{ postId: post.id }}
                                    className="group flex flex-col md:flex-row md:items-center justify-between p-6 border-b border-zinc-800 hover:border-fuchsia-500 hover:bg-zinc-900 transition-all interactive cursor-none"
                                >
                                    <div className="mb-2 md:mb-0">
                                        <div className="text-xs font-mono text-fuchsia-500 mb-1">
                                            {post.date}
                                        </div>
                                        <h3 className="text-xl font-bold group-hover:translate-x-2 transition-transform duration-300">
                                            {post.title}
                                        </h3>
                                    </div>
                                    <div className="flex items-center gap-8 text-zinc-500 group-hover:text-zinc-300">
                                        <span className="text-sm font-mono hidden md:block">
                                            {post.readTime}
                                        </span>
                                        <ArrowRight
                                            size={18}
                                            className="opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0 transition-all"
                                        />
                                    </div>
                                </Link>
                            ))}
                    </div>

                    <div className="mt-8 text-center">
                        <Link
                            to="/blog"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors whitespace-nowrap"
                        >
                            VIEW ALL POSTS
                            <ArrowRight
                                size={16}
                                className="group-hover:translate-x-1 transition-transform"
                            />
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer CTA */}
            <section className="py-32 px-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
                <div className="max-w-7xl mx-auto relative z-10 text-center">
                    <h2 className="text-6xl md:text-8xl font-black tracking-tighter mb-8 hover:text-cyan-500 transition-colors cursor-none interactive">
                        LET'S <br /> TALK
                    </h2>
                    <p className="text-zinc-400 text-xl max-w-2xl mx-auto">
                        Have a project in mind? Let's create something amazing
                        together.
                    </p>
                </div>
            </section>
        </>
    );
}
