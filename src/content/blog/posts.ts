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
const modules = import.meta.glob("./posts/*.md", {
    eager: true,
    query: "?raw",
});

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
});

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
