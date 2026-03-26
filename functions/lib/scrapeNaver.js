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
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeNaverBlog = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const cheerio = __importStar(require("cheerio"));
/**
 * Parse Naver blog URL to extract blogId and logNo.
 * Supports formats:
 *   - https://blog.naver.com/{blogId}/{logNo}
 *   - https://m.blog.naver.com/{blogId}/{logNo}
 *   - https://blog.naver.com/PostView.naver?blogId=xxx&logNo=xxx
 */
function parseNaverUrl(url) {
    try {
        const u = new URL(url);
        const host = u.hostname;
        if (!host.includes("blog.naver.com"))
            return null;
        // Query param format
        const blogIdParam = u.searchParams.get("blogId");
        const logNoParam = u.searchParams.get("logNo");
        if (blogIdParam && logNoParam) {
            return { blogId: blogIdParam, logNo: logNoParam };
        }
        // Path format: /blogId/logNo
        const parts = u.pathname.split("/").filter(Boolean);
        // Filter out "PostView.naver" etc.
        const cleanParts = parts.filter((p) => !p.includes(".naver") && !p.includes(".nhn"));
        if (cleanParts.length >= 2) {
            return { blogId: cleanParts[0], logNo: cleanParts[1] };
        }
        return null;
    }
    catch {
        return null;
    }
}
/**
 * Scrapes a Naver blog post and returns title + HTML content.
 * Uses the mobile version for easier parsing (no iframe).
 */
exports.scrapeNaverBlog = (0, https_1.onCall)({
    timeoutSeconds: 30,
    memory: "256MiB",
    cors: true,
    invoker: "public",
}, async (request) => {
    // Admin only
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be logged in");
    }
    const userDoc = await admin
        .firestore()
        .doc(`users/${request.auth.uid}`)
        .get();
    if (userDoc.data()?.role !== "admin") {
        throw new https_1.HttpsError("permission-denied", "Admin only");
    }
    const { url } = request.data;
    if (!url) {
        throw new https_1.HttpsError("invalid-argument", "URL is required");
    }
    const parsed = parseNaverUrl(url);
    if (!parsed) {
        throw new https_1.HttpsError("invalid-argument", "Invalid Naver blog URL. Expected format: https://blog.naver.com/blogId/postId");
    }
    const { blogId, logNo } = parsed;
    try {
        // Fetch mobile version (renders content directly, no iframe)
        const mobileUrl = `https://m.blog.naver.com/${blogId}/${logNo}`;
        const response = await fetch(mobileUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
                "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            },
        });
        if (!response.ok) {
            throw new https_1.HttpsError("not-found", `Failed to fetch blog post (HTTP ${response.status})`);
        }
        const html = await response.text();
        const $ = cheerio.load(html);
        // Extract title
        let title = "";
        // SmartEditor 3 (SE3)
        title = $(".se-title-text").first().text().trim();
        if (!title) {
            title = $(".tit_h3").first().text().trim();
        }
        if (!title) {
            title = $("h3.se_textarea").first().text().trim();
        }
        if (!title) {
            title = $("meta[property='og:title']").attr("content")?.trim() || "";
        }
        // Strip " : 네이버 블로그" suffix
        title = title.replace(/\s*:\s*네이버\s*블로그\s*$/, "");
        // Extract cover image
        let coverImageUrl = "";
        coverImageUrl =
            $("meta[property='og:image']").attr("content")?.trim() || "";
        // Extract content - try multiple selectors for different Naver editor versions
        let contentHtml = "";
        // SmartEditor ONE (newest)
        const seMainContainer = $(".se-main-container");
        if (seMainContainer.length) {
            // Remove script tags and unnecessary elements
            seMainContainer.find("script, style, .se-oglink-container").remove();
            // Process images - convert to simple img tags
            seMainContainer.find(".se-image-resource").each((_, el) => {
                const src = $(el).attr("data-src") || $(el).attr("src");
                if (src) {
                    $(el)
                        .parent()
                        .replaceWith(`<p><img src="${src}" alt="" /></p>`);
                }
            });
            // Process SE3 text blocks
            const blocks = [];
            seMainContainer.find(".se-module").each((_, module) => {
                const $mod = $(module);
                if ($mod.hasClass("se-module-text")) {
                    // Text block
                    const textContent = $mod.find(".se-text-paragraph").html();
                    if (textContent && textContent.trim()) {
                        blocks.push(`<p>${textContent.trim()}</p>`);
                    }
                }
                else if ($mod.hasClass("se-module-image")) {
                    // Image block
                    const img = $mod.find("img.se-image-resource");
                    const src = img.attr("data-src") || img.attr("src");
                    if (src) {
                        blocks.push(`<p><img src="${src}" alt="" /></p>`);
                    }
                }
                else if ($mod.hasClass("se-module-oglink")) {
                    // Skip link previews
                }
                else if ($mod.hasClass("se-module-horizontalLine") ||
                    $mod.hasClass("se-module-hr")) {
                    blocks.push("<hr />");
                }
            });
            contentHtml = blocks.join("\n");
        }
        // Fallback: try postViewArea (older editor)
        if (!contentHtml) {
            const postViewArea = $("#postViewArea, #viewTypeSelector, .post-view");
            if (postViewArea.length) {
                postViewArea.find("script, style").remove();
                contentHtml = postViewArea.html()?.trim() || "";
            }
        }
        // Final fallback: og:description
        if (!contentHtml) {
            const desc = $("meta[property='og:description']").attr("content")?.trim() || "";
            if (desc) {
                contentHtml = `<p>${desc}</p>`;
            }
        }
        if (!title && !contentHtml) {
            throw new https_1.HttpsError("not-found", "Could not extract content from this Naver blog post. The post may be private or the format is not supported.");
        }
        return {
            title: title || "Untitled",
            content: contentHtml,
            coverImageUrl,
        };
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        console.error("Naver scrape error:", err);
        const message = err instanceof Error ? err.message : "Failed to scrape blog post";
        throw new https_1.HttpsError("internal", message);
    }
});
//# sourceMappingURL=scrapeNaver.js.map