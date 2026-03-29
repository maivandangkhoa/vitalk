import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

interface ScrapeRequest {
  url: string;
}

interface ItalkiTeacherResponse {
  data: {
    user_info: {
      user_id: number;
      nickname: string;
      avatar_file_name: string | null;
      origin_country_id: string;
      living_country_id: string;
      intro: string;
    };
    teacher_info: {
      teach_language: Array<{
        language: number;
        is_professional: number;
      }>;
      also_speak: Array<{
        language: number;
        level: number;
      }>;
      teacher_video: string | null;
      lesson_count: number;
      student_count: number;
      attend_rate: number;
      avg_rating: number;
      total_ratings: number;
      session_price_obj?: Array<{
        session_name: string;
        origin_amount: number;
        origin_currency: string;
      }>;
    };
    pro_info?: {
      teaching_style: string;
      experience: string;
      education: string;
    };
  };
}

// Map italki language codes to readable names
const ITALKI_LANGUAGES: Record<number, string> = {
  1: "English", 2: "Chinese", 3: "Spanish", 4: "French",
  5: "German", 6: "Japanese", 7: "Korean", 8: "Italian",
  9: "Portuguese", 10: "Russian", 11: "Arabic", 12: "Hindi",
  45: "Vietnamese", 14: "Thai", 15: "Indonesian",
  16: "Turkish", 17: "Polish", 18: "Dutch", 19: "Greek",
};

// Map country codes to readable names
const COUNTRY_NAMES: Record<string, string> = {
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
function extractTeacherId(url: string): string | null {
  const match = url.match(/teacher\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Scrape an italki teacher profile using the public API.
 * Admin-only callable function.
 */
export const scrapeItalkiProfile = onCall(
  { cors: true, invoker: "public", timeoutSeconds: 30, memory: "256MiB" },
  async (request) => {
    // Auth check
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login required");
    }

    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(request.auth.uid)
      .get();
    if (userDoc.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Admin only");
    }

    const { url } = request.data as ScrapeRequest;
    if (!url) {
      throw new HttpsError("invalid-argument", "URL is required");
    }

    const teacherId = extractTeacherId(url);
    if (!teacherId) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid italki URL. Expected format: https://www.italki.com/en/teacher/12345/..."
      );
    }

    console.log(`Fetching italki teacher profile: ${teacherId}`);

    try {
      const apiUrl = `https://api.italki.com/api/v2/teacher/${teacherId}`;
      const res = await fetch(apiUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        throw new HttpsError(
          "unavailable",
          `italki API returned ${res.status}`
        );
      }

      const json = (await res.json()) as ItalkiTeacherResponse;
      const { user_info, teacher_info, pro_info } = json.data;

      // Build avatar URL
      let profileImageUrl = "";
      if (user_info.avatar_file_name) {
        profileImageUrl = user_info.avatar_file_name.startsWith("http")
          ? user_info.avatar_file_name
          : `https://imagesavatar-static01.italki.com/1T${user_info.user_id}_Avatar.jpg`;
      }

      // Build languages map
      const languages: Record<string, string> = {};
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
      const location =
        COUNTRY_NAMES[user_info.origin_country_id] ||
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
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error("italki scrape error:", err);
      const message =
        err instanceof Error ? err.message : "Failed to fetch teacher profile";
      throw new HttpsError("internal", message);
    }
  }
);
