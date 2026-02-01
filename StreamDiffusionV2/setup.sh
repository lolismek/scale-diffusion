#!/bin/bash
set -e

# StreamDiffusionV2 Setup Script (using uv)
# Optimized for H100 GPUs with CUDA 12.4+

echo "=== StreamDiffusionV2 Setup ==="
echo "Using uv for package management"
echo ""

# Check if uv is installed
if ! command -v uv &> /dev/null; then
    echo "Error: uv is not installed. Please install it first:"
    echo "  curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

# Check CUDA version
echo "Checking CUDA version..."
if command -v nvcc &> /dev/null; then
    nvcc --version
else
    echo "Warning: nvcc not found. Make sure CUDA 12.4+ is installed."
fi
echo ""

# Navigate to project directory
cd ~/strea-diffusio-2/StreamDiffusionV2

# Create virtual environment if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment with Python 3.10..."
    uv venv --python 3.10
fi

# Activate virtual environment
echo "Activating virtual environment..."
source .venv/bin/activate

# 1. Install Ninja (build system for faster compilation)
echo ""
echo "=== Step 1/5: Installing Ninja ==="
uv pip install ninja

# 2. Install PyTorch (H100 compatible with CUDA 12.4)
echo ""
echo "=== Step 2/5: Installing PyTorch (CUDA 12.4) ==="
uv pip install torch==2.6.0 torchvision==0.21.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu124

# 3. Install H100-specific speed boosters (flash-attn)
echo ""
echo "=== Step 3/5: Installing Flash Attention ==="
uv pip install flash-attn --no-build-isolation

# 4. Install pip (required as build dependency for nvidia-pyindex)
echo ""
echo "=== Step 4/6: Installing pip (build dependency for nvidia packages) ==="
uv pip install pip

# 5. Install StreamDiffusion dependencies
echo ""
echo "=== Step 5/6: Installing StreamDiffusionV2 dependencies ==="
uv pip install -r requirements.txt --no-build-isolation

# 6. Install package in development mode
echo ""
echo "=== Step 6/6: Installing StreamDiffusionV2 in development mode ==="
python setup.py develop

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "To activate the environment in the future, run:"
echo "  source ~/strea-diffusio-2/StreamDiffusionV2/.venv/bin/activate"
echo ""
echo "Next steps:"
echo "  1. Download checkpoints (see README.md)"
echo "  2. Run inference with: python streamv2v/inference.py ..."
