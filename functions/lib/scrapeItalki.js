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
exports.scrapeItalkiProfile = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
// Map italki language codes to readable names
const ITALKI_LANGUAGES = {
    1: "English", 2: "Chinese", 3: "Spanish", 4: "French",
    5: "German", 6: "Japanese", 7: "Korean", 8: "Italian",
    9: "Portuguese", 10: "Russian", 11: "Arabic", 12: "Hindi",
    45: "Vietnamese", 14: "Thai", 15: "Indonesian",
    16: "Turkish", 17: "Polish", 18: "Dutch", 19: "Greek",
};
// Map country codes to readable names
const COUNTRY_NAMES = {
    US: "United States", GB: "United Kingdom", CA: "Canada",
    AU: "Australia", VN: "Vietnam", KR: "South Korea",
    JP: "Japan", CN: "China", FR: "France", DE: "Germany",
    IT: "Italy", ES: "Spain", BR: "Brazil", MX: "Mexico",
    TH: "Thailand", ID: "Indonesia", PH: "Philippines",
    IN: "India", RU: "Russia", TR: "Turkey", PL: "Poland",
    NL: "Netherlands", GR: "Greece", PT: "Portugal",
    TW: "Taiwan", HK: "Hong Kong", SG: "Singapore",
    MY: "Malaysia", NZ: "New Zealand", IE: "Ireland",
    ZA: "South Africa", AR: "Argentina", CL: "Chile",
    CO: "Colombia", PE: "Peru", UA: "Ukraine", CZ: "Czech Republic",
    SE: "Sweden", NO: "Norway", FI: "Finland", DK: "Denmark",
};
/**
 * Extract italki teacher ID from URL.
 * Supports: /teacher/12345/... or /teacher/12345
 */
function extractTeacherId(url) {
    const match = url.match(/teacher\/(\d+)/);
    return match ? match[1] : null;
}
/**
 * Scrape an italki teacher profile using the public API.
 * Admin-only callable function.
 */
exports.scrapeItalkiProfile = (0, https_1.onCall)({ cors: true, invoker: "public", timeoutSeconds: 30, memory: "256MiB" }, async (request) => {
    // Auth check
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Login required");
    }
    const userDoc = await admin
        .firestore()
        .collection("users")
        .doc(request.auth.uid)
        .get();
    if (userDoc.data()?.role !== "admin") {
        throw new https_1.HttpsError("permission-denied", "Admin only");
    }
    const { url } = request.data;
    if (!url) {
        throw new https_1.HttpsError("invalid-argument", "URL is required");
    }
    const teacherId = extractTeacherId(url);
    if (!teacherId) {
        throw new https_1.HttpsError("invalid-argument", "Invalid italki URL. Expected format: https://www.italki.com/en/teacher/12345/...");
    }
    console.log(`Fetching italki teacher profile: ${teacherId}`);
    try {
        const apiUrl = `https://api.italki.com/api/v2/teacher/${teacherId}`;
        const res = await fetch(apiUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Accept: "application/json",
            },
        });
        if (!res.ok) {
            throw new https_1.HttpsError("unavailable", `italki API returned ${res.status}`);
        }
        const json = (await res.json());
        const { user_info, teacher_info, pro_info } = json.data;
        // Build avatar URL
        let profileImageUrl = "";
        if (user_info.avatar_file_name) {
            profileImageUrl = user_info.avatar_file_name.startsWith("http")
                ? user_info.avatar_file_name
                : `https://imagesavatar-static01.italki.com/1T${user_info.user_id}_Avatar.jpg`;
        }
        // Build languages map
        const languages = {};
        for (const lang of teacher_info.teach_language || []) {
            const name = ITALKI_LANGUAGES[lang.language] || `lang_${lang.language}`;
            languages[name] = lang.is_professional ? "professional" : "community";
        }
        for (const lang of teacher_info.also_speak || []) {
            const name = ITALKI_LANGUAGES[lang.language] || `lang_${lang.language}`;
            if (!languages[name]) {
                languages[name] = `level_${lang.level}`;
            }
        }
        // Get location from origin country
        const location = COUNTRY_NAMES[user_info.origin_country_id] ||
            user_info.origin_country_id ||
            "";
        // Get lesson price
        let lessonPrice = 0;
        let currency = "USD";
        if (teacher_info.session_price_obj?.length) {
            const firstPrice = teacher_info.session_price_obj[0];
            lessonPrice = firstPrice.origin_amount / 100; // cents to dollars
            currency = firstPrice.origin_currency || "USD";
        }
        return {
            name: user_info.nickname || "",
            profileImageUrl,
            location,
            bio: user_info.intro || "",
            teachingStyle: pro_info?.teaching_style || "",
            languages,
            rating: teacher_info.avg_rating || 0,
            totalReviews: teacher_info.total_ratings || 0,
            lessonPrice,
            currency,
            videoIntroUrl: teacher_info.teacher_video || "",
            italkiId: teacherId,
        };
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        console.error("italki scrape error:", err);
        const message = err instanceof Error ? err.message : "Failed to fetch teacher profile";
        throw new https_1.HttpsError("internal", message);
    }
});
//# sourceMappingURL=scrapeItalki.js.map