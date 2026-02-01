/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "scale-diffusion",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    // S3 Buckets
    const rawBucket = new sst.aws.Bucket("RawUploads", {
      cors: {
        allowHeaders: ["*"],
        allowMethods: ["GET", "PUT", "POST"],
        allowOrigins: ["*"], // Lock down in production
      },
    });

    const cleanBucket = new sst.aws.Bucket("CleanData");

    // SQS Queue for processing
    const processQueue = new sst.aws.Queue("ProcessQueue", {
      visibilityTimeout: "5 minutes",
    });

    // Trigger queue when new file uploaded to raw bucket
    rawBucket.subscribe({
      handler: "functions/validate/index.handler",
      link: [rawBucket, cleanBucket, processQueue],
      environment: {
        RAW_BUCKET: rawBucket.name,
        CLEAN_BUCKET: cleanBucket.name,
      },
    }, {
      events: ["s3:ObjectCreated:*"],
    });

    // Upload endpoint - generates presigned URLs
    const uploadApi = new sst.aws.Function("UploadApi", {
      handler: "functions/upload/index.handler",
      link: [rawBucket],
      url: {
        authorization: "none",
        cors: {
          allowOrigins: ["*"],
          allowMethods: ["*"],
          allowHeaders: ["*"],
        },
      },
    });

    return {
      uploadUrl: uploadApi.url,
      rawBucket: rawBucket.name,
      cleanBucket: cleanBucket.name,
    };
  },
});
