#!/bin/bash
# Watch S3 uploads in real-time
# Usage: ./watch_uploads.sh

BUCKET="scale-diffusion-dev-rawuploadsbucket-bmkszosn"
REGION="us-west-1"

echo "Watching S3 bucket: $BUCKET"
echo "Press Ctrl+C to stop"
echo "-----------------------------------"

# Track what we've seen
SEEN_FILE="/tmp/s3_seen_keys.txt"
touch "$SEEN_FILE"

while true; do
  # List all objects, sorted by date
  aws s3api list-objects-v2 \
    --bucket "$BUCKET" \
    --query 'Contents[*].[Key,Size,LastModified]' \
    --output text \
    --region "$REGION" 2>/dev/null | while read -r key size date; do

    if [ -n "$key" ] && ! grep -q "^$key$" "$SEEN_FILE" 2>/dev/null; then
      echo "$key" >> "$SEEN_FILE"

      # Format size
      if [ "$size" -gt 1048576 ]; then
        size_fmt="$(echo "scale=1; $size/1048576" | bc)MB"
      elif [ "$size" -gt 1024 ]; then
        size_fmt="$(echo "scale=1; $size/1024" | bc)KB"
      else
        size_fmt="${size}B"
      fi

      echo "[$(date '+%H:%M:%S')] NEW: $key ($size_fmt)"
    fi
  done

  sleep 3
done
