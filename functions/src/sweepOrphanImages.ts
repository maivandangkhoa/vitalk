import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";

/**
 * Removes uploaded images that nothing points at any more.
 *
 * Every upload path in the app writes to storage immediately and nothing ever
 * deletes: an image pasted into a post and then removed, a draft abandoned
 * before it was saved, a replaced cover or avatar, a deleted post (which only
 * deletes its Firestore document) — all leave the object behind.
 */

/**
 * Prefixes this sweep may delete from.
 *
 * INVARIANT: anything added here must have *every* place that can reference it
 * covered by collectReferences below. `chat-images/` is deliberately absent —
 * it is private user content, and it has never produced an orphan.
 */
const SWEEP_PREFIXES = ["blog-images/", "blog-covers/", "teacher-profiles/"];

/** Subcollections, which listing the root collections does not reach. */
const COLLECTION_GROUPS = ["messages", "comments"];

/**
 * An image pasted into a draft is unreferenced until that draft is saved, and
 * a writer can leave one open overnight. A week of grace costs nothing.
 */
const MIN_AGE_DAYS = 7;

/** Deletes issued at once. Each is latency rather than work. */
const CONCURRENCY = 10;

/**
 * Published images serve from storage.googleapis.com; anything not public —
 * chat images — is referenced by its Firebase download URL instead. Missing one
 * of these two forms makes live images look like garbage, so both are matched
 * even for prefixes the sweep does not touch.
 */
const URL_PATTERNS = [
  /storage\.googleapis\.com\/havitalk\/([^"'\s)\\?]+)/g,
  /firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^"'\s)\\?]+)/g,
];

/**
 * Every storage path mentioned anywhere in Firestore.
 *
 * Deliberately blunt — it walks every field of every document rather than the
 * handful of fields known to hold image URLs today, because the cost of missing
 * one is deleting an image a live page is showing. At this size that is a few
 * hundred reads a week; if the chat ever makes that expensive, narrow the scan
 * and the prefix list together, never one without the other.
 */
async function collectReferences(): Promise<Set<string>> {
  const db = admin.firestore();
  const referenced = new Set<string>();

  const note = (text: string) => {
    for (const pattern of URL_PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        referenced.add(decodeURIComponent(match[1]));
      }
    }
  };

  const walk = (value: unknown) => {
    if (typeof value === "string") note(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };

  for (const collection of await db.listCollections()) {
    (await collection.get()).forEach((doc) => walk(doc.data()));
  }
  for (const group of COLLECTION_GROUPS) {
    (await db.collectionGroup(group).get()).forEach((doc) => walk(doc.data()));
  }

  return referenced;
}

export interface OrphanReport {
  orphans: { name: string; bytes: number }[];
  inspected: number;
  referenced: number;
}

/** Exported so a dry run can print exactly what a real run would delete. */
export async function findOrphanImages(): Promise<OrphanReport> {
  const referenced = await collectReferences();
  const bucket = admin.storage().bucket();
  const cutoff = Date.now() - MIN_AGE_DAYS * 24 * 60 * 60 * 1000;

  const orphans: { name: string; bytes: number }[] = [];
  let inspected = 0;

  for (const prefix of SWEEP_PREFIXES) {
    const [files] = await bucket.getFiles({ prefix });
    inspected += files.length;
    for (const file of files) {
      if (referenced.has(file.name)) continue;
      // An object whose age cannot be read is kept: unknown is not old.
      const created = Date.parse(String(file.metadata.timeCreated ?? ""));
      if (!Number.isFinite(created) || created > cutoff) continue;
      orphans.push({ name: file.name, bytes: Number(file.metadata.size ?? 0) });
    }
  }

  return { orphans, inspected, referenced: referenced.size };
}

export const sweepOrphanImages = onSchedule(
  { schedule: "0 4 * * 1", timeZone: "Asia/Seoul", timeoutSeconds: 540 },
  async () => {
    const { orphans, inspected, referenced } = await findOrphanImages();

    // A scan that found nothing is far more likely to be broken than to mean
    // the site has no images, and acting on it would empty the bucket.
    if (referenced === 0) {
      logger.error("sweepOrphanImages: no references found at all, refusing to delete");
      return;
    }

    if (!orphans.length) {
      logger.info(`sweepOrphanImages: nothing to remove (${inspected} objects)`);
      return;
    }

    const bucket = admin.storage().bucket();
    let removed = 0;
    let bytes = 0;
    for (let i = 0; i < orphans.length; i += CONCURRENCY) {
      const chunk = orphans.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map((orphan) => bucket.file(orphan.name).delete())
      );
      results.forEach((result, index) => {
        // One stubborn object must not take the rest of the run with it.
        if (result.status === "fulfilled") {
          removed++;
          bytes += chunk[index].bytes;
        } else {
          logger.error(`sweepOrphanImages: ${chunk[index].name} failed`, result.reason);
        }
      });
    }

    logger.info(
      `sweepOrphanImages: removed ${removed}/${orphans.length} orphans ` +
        `(${(bytes / 1e6).toFixed(1)} MB) of ${inspected} objects, ` +
        `${referenced} paths referenced`
    );
  }
);
