import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

interface NaverTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

interface NaverProfileResponse {
  resultcode: string;
  message: string;
  response: {
    id: string;
    email?: string;
    nickname?: string;
    profile_image?: string;
    name?: string;
  };
}

export const naverLogin = onCall(
  {
    cors: true,
    invoker: "public",
  },
  async (request) => {
    const { code, state } = request.data as { code: string; state: string };

    if (!code || !state) {
      throw new HttpsError("invalid-argument", "code and state are required");
    }

    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new HttpsError(
        "failed-precondition",
        "Naver credentials not configured"
      );
    }

    // 1. Exchange authorization code for access token
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      state,
    });

    const tokenResponse = await fetch(
      `https://nid.naver.com/oauth2.0/token?${tokenParams.toString()}`,
      { method: "POST" }
    );

    const tokenData = (await tokenResponse.json()) as NaverTokenResponse;

    if (tokenData.error || !tokenData.access_token) {
      throw new HttpsError(
        "internal",
        `Naver token exchange failed: ${tokenData.error_description || "Unknown error"}`
      );
    }

    // 2. Fetch user profile from Naver
    const profileResponse = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const profileData = (await profileResponse.json()) as NaverProfileResponse;

    if (profileData.resultcode !== "00") {
      throw new HttpsError(
        "internal",
        `Naver profile fetch failed: ${profileData.message}`
      );
    }

    const naverUser = profileData.response;
    const naverUid = `naver:${naverUser.id}`;

    // 3. Create or get Firebase Auth user
    let firebaseUser: admin.auth.UserRecord;
    try {
      firebaseUser = await admin.auth().getUser(naverUid);
      // Update profile if changed
      await admin.auth().updateUser(naverUid, {
        displayName: naverUser.name || naverUser.nickname || undefined,
        photoURL: naverUser.profile_image || undefined,
      });
    } catch (error: unknown) {
      const authError = error as { code?: string };
      if (authError.code === "auth/user-not-found") {
        firebaseUser = await admin.auth().createUser({
          uid: naverUid,
          email: naverUser.email || undefined,
          displayName:
            naverUser.name || naverUser.nickname || "Naver User",
          photoURL: naverUser.profile_image || undefined,
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
