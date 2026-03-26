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
 * Strategy 1: Fetch the desktop iframe content directly.
 * Naver blog desktop wraps content in an iframe - we fetch that iframe URL directly.
 */
async function fetchDesktopIframe(blogId, logNo) {
    const iframeUrl = `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}&directAccess=false`;
    const response = await fetch(iframeUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "ko-KR,ko;q=0.9",
            Referer: `https://blog.naver.com/${blogId}/${logNo}`,
        },
    });
    if (!response.ok)
        return null;
    const html = await response.text();
    const $ = cheerio.load(html);
    // Extract title
    let title = "";
    title = $(".se-title-text").first().text().trim();
    if (!title)
        title = $(".pcol1 .itemSubjectBoldfont").first().text().trim();
    if (!title)
        title = $(".se_title .se_textarea").first().text().trim();
    if (!title)
        title = $("meta[property='og:title']").attr("content")?.trim() || "";
    title = title.replace(/\s*:\s*네이버\s*블로그\s*$/, "");
    // Extract cover image
    const coverImageUrl = $("meta[property='og:image']").attr("content")?.trim() || "";
    // Try SmartEditor ONE (SE3) - newest editor
    let contentHtml = extractSE3Content($);
    // Try SmartEditor 2 / older formats
    if (!contentHtml) {
        contentHtml = extractOldEditorContent($);
    }
    if (!contentHtml)
        return null;
    return { title, content: contentHtml, coverImageUrl };
}
/**
 * Strategy 2: Parse __NEXT_DATA__ from mobile page (Next.js SSR).
 */
async function fetchMobileNextData(blogId, logNo) {
    const mobileUrl = `https://m.blog.naver.com/${blogId}/${logNo}`;
    const response = await fetch(mobileUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
            "Accept-Language": "ko-KR,ko;q=0.9",
        },
    });
    if (!response.ok)
        return null;
    const html = await response.text();
    const $ = cheerio.load(html);
    // Try __NEXT_DATA__ first (Next.js SSR)
    const nextDataScript = $("#__NEXT_DATA__").html();
    if (nextDataScript) {
        try {
            const nextData = JSON.parse(nextDataScript);
            // Navigate the Next.js data structure to find post content
            const postData = nextData?.props?.pageProps?.post ||
                nextData?.props?.pageProps?.result?.post ||
                nextData?.props?.pageProps;
            if (postData) {
                const title = postData.titleWithInspectMessage ||
                    postData.title ||
                    postData.postTitle ||
                    "";
                const contentHtml = postData.contentHtml ||
                    postData.content ||
                    postData.postContent ||
                    postData.body ||
                    "";
                const coverImageUrl = postData.thumbnailUrl ||
                    postData.representImage ||
                    postData.ogImageUrl ||
                    "";
                if (contentHtml) {
                    // Clean up the HTML content
                    const $content = cheerio.load(contentHtml);
                    $content("script, style").remove();
                    return {
                        title: cleanTitle(title),
                        content: $content.html() || contentHtml,
                        coverImageUrl,
                    };
                }
            }
        }
        catch {
            // JSON parse failed, continue to HTML parsing
        }
    }
    // Fallback: parse mobile HTML directly
    let title = $(".se-title-text").first().text().trim();
    if (!title)
        title = $("h3.se_textarea").first().text().trim();
    if (!title)
        title = $("meta[property='og:title']").attr("content")?.trim() || "";
    title = cleanTitle(title);
    const coverImageUrl = $("meta[property='og:image']").attr("content")?.trim() || "";
    let contentHtml = extractSE3Content($);
    if (!contentHtml)
        contentHtml = extractOldEditorContent($);
    if (!contentHtml)
        return null;
    return { title, content: contentHtml, coverImageUrl };
}
/**
 * Extract content from SmartEditor ONE (SE3) - the newest Naver editor.
 */
