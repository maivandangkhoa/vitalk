import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import Anthropic from "@anthropic-ai/sdk";

interface TranslateRequest {
  title: string;
  excerpt: string;
  content: string;
  sourceLang?: string;
}

const LANG_NAMES: Record<string, string> = {
  en: "English",
  vi: "Vietnamese",
  ko: "Korean",
  ja: "Japanese",
};

interface TranslateResult {
  title: { en: string; vi: string; ko: string; ja: string };
  excerpt: { en: string; vi: string; ko: string; ja: string };
  content: { en: string; vi: string; ko: string; ja: string };
}

/**
 * Translates a blog post from English to Vietnamese, Korean, and Japanese
 * using Claude API. Admin-only function.
 */
export const translateBlogPost = onCall(
  {
    secrets: ["ANTHROPIC_API_KEY"],
    timeoutSeconds: 120,
    memory: "512MiB",
    cors: true,
    invoker: "public",
  },
  async (request): Promise<TranslateResult> => {
    // Verify admin via Firestore role
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }
    const userDoc = await admin.firestore().doc(`users/${request.auth.uid}`).get();
    if (userDoc.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Admin only");
    }

    const { title, excerpt, content, sourceLang = "en" } = request.data as TranslateRequest;
    if (!title || !content) {
      throw new HttpsError("invalid-argument", "title and content are required");
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "ANTHROPIC_API_KEY not configured");
    }

    const targetLangs = ["en", "vi", "ko", "ja"].filter((l) => l !== sourceLang);
    const targetNames = targetLangs.map((l) => `${LANG_NAMES[l]} (${l})`).join(", ");
    const jsonFields = targetLangs.map((l) => `"${l}": "..."`).join(", ");

    const client = new Anthropic({ apiKey });

    const prompt = `You are a professional translator for a Vietnamese language learning blog.
Translate the following blog post from ${LANG_NAMES[sourceLang] || sourceLang} into ${targetNames}.

The blog is written by a Vietnamese teacher based in Seoul who teaches Vietnamese to international students.
Keep the translations natural and appropriate for language learners. Preserve all HTML formatting tags.

Return ONLY a valid JSON object with this exact structure (no markdown, no code blocks):
{
  "title": { ${jsonFields} },
  "excerpt": { ${jsonFields} },
  "content": { ${jsonFields} }
}

---
TITLE: ${title}

EXCERPT: ${excerpt || ""}

CONTENT:
${content}`;

    try {
      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      });

      const responseText = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      // Parse the JSON response
      const translations = JSON.parse(responseText) as {
        title: Record<string, string>;
        excerpt: Record<string, string>;
        content: Record<string, string>;
      };

      return {
        title: { en: "", vi: "", ko: "", ja: "", [sourceLang]: title, ...translations.title },
        excerpt: { en: "", vi: "", ko: "", ja: "", [sourceLang]: excerpt || "", ...translations.excerpt },
        content: { en: "", vi: "", ko: "", ja: "", [sourceLang]: content, ...translations.content },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Translation failed";
      throw new HttpsError("internal", message);
    }
  }
);
