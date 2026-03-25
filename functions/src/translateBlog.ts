import { onCall, HttpsError } from "firebase-functions/v2/https";
import Anthropic from "@anthropic-ai/sdk";

interface TranslateRequest {
  title: string;
  excerpt: string;
  content: string;
}

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
  },
  async (request): Promise<TranslateResult> => {
    // Verify admin
    if (!request.auth?.token?.role || request.auth.token.role !== "admin") {
      throw new HttpsError("permission-denied", "Admin only");
    }

    const { title, excerpt, content } = request.data as TranslateRequest;
    if (!title || !content) {
      throw new HttpsError("invalid-argument", "title and content are required");
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "ANTHROPIC_API_KEY not configured");
    }

    const client = new Anthropic({ apiKey });

    const prompt = `You are a professional translator for a Vietnamese language learning blog.
Translate the following blog post from English into 3 languages: Vietnamese (vi), Korean (ko), and Japanese (ja).

The blog is written by a Vietnamese teacher based in Seoul who teaches Vietnamese to international students.
Keep the translations natural and appropriate for language learners. Preserve all HTML formatting tags.

Return ONLY a valid JSON object with this exact structure (no markdown, no code blocks):
{
  "title": { "vi": "...", "ko": "...", "ja": "..." },
  "excerpt": { "vi": "...", "ko": "...", "ja": "..." },
  "content": { "vi": "...", "ko": "...", "ja": "..." }
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
        title: { vi: string; ko: string; ja: string };
        excerpt: { vi: string; ko: string; ja: string };
        content: { vi: string; ko: string; ja: string };
      };

      return {
        title: { en: title, ...translations.title },
        excerpt: { en: excerpt || "", ...translations.excerpt },
        content: { en: content, ...translations.content },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Translation failed";
      throw new HttpsError("internal", message);
    }
  }
);
