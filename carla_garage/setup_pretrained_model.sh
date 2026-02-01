#!/bin/bash
# Setup pretrained TransFuser++ models for CARLA garage
# Usage: ./setup_pretrained_model.sh [output_dir]

set -e

OUTPUT_DIR="${1:-./pretrained_models}"
MODEL_URL="https://s3.eu-central-1.amazonaws.com/avg-projects-2/garage_2/models/pretrained_models.zip"

echo "=== TransFuser++ Pretrained Model Setup ==="
echo "Output directory: $OUTPUT_DIR"

# Create output directory
mkdir -p "$OUTPUT_DIR"
cd "$OUTPUT_DIR"

# Download pretrained models
if [ -f "pretrained_models.zip" ]; then
    echo "Archive already exists, skipping download..."
else
    echo "Downloading pretrained models (~2GB)..."
    curl -L -o pretrained_models.zip "$MODEL_URL"
fi

# Extract models
echo "Extracting models..."
unzip -o pretrained_models.zip

echo ""
echo "=== Setup Complete ==="
echo "Models available at: $OUTPUT_DIR"
echo ""
echo "Available model folders:"
find . -name "config.json" -exec dirname {} \; | sort | uniq
echo ""
echo "Each folder contains:"
echo "  - config.json: Model configuration (auto-loaded)"
echo "  - model_0030_X.pth: Model weights (X = seed)"
echo "  - args.txt: Training hyperparameters"
echo ""
echo "To evaluate, run:"
echo "  ./eval_model.sh <path_to_model_folder>"
