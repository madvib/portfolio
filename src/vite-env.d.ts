/// <reference types="vite/client" />

declare module "front-matter" {
    interface FrontMatterResult<T> {
        attributes: T;
        body: string;
        bodyBegin: number;
        frontmatter: string;
    }
    function frontMatter<T = any>(content: string): FrontMatterResult<T>;
    export default frontMatter;
}
