// S3 Upload Helper
const UPLOAD_API_URL = 'https://qxmu6uhtdrimcghm2xqun645qy0zthjx.lambda-url.us-west-1.on.aws/';

/**
 * Test the upload API connection immediately
 */
export async function testUploadApi() {
  console.log('[Upload] Testing API connection...');
  try {
    const response = await fetch(UPLOAD_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: 'test', filename: 'test.txt', contentType: 'text/plain' }),
    });
    const text = await response.text();
    if (response.ok) {
      console.log('[Upload] API connection OK ✓');
      return true;
    } else {
      console.error(`[Upload] API error: ${response.status}`, text);
      return false;
    }
  } catch (err) {
    console.error('[Upload] API connection failed:', err);
    return false;
  }
}

/**
 * Upload a session bundle to S3
 * @param {Object} bundle - Session bundle from GameCanvas
 * @returns {Promise<Object>} - Upload result with S3 keys
 */
export async function uploadSession(bundle) {
  const { sessionId, walletAddress, prompt, video, inputs, camera, latency, metadata } = bundle;

  try {
    // 1. Upload video
    console.log('Uploading video...');
    const videoKey = await uploadFile(
      walletAddress,
      `${sessionId}.webm`,
      video,
      'video/webm'
    );

    // 2. Upload inputs JSON
    console.log('Uploading inputs...');
    const inputsBlob = new Blob([JSON.stringify(inputs)], { type: 'application/json' });
    const inputsKey = await uploadFile(
      walletAddress,
      `${sessionId}_inputs.json`,
      inputsBlob,
      'application/json'
    );

    // 3. Upload camera JSON
    console.log('Uploading camera data...');
    const cameraBlob = new Blob([JSON.stringify(camera)], { type: 'application/json' });
    const cameraKey = await uploadFile(
      walletAddress,
      `${sessionId}_camera.json`,
      cameraBlob,
      'application/json'
    );

    // 4. Upload latency JSON
    console.log('Uploading latency data...');
    const latencyBlob = new Blob([JSON.stringify(latency || {})], { type: 'application/json' });
    const latencyKey = await uploadFile(
      walletAddress,
      `${sessionId}_latency.json`,
      latencyBlob,
      'application/json'
    );

    // 5. Upload metadata JSON
    console.log('Uploading metadata...');
    const metaBlob = new Blob([JSON.stringify({
      sessionId,
      walletAddress,
      prompt,
      ...metadata,
      latencySummary: latency ? {
        initialLatency: latency.initialLatency,
        avgRtt: latency.avgRtt,
      } : null,
      uploadedAt: new Date().toISOString(),
    })], { type: 'application/json' });
    const metaKey = await uploadFile(
      walletAddress,
      `${sessionId}_meta.json`,
      metaBlob,
      'application/json'
    );

    console.log('Session upload complete!');
    return {
      success: true,
      keys: {
        video: videoKey,
        inputs: inputsKey,
        camera: cameraKey,
        latency: latencyKey,
        meta: metaKey,
      },
    };
  } catch (error) {
    console.error('Session upload failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get presigned URL and upload file to S3
 */
async function uploadFile(walletAddress, filename, blob, contentType) {
  // Get presigned URL from our Lambda
  const response = await fetch(UPLOAD_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, filename, contentType }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get upload URL: ${response.status}`);
  }

  const { uploadUrl, key } = await response.json();

  // Upload directly to S3
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload to S3: ${uploadResponse.status}`);
  }

  console.log(`Uploaded: ${key}`);
  return key;
}
