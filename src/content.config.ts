import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const articles = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/data/articles" }),
  schema: z.object({
    title: z.string(),
    dek: z.string(),
    pubDate: z.date(),
    tags: z.array(z.string()).default([]),
    sourceName: z.string(),
    sourceUrl: z.string().url(),
    stance: z.enum(["news", "commentary"]).default("commentary"),
  }),
});

export const collections = { articles };
