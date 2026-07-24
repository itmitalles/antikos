// Fetches trending headlines from real RSS feeds, picks one not yet covered,
// and asks Claude to write a sourced, clearly-labeled commentary article
// about it. Writes a draft markdown file and opens a PR for human review —
// nothing here publishes directly.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { XMLParser } from "fast-xml-parser";

const ARTICLES_DIR = new URL("../src/data/articles/", import.meta.url).pathname;

const FEEDS = [
  { name: "Google News – Top (DE)", url: "https://news.google.com/rss?hl=de&gl=DE&ceid=DE:de" },
  {
    name: "Google News – Promis & Klatsch",
    url: "https://news.google.com/rss/search?q=Promi+OR+Star+OR+Skandal&hl=de&gl=DE&ceid=DE:de",
  },
  {
    name: "Google News – Politik",
    url: "https://news.google.com/rss/search?q=Politik&hl=de&gl=DE&ceid=DE:de",
  },
];

const SYSTEM_PROMPT = `Du bist Redakteur:in einer deutschsprachigen Meinungs-/Kommentarseite, die reale Tagesschlagzeilen reißerisch aufbereitet.

Harte Regeln, ohne Ausnahme:
- Du bekommst NUR Titel + Kurzbeschreibung + Link einer echten Nachrichtenmeldung. Das ist deine einzige Faktenquelle.
- Erfinde NIEMALS Zitate, Aussagen, Handlungen oder Details, die nicht in der Quelle stehen. Wenn die Quelle wenig hergibt, schreibe entsprechend wenig – nicht dazuerfinden.
- Persönliche/private Details über nicht-öffentliche Personen (z.B. Familienangehörige, Partner:innen ohne eigene Öffentlichkeitsrolle) NICHT ausschmücken oder spekulieren.
- Meinung/Einordnung muss klar als solche erkennbar sein (z.B. "Kommentar:", "Einordnung:"), nicht als Fakt getarnt.
- Bei politischen Themen: im Zweifel eine progressive/linke redaktionelle Haltung, aber sachlich argumentiert, keine Falschbehauptungen.
- Ton: reißerisch, zugespitzt, clickbait-artig in der Überschrift erlaubt und erwünscht – aber der Artikeltext selbst muss faktisch beim bleiben, was die Quelle hergibt.
- Sprache: Deutsch.

Antworte ausschließlich über das vorgegebene JSON-Schema.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "Reißerische, clickbait-artige Überschrift, max ca. 90 Zeichen." },
    dek: { type: "string", description: "Ein Satz Subheadline/Teaser, max ca. 160 Zeichen." },
    body_markdown: {
      type: "string",
      description:
        "Artikeltext in Markdown, 150-350 Wörter. Fakten nur aus der Quelle. Kommentar/Einordnung klar gekennzeichnet.",
    },
    tags: { type: "array", items: { type: "string" }, description: "2-5 kurze Schlagworte, lowercase, ohne '#'." },
    stance: { type: "string", enum: ["news", "commentary"] },
  },
  required: ["headline", "dek", "body_markdown", "tags", "stance"],
  additionalProperties: false,
};

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function alreadyCovered(sourceUrl) {
  let files;
  try {
    files = readdirSync(ARTICLES_DIR);
  } catch {
    return false;
  }
  return files.some((f) => {
    if (!f.endsWith(".md")) return false;
    const content = readFileSync(join(ARTICLES_DIR, f), "utf8");
    return content.includes(sourceUrl);
  });
}

async function fetchFeedItems(feed) {
  const res = await fetch(feed.url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; wutz.io-bot/1.0)" } });
  if (!res.ok) {
    console.warn(`WARN  feed fetch failed (${res.status}): ${feed.name}`);
    return [];
  }
  const xml = await res.text();
  const parsed = new XMLParser().parse(xml);
  const items = parsed?.rss?.channel?.item;
  if (!items) return [];
  const list = Array.isArray(items) ? items : [items];
  return list.map((item) => ({
    title: String(item.title ?? "").trim(),
    description: String(item.description ?? "").replace(/<[^>]+>/g, "").trim(),
    link: String(item.link ?? "").trim(),
    source: feed.name,
    pubDate: item.pubDate ?? null,
  }));
}

async function pickCandidate() {
  for (const feed of FEEDS) {
    const items = await fetchFeedItems(feed);
    for (const item of items) {
      if (!item.link || !item.title) continue;
      if (alreadyCovered(item.link)) continue;
      return item;
    }
  }
  return null;
}

async function generateArticle(candidate) {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          `Quelle: ${candidate.source}`,
          `Titel: ${candidate.title}`,
          `Kurzbeschreibung: ${candidate.description || "(keine)"}`,
          `Link: ${candidate.link}`,
        ].join("\n"),
      },
    ],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("Model declined the request (refusal).");
  }
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("No text content in model response.");
  return JSON.parse(text);
}

function writeArticleFile(candidate, article) {
  mkdirSync(ARTICLES_DIR, { recursive: true });
  const date = new Date();
  const slug = `${date.toISOString().slice(0, 10)}-${slugify(article.headline)}`;
  const frontmatter = [
    "---",
    `title: ${JSON.stringify(article.headline)}`,
    `dek: ${JSON.stringify(article.dek)}`,
    `pubDate: ${date.toISOString()}`,
    `tags: ${JSON.stringify(article.tags)}`,
    `sourceName: ${JSON.stringify(candidate.source)}`,
    `sourceUrl: ${JSON.stringify(candidate.link)}`,
    `stance: ${JSON.stringify(article.stance)}`,
    "---",
    "",
    article.body_markdown,
    "",
  ].join("\n");
  const path = join(ARTICLES_DIR, `${slug}.md`);
  writeFileSync(path, frontmatter, "utf8");
  return { path, slug };
}

function openPullRequest(slug, articleTitle) {
  const branch = `article/${slug}`;
  const git = (...args) => execFileSync("git", args, { stdio: "inherit" });
  git("checkout", "-b", branch);
  git("add", "-A");
  git("-c", "user.name=wutz.io-bot", "-c", "user.email=bot@wutz.io", "commit", "-m", `Entwurf: ${articleTitle}`);
  git("push", "-u", "origin", branch);
  const prUrl = execFileSync(
    "gh",
    ["pr", "create", "--title", `Entwurf: ${articleTitle}`, "--body", "Automatisch generierter Artikel-Entwurf. Review vor Merge.", "--base", "main", "--head", branch],
    { encoding: "utf8" }
  ).trim();
  return prUrl;
}

async function notifyTelegram(prUrl, articleTitle) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log("No TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID set — skipping notification.");
    return;
  }
  const text = `Neuer Artikel-Entwurf bereit:\n${articleTitle}\n${prUrl}`;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) console.warn(`WARN  Telegram notify failed: ${res.status} ${await res.text()}`);
}

async function main() {
  const candidate = await pickCandidate();
  if (!candidate) {
    console.log("No new, uncovered headline found across configured feeds. Nothing to do.");
    return;
  }
  console.log(`Candidate: ${candidate.title} (${candidate.link})`);

  const article = await generateArticle(candidate);
  const { slug } = writeArticleFile(candidate, article);
  console.log(`Wrote src/data/articles/${slug}.md`);

  const prUrl = openPullRequest(slug, article.headline);
  console.log(`Opened PR: ${prUrl}`);

  await notifyTelegram(prUrl, article.headline);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
