import fm from "front-matter";

interface BlogPostAttributes {
    id: string;
    title: string;
    date: string;
    excerpt: string;
    readTime: string;
    tags?: string[];
    series?: string;
    seriesPart?: number;
}

interface BlogPost {
    id: string;
    title: string;
    date: string;
    excerpt: string;
    readTime: string;
    content: string;
    tags?: string[];
    series?: string;
    seriesPart?: number;
}

interface BlogPostListItem {
    id: string;
    title: string;
    date: string;
    excerpt: string;
    readTime: string;
    tags?: string[];
    series?: string;
    seriesPart?: number;
}

// Helper to convert full post to list item
const toListItem = (post: BlogPost): BlogPostListItem => ({
    id: post.id,
    title: post.title,
    date: post.date,
    excerpt: post.excerpt,
    readTime: post.readTime,
    tags: post.tags,
    series: post.series,
    seriesPart: post.seriesPart,
});

// Load all markdown files in ./posts/
const publishedModules = import.meta.glob("./posts/*.md", {
    eager: true,
    query: "?raw",
});

// Load drafts (only processed in DEV, but glob needs to be static)
const draftModules = import.meta.glob("./drafts/*.md", {
    eager: true,
    query: "?raw",
});

let modules = { ...publishedModules };

// In DEV mode, include drafts
if (import.meta.env.DEV) {
    modules = { ...modules, ...draftModules };
}

const blogPosts: BlogPost[] = Object.values(modules).map((module: any) => {
    const { attributes, body } = fm<BlogPostAttributes>(module.default);
    return {
        id: attributes.id,
        title: attributes.title,
        date: attributes.date,
        excerpt: attributes.excerpt,
        readTime: attributes.readTime,
        content: body,
        tags: attributes.tags || [],
        series: attributes.series,
        seriesPart: attributes.seriesPart,
    };
}).filter((post) => post.title && post.date).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

// Build series index for navigation
const seriesIndex = new Map<string, BlogPost[]>();
for (const post of blogPosts) {
    if (post.series) {
        const posts = seriesIndex.get(post.series) || [];
        if (post.seriesPart !== undefined) {
            posts.push(post);
        }
        seriesIndex.set(post.series, posts);
    }
}
// Sort each series by part number
for (const [series, posts] of seriesIndex) {
    seriesIndex.set(series, posts.sort((a, b) => (a.seriesPart || 0) - (b.seriesPart || 0)));
}

export function getBlogPosts(): BlogPostListItem[] {
    return blogPosts.map(toListItem);
}

export function getBlogPost(id: string) {
    return blogPosts.find((post) => post.id === id);
}

export function getSeriesPosts(series: string): BlogPostListItem[] {
    return seriesIndex.get(series)?.map(toListItem) ?? [];
}

export function getAdjacentPosts(id: string): { prev: BlogPostListItem | null; next: BlogPostListItem | null } {
    const post = blogPosts.find((p) => p.id === id);
    if (!post) return { prev: null, next: null };
    
    // If post is part of a series, navigate within series
    if (post.series && post.seriesPart !== undefined) {
        const seriesPosts = seriesIndex.get(post.series) ?? [];
        const currentIndex = seriesPosts.findIndex((p) => p.id === id);
        
        return {
            prev: currentIndex > 0 ? toListItem(seriesPosts[currentIndex - 1]) : null,
            next: currentIndex < seriesPosts.length - 1 ? toListItem(seriesPosts[currentIndex + 1]) : null,
        };
    }
    
    // Otherwise, navigate by date
    const currentIndex = blogPosts.findIndex((p) => p.id === id);
    return {
        prev: currentIndex < blogPosts.length - 1 ? toListItem(blogPosts[currentIndex + 1]) : null,
        next: currentIndex > 0 ? toListItem(blogPosts[currentIndex - 1]) : null,
    };
}

export function getAllTags(): string[] {
    const tags = new Set<string>();
    for (const post of blogPosts) {
        post.tags?.forEach((tag) => tags.add(tag));
    }
    return Array.from(tags).sort();
}

export function getPostsByTag(tag: string): BlogPostListItem[] {
    return blogPosts
        .filter((post) => post.tags?.includes(tag))
        .map(toListItem);
}
