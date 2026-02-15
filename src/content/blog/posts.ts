import fm from "front-matter";

interface BlogPostAttributes {
    id: string;
    title: string;
    date: string;
    excerpt: string;
    readTime: string;
}

interface BlogPost {
    id: string;
    title: string;
    date: string;
    excerpt: string;
    readTime: string;
    content: string;
}

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
    };
}).filter((post) => post.title && post.date).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

export function getBlogPosts() {
    return blogPosts.map((post) => ({
        id: post.id,
        title: post.title,
        date: post.date,
        excerpt: post.excerpt,
        readTime: post.readTime,
    }));
}

export function getBlogPost(id: string) {
    return blogPosts.find((post) => post.id === id);
}
