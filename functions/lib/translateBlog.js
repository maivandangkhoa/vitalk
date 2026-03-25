"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateBlogPost = void 0;
const https_1 = require("firebase-functions/v2/https");
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
/**
 * Translates a blog post from English to Vietnamese, Korean, and Japanese
 * using Claude API. Admin-only function.
 */
exports.translateBlogPost = (0, https_1.onCall)({
    secrets: ["ANTHROPIC_API_KEY"],
    timeoutSeconds: 120,
    memory: "512MiB",
}, async (request) => {
    // Verify admin
    if (!request.auth?.token?.role || request.auth.token.role !== "admin") {
        throw new https_1.HttpsError("permission-denied", "Admin only");
    }
    const { title, excerpt, content } = request.data;
    if (!title || !content) {
        throw new https_1.HttpsError("invalid-argument", "title and content are required");
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new https_1.HttpsError("failed-precondition", "ANTHROPIC_API_KEY not configured");
    }
    const client = new sdk_1.default({ apiKey });
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
            .filter((block) => block.type === "text")
            .map((block) => block.text)
            .join("");
        // Parse the JSON response
        const translations = JSON.parse(responseText);
        return {
            title: { en: title, ...translations.title },
            excerpt: { en: excerpt || "", ...translations.excerpt },
            content: { en: content, ...translations.content },
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Translation failed";
        throw new https_1.HttpsError("internal", message);
    }
});
//# sourceMappingURL=translateBlog.js.map