function extractSE3Content($) {
    const seMainContainer = $(".se-main-container");
    if (!seMainContainer.length)
        return "";
    seMainContainer.find("script, style, .se-oglink-container").remove();
    const blocks = [];
    seMainContainer.find(".se-module").each((_, module) => {
        const $mod = $(module);
        if ($mod.hasClass("se-module-text")) {
            // Text block - get all paragraphs
            $mod.find(".se-text-paragraph").each((_, p) => {
                const html = $(p).html();
                if (html && html.trim()) {
                    blocks.push(`<p>${html.trim()}</p>`);
                }
            });
        }
        else if ($mod.hasClass("se-module-image")) {
            const img = $mod.find("img.se-image-resource");
            const src = img.attr("data-src") || img.attr("src");
            if (src) {
                blocks.push(`<p><img src="${src}" alt="" /></p>`);
            }
        }
        else if ($mod.hasClass("se-module-sticker")) {
            // Sticker/emoji - skip or get image
            const img = $mod.find("img");
            const src = img.attr("data-src") || img.attr("src");
            if (src) {
                blocks.push(`<p><img src="${src}" alt="" style="max-width:120px" /></p>`);
            }
        }
        else if ($mod.hasClass("se-module-horizontalLine") ||
            $mod.hasClass("se-module-hr")) {
            blocks.push("<hr />");
        }
        else if ($mod.hasClass("se-module-video")) {
            // Video embed - try to get thumbnail or link
            const link = $mod.find("a").attr("href");
            if (link) {
                blocks.push(`<p><a href="${link}">[Video]</a></p>`);
            }
        }
    });
    return blocks.join("\n");
}
/**
 * Extract content from older Naver editors (SmartEditor 2, etc).
 */
function extractOldEditorContent($) {
    // Try multiple selectors for different editor versions
    const selectors = [
        "#postViewArea",
        "#viewTypeSelector",
        ".post-view",
        ".post_ct",
        "#post-view",
        ".se_component_wrap",
        "#content-area",
    ];
    for (const selector of selectors) {
        const area = $(selector);
        if (area.length && area.html()?.trim()) {
            area.find("script, style, .post_footer, .post_header").remove();
            const html = area.html()?.trim();
            if (html && html.length > 50) {
                return html;
            }
        }
    }
    return "";
}
function cleanTitle(title) {
    return title.replace(/\s*:\s*네이버\s*블로그\s*$/, "").trim();
}
/**
 * Download images from Naver and upload to Firebase Storage.
 * Returns content with replaced image URLs.
 */
async function uploadNaverImages(contentHtml, coverImageUrl, blogId, logNo) {
    const bucket = admin.storage().bucket();
    const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g;
    const naverDomains = [
        "postfiles.pstatic.net",
        "blogfiles.pstatic.net",
        "mblogthumb-phinf.pstatic.net",
        "phinf.pstatic.net",
        "storep-phinf.pstatic.net",
        "ssl.pstatic.net",
    ];
    const isNaverImage = (url) => {
        try {
            const u = new URL(url);
            return naverDomains.some((d) => u.hostname.includes(d));
        }
        catch {
            return false;
        }
    };
    const uploadImage = async (imageUrl, index) => {
        try {
            const res = await fetch(imageUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    Referer: `https://blog.naver.com/${blogId}/${logNo}`,
                },
            });
            if (!res.ok)
                return null;
            const contentType = res.headers.get("content-type") || "image/jpeg";
            const ext = contentType.includes("png") ? "png" : contentType.includes("gif") ? "gif" : contentType.includes("webp") ? "webp" : "jpg";
            const buffer = Buffer.from(await res.arrayBuffer());
            const filePath = `blog-images/${blogId}-${logNo}/${index}.${ext}`;
            const file = bucket.file(filePath);
            await file.save(buffer, {
                metadata: { contentType },
                public: true,
            });
            return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
        }
        catch (err) {
            console.error(`Failed to upload image ${index}:`, err);
            return null;
        }
    };
    // Collect all Naver image URLs from content
    const matches = [];
    let match;
    let idx = 0;
    while ((match = imgRegex.exec(contentHtml)) !== null) {
        const src = match[1];
        if (isNaverImage(src)) {
            matches.push({ original: src, index: idx++ });
        }
    }
    // Upload images in parallel (max 5 concurrent)
    let updatedContent = contentHtml;
    const batchSize = 5;
    for (let i = 0; i < matches.length; i += batchSize) {
        const batch = matches.slice(i, i + batchSize);
        const results = await Promise.all(batch.map((m) => uploadImage(m.original, m.index)));
        results.forEach((newUrl, j) => {
            if (newUrl) {
                updatedContent = updatedContent.split(batch[j].original).join(newUrl);
            }
        });
    }
    // Upload cover image if it's from Naver
    let updatedCover = coverImageUrl;
    if (coverImageUrl && isNaverImage(coverImageUrl)) {
        const newCoverUrl = await uploadImage(coverImageUrl, 999);
        if (newCoverUrl)
            updatedCover = newCoverUrl;
    }
    return { content: updatedContent, coverImageUrl: updatedCover };
}
/**
 * Scrapes a Naver blog post using multiple strategies.
 */
