import { createRoute, Link } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { getBlogPosts } from '../content/blog/posts';
import { ArrowLeft, Calendar, Clock, ArrowRight } from "lucide-react";

export const blogIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/blog',
  component: BlogIndexPage,
});

export const Route = blogIndexRoute;

function BlogIndexPage() {
  const posts = getBlogPosts();

  return (
    <div className="min-h-screen pt-24 px-4 pb-16">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-cyan-400 transition-colors group mb-8"
          >
            <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
            <span className="font-mono text-sm">BACK TO HOME</span>
          </Link>
          
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-white mb-4">
            THOUGHT<span className="text-cyan-400">LOGS</span>_
          </h1>
          <p className="text-zinc-400 text-xl">
            Exploring code, design, and the future of the web.
          </p>
        </div>

        {/* Blog Posts List */}
        <div className="space-y-6">
          {posts.map((post, index) => (
            <Link
              key={post.id}
              to="/blog/$postId"
              params={{ postId: post.id }}
              className="group block bg-zinc-900/50 border border-zinc-800 p-6 rounded-xl hover:border-cyan-500/50 hover:bg-zinc-900 transition-all interactive"
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-4 text-zinc-500 text-sm mb-3">
                    <span className="flex items-center gap-1">
                      <Calendar size={14} />
                      {post.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      {post.readTime}
                    </span>
                    <span className="font-mono text-xs text-cyan-400">
                      #{String(index + 1).padStart(2, '0')}
                    </span>
                  </div>
                  
                  <h2 className="text-2xl font-bold text-white group-hover:text-cyan-400 transition-colors mb-2">
                    {post.title}
                  </h2>
                  
                  <p className="text-zinc-400">
                    {post.excerpt}
                  </p>
                </div>
                
                <ArrowRight 
                  size={24} 
                  className="text-zinc-600 group-hover:text-cyan-400 group-hover:translate-x-2 transition-all flex-shrink-0 mt-2 md:mt-0" 
                />
              </div>
            </Link>
          ))}
        </div>

        {/* Footer Note */}
        <div className="mt-16 text-center text-zinc-600">
          <p className="font-mono text-sm">
            More thoughts coming soon...
          </p>
        </div>
      </div>
    </div>
  );
}
