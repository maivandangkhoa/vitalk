import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

interface KakaoTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface KakaoProfileResponse {
  id: number;
  kakao_account?: {
    email?: string;
    profile?: {
      nickname?: string;
      profile_image_url?: string;
      thumbnail_image_url?: string;
    };
  };
  properties?: {
    nickname?: string;
    profile_image?: string;
  };
}

export const kakaoLogin = onCall(
  {
    cors: true,
    invoker: "public",
  },
  async (request) => {
    const { code, redirectUri } = request.data as {
      code: string;
      redirectUri: string;
    };

    if (!code || !redirectUri) {
      throw new HttpsError(
        "invalid-argument",
        "code and redirectUri are required"
      );
    }

    const clientId = process.env.KAKAO_CLIENT_ID?.trim();
    const clientSecret = process.env.KAKAO_CLIENT_SECRET?.trim();

    if (!clientId || !clientSecret) {
      throw new HttpsError(
        "failed-precondition",
        "Kakao credentials not configured"
      );
    }

    // 1. Exchange authorization code for access token
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    });

    const tokenResponse = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });

    const tokenData = (await tokenResponse.json()) as KakaoTokenResponse;

    if (tokenData.error || !tokenData.access_token) {
      const detail =
        tokenData.error_description || tokenData.error || "Unknown error";
      throw new HttpsError("internal", `Kakao token exchange failed: ${detail}`);
    }

    // 2. Fetch user profile from Kakao
    const profileResponse = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileResponse.ok) {
      throw new HttpsError(
        "internal",
        `Kakao profile fetch failed: ${profileResponse.status}`
      );
    }

    const profileData = (await profileResponse.json()) as KakaoProfileResponse;

    const account = profileData.kakao_account || {};
    const profile = account.profile || {};
    const legacy = profileData.properties || {};

    const email = account.email;
    const nickname = profile.nickname || legacy.nickname || "Kakao User";
    const photoURL =
      profile.profile_image_url ||
      profile.thumbnail_image_url ||
      legacy.profile_image;

    const kakaoUid = `kakao:${profileData.id}`;

    // 3. Create or get Firebase Auth user
    let firebaseUser: admin.auth.UserRecord;
    try {
      firebaseUser = await admin.auth().getUser(kakaoUid);
      await admin.auth().updateUser(kakaoUid, {
        displayName: nickname,
        photoURL: photoURL || undefined,
      });
    } catch (error: unknown) {
      const authError = error as { code?: string };
      if (authError.code === "auth/user-not-found") {
        firebaseUser = await admin.auth().createUser({
          uid: kakaoUid,
          email: email || undefined,
          displayName: nickname,
          photoURL: photoURL || undefined,
        });
      } else {
        throw new HttpsError("internal", "Failed to get/create user");
      }
    }

    // 4. Generate Firebase custom token
    const customToken = await admin.auth().createCustomToken(firebaseUser.uid);

    return { customToken };
  }
);
