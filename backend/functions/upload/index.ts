import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Resource } from "sst";

const s3 = new S3Client({});

export async function handler(event: any) {
  // Parse request
  const body = JSON.parse(event.body || "{}");
  const { walletAddress, filename, contentType = "image/jpeg" } = body;

  if (!walletAddress || !filename) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "walletAddress and filename required" }),
    };
  }

  // Generate unique key: wallet/timestamp_filename
  const timestamp = Date.now();
  const key = `${walletAddress}/${timestamp}_${filename}`;

  // Generate presigned URL (valid for 5 minutes)
  const command = new PutObjectCommand({
    Bucket: Resource.RawUploads.name,
    Key: key,
    ContentType: contentType,
    Metadata: {
      wallet: walletAddress,
      uploadedAt: new Date().toISOString(),
    },
  });

  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

  return {
    statusCode: 200,
    body: JSON.stringify({
      uploadUrl: presignedUrl,
      key,
    }),
  };
}
