import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 Client (S3-compatible API, 10 GB Free, Zero Egress Bandwidth Fees)
const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT || 
    (process.env.CLOUDFLARE_ACCOUNT_ID 
      ? `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com` 
      : undefined),
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

const DEFAULT_BUCKET = process.env.R2_BUCKET_NAME || "hra-documents";

/**
 * Upload a PDF invoice or production run card to Cloudflare R2
 */
export async function uploadDocumentToR2(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/pdf"
): Promise<{ success: boolean; key: string; url?: string; error?: string }> {
  try {
    const bucket = DEFAULT_BUCKET;
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: typeof data === "string" ? Buffer.from(data) : data,
      ContentType: contentType,
    });

    await r2Client.send(command);

    const publicDomain = process.env.R2_PUBLIC_DOMAIN;
    const publicUrl = publicDomain ? `https://${publicDomain}/${key}` : undefined;

    return {
      success: true,
      key,
      url: publicUrl,
    };
  } catch (err: any) {
    console.error("[R2 Storage] Upload error:", err);
    return {
      success: false,
      key,
      error: err?.message || "Failed to upload to Cloudflare R2",
    };
  }
}

/**
 * Generate a pre-signed temporary download URL for a document in Cloudflare R2
 */
export async function getDocumentDownloadUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: DEFAULT_BUCKET,
      Key: key,
    });
    return await getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });
  } catch (err) {
    console.error("[R2 Storage] Presign error:", err);
    return null;
  }
}

/**
 * Delete a document from Cloudflare R2
 */
export async function deleteDocumentFromR2(key: string): Promise<boolean> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: DEFAULT_BUCKET,
      Key: key,
    });
    await r2Client.send(command);
    return true;
  } catch (err) {
    console.error("[R2 Storage] Delete error:", err);
    return false;
  }
}
