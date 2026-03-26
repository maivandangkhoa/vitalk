"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateBlogPost = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const LANG_NAMES = {
    en: "English",
    vi: "Vietnamese",
    ko: "Korean",
    ja: "Japanese",
};
/**
 * Translates a blog post from English to Vietnamese, Korean, and Japanese
 * using Claude API. Admin-only function.
 */
exports.translateBlogPost = (0, https_1.onCall)({
    secrets: ["ANTHROPIC_API_KEY"],
    timeoutSeconds: 120,
    memory: "512MiB",
    cors: true,
    invoker: "public",
}, async (request) => {
    // Verify admin via Firestore role
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be logged in");
    }
    const userDoc = await admin.firestore().doc(`users/${request.auth.uid}`).get();
    if (userDoc.data()?.role !== "admin") {
        throw new https_1.HttpsError("permission-denied", "Admin only");
    }
    const { title, excerpt, content, sourceLang = "en" } = request.data;
    if (!title || !content) {
        throw new https_1.HttpsError("invalid-argument", "title and content are required");
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new https_1.HttpsError("failed-precondition", "ANTHROPIC_API_KEY not configured");
    }
    const targetLangs = ["en", "vi", "ko", "ja"].filter((l) => l !== sourceLang);
    const targetNames = targetLangs.map((l) => `${LANG_NAMES[l]} (${l})`).join(", ");
    const jsonFields = targetLangs.map((l) => `"${l}": "..."`).join(", ");
    const client = new sdk_1.default({ apiKey });
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
            .filter((block) => block.type === "text")
            .map((block) => block.text)
            .join("");
        // Parse the JSON response
        const translations = JSON.parse(responseText);
        return {
            title: { en: "", vi: "", ko: "", ja: "", [sourceLang]: title, ...translations.title },
            excerpt: { en: "", vi: "", ko: "", ja: "", [sourceLang]: excerpt || "", ...translations.excerpt },
            content: { en: "", vi: "", ko: "", ja: "", [sourceLang]: content, ...translations.content },
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Translation failed";
        throw new https_1.HttpsError("internal", message);
    }
});
//# sourceMappingURL=translateBlog.js.map