import { Github, Linkedin, Mail } from "lucide-react";

export function Footer() {
    return (
        <footer className="py-16 px-6 border-t border-zinc-800">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="flex gap-6">
                    <a
                        href="https://github.com/madvib"
                        target="_blank"
                        rel="noreferrer"
                        className="p-3 bg-zinc-900 rounded-full hover:bg-white hover:text-black transition-all interactive"
                    >
                        <Github size={20} />
                    </a>
                    <a
                        href="https://linkedin.com/in/micah-cotton-9aab48128"
                        className="p-3 bg-zinc-900 rounded-full hover:bg-blue-600 hover:text-white transition-all interactive"
                    >
                        <Linkedin size={20} />
                    </a>
                    <a
                        href="mailto:micahcotton@duck.com"
                        className="p-3 bg-zinc-900 rounded-full hover:bg-blue-600 hover:text-white transition-all interactive"
                    >
                        <Mail size={20} />
                    </a>
                </div>

                <p className="text-zinc-600 text-sm">
                    © {new Date().getFullYear()} Neon Void. Built with React
                    & Tailwind.
                </p>
            </div>
        </footer>
    );
}