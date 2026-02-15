import { createRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Calendar, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { marked } from "marked";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import "highlight.js/styles/base16/gruvbox-dark-soft.css";
import { rootRoute } from "./__root";
import { getBlogPost } from "../content/blog/posts";

hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("javascript", javascript);

export const blogPostRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/blog/$postId",
    component: BlogPostPage,
});

export const Route = blogPostRoute;

function BlogPostPage() {
    const { postId } = blogPostRoute.useParams();
    const post = getBlogPost(postId);
    const [htmlContent, setHtmlContent] = useState<string>("");

    useEffect(() => {
        if (post) {
            const parseMarkdown = async () => {
                const html = await marked.parse(post.content);
                setHtmlContent(html);
  
            };
            parseMarkdown();
        }
    }, [post]);
    useEffect(() => {
        hljs.highlightAll();
    }, [htmlContent]);

    if (!post) {
        return (
            <div className="min-h-screen pt-24 px-4 pb-16 flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-4xl font-black text-white mb-4">404</h1>
                    <p className="text-zinc-400 mb-6">Post not found</p>
                    <Link to="/blog" className="text-cyan-400 hover:underline">
                        Back to blog
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen pt-24 px-4 pb-16">
            <div className="max-w-3xl mx-auto">
                {/* Navigation */}
                <div className="mb-8">
                    <Link
                        to="/blog"
                        className="inline-flex items-center gap-2 text-zinc-400 hover:text-cyan-400 transition-colors group"
                    >
                        <ArrowLeft
                            size={20}
                            className="group-hover:-translate-x-1 transition-transform"
                        />
                        <span className="font-mono text-sm">ALL POSTS</span>
                    </Link>
                </div>

                {/* Post Header */}
                <header className="mb-12 border-b border-zinc-800 pb-8">
                    <div className="flex items-center gap-4 text-zinc-500 text-sm mb-4">
                        <span className="flex items-center gap-1">
                            <Calendar size={16} />
                            {post.date}
                        </span>
                        <span className="flex items-center gap-1">
                            <Clock size={16} />
                            {post.readTime}
                        </span>
                    </div>

                    <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white mb-4">
                        {post.title}
                    </h1>

                    <p className="text-xl text-zinc-400">{post.excerpt}</p>
                </header>

                {/* Post Content */}
                <article
                    className="prose prose-invert prose-zinc max-w-none
                                    prose-headings:font-black prose-headings:tracking-tight prose-headings:text-white
                                    prose-h1:text-4xl prose-h1:mb-8 prose-h1:mt-12
                                    prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:text-cyan-400
                                    prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
                                    prose-p:text-zinc-300 prose-p:leading-relaxed prose-p:my-6 prose-p:text-lg
                                    prose-a:text-cyan-400 prose-a:no-underline hover:prose-a:underline
                                    prose-strong:text-white prose-strong:font-bold
                                    prose-code:text-cyan-400 prose-code:bg-zinc-900 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
                                    prose-ul:my-6 prose-li:text-zinc-300 prose-li:my-2
                                    prose-blockquote:border-l-cyan-500 prose-blockquote:bg-zinc-900/50 prose-blockquote:py-2 prose-blockquote:px-6 prose-blockquote:rounded-r-lg prose-blockquote:text-zinc-400 prose-blockquote:not-italic"
                    dangerouslySetInnerHTML={{ __html: htmlContent }}
                />
                {/* Post Footer */}
                <footer className="mt-16 pt-8 border-t border-zinc-800">
                    <div className="flex items-center justify-between">
                        <Link
                            to="/blog"
                            className="text-zinc-400 hover:text-cyan-400 transition-colors"
                        >
                            ← Back to all posts
                        </Link>

                        <div className="flex gap-2">
                            <button className="px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-full text-zinc-400 hover:border-cyan-500 hover:text-cyan-400 transition-colors text-sm">
                                Share
                            </button>
                            <button className="px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-full text-zinc-400 hover:border-cyan-500 hover:text-cyan-400 transition-colors text-sm">
                                Copy Link
                            </button>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
}