exports.scrapeNaverBlog = (0, https_1.onCall)({
    timeoutSeconds: 60,
    memory: "512MiB",
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
    console.log(`Scraping Naver blog: blogId=${blogId}, logNo=${logNo}`);
    try {
        let result = null;
        // Strategy 1: Desktop iframe (most reliable for full content)
        console.log("Trying Strategy 1: Desktop iframe...");
        const desktopResult = await fetchDesktopIframe(blogId, logNo);
        if (desktopResult && desktopResult.content.length > 50) {
            console.log(`Strategy 1 success: title="${desktopResult.title}", content length=${desktopResult.content.length}`);
            result = desktopResult;
        }
        // Strategy 2: Mobile page with __NEXT_DATA__
        if (!result) {
            console.log("Trying Strategy 2: Mobile __NEXT_DATA__...");
            const mobileResult = await fetchMobileNextData(blogId, logNo);
            if (mobileResult && mobileResult.content.length > 50) {
                console.log(`Strategy 2 success: title="${mobileResult.title}", content length=${mobileResult.content.length}`);
                result = mobileResult;
            }
        }
        // Strategy 3: Use whatever partial content we got
        if (!result) {
            const partialResult = desktopResult;
            if (partialResult && partialResult.content) {
                console.log(`Using partial result: content length=${partialResult.content.length}`);
                result = partialResult;
            }
        }
        // Final fallback: og:description from mobile page
        if (!result) {
            console.log("All strategies failed, trying og:description fallback...");
            const fallbackResponse = await fetch(`https://m.blog.naver.com/${blogId}/${logNo}`, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
                    "Accept-Language": "ko-KR,ko;q=0.9",
                },
            });
            if (fallbackResponse.ok) {
                const fallbackHtml = await fallbackResponse.text();
                const $fb = cheerio.load(fallbackHtml);
                const ogTitle = $fb("meta[property='og:title']").attr("content")?.trim() || "";
                const ogDesc = $fb("meta[property='og:description']").attr("content")?.trim() ||
                    "";
                const ogImage = $fb("meta[property='og:image']").attr("content")?.trim() || "";
                if (ogDesc) {
                    result = {
                        title: cleanTitle(ogTitle),
                        content: `<p>${ogDesc}</p>`,
                        coverImageUrl: ogImage,
                    };
                }
            }
        }
        if (!result) {
            throw new https_1.HttpsError("not-found", "Could not extract content. The post may be private or use an unsupported format.");
        }
        // Upload Naver images to Firebase Storage
        console.log("Uploading images to Firebase Storage...");
        const uploaded = await uploadNaverImages(result.content, result.coverImageUrl, blogId, logNo);
        result.content = uploaded.content;
        result.coverImageUrl = uploaded.coverImageUrl;
        return result;
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