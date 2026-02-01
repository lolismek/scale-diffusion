#!/bin/bash
# Evaluate a CILRS model on CARLA
# Usage: ./eval_cilrs.sh <model_folder> [options]
#
# Options:
#   --routes <file>      Routes XML file (default: leaderboard/data/debug.xml)
#   --checkpoint <name>  Checkpoint file to use (default: model_best.pth)
#   --debug              Save visualization frames
#
# Examples:
#   ./eval_cilrs.sh logs/cilrs
#   ./eval_cilrs.sh logs/cilrs --checkpoint model_base.pth   # Evaluate base model
#   ./eval_cilrs.sh logs/cilrs --checkpoint model_best.pth   # Evaluate trained model
#   ./eval_cilrs.sh logs/cilrs --debug
#   ./eval_cilrs.sh logs/cilrs --routes leaderboard/data/debug.xml
#
# The model folder should contain:
#   - model_best.pth (or specified checkpoint)
#   - config.json (optional, will use defaults if missing)

set -e

# Parse arguments
DEBUG_MODE=0
CHECKPOINT=""
ROUTES_FILE="leaderboard/data/debug.xml"
MODEL_PATH=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --debug)
            DEBUG_MODE=1
            shift
            ;;
        --checkpoint)
            CHECKPOINT="$2"
            shift 2
            ;;
        --routes)
            ROUTES_FILE="$2"
            shift 2
            ;;
        *)
            if [ -z "$MODEL_PATH" ]; then
                MODEL_PATH="$1"
            fi
            shift
            ;;
    esac
done

if [ -z "$MODEL_PATH" ]; then
    echo "Error: Model folder required."
    echo "Usage: ./eval_cilrs.sh <model_folder> [--checkpoint <name>] [--routes <file>] [--debug]"
    exit 1
fi

# Get absolute paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL_PATH="$(cd "$MODEL_PATH" 2>/dev/null && pwd)" || MODEL_PATH="$SCRIPT_DIR/$1"

# Validate model path
if [ ! -d "$MODEL_PATH" ]; then
    echo "Error: Model folder not found: $MODEL_PATH"
    exit 1
fi

if [ ! -f "$MODEL_PATH/model_best.pth" ] && [ ! -f "$MODEL_PATH/model_base.pth" ]; then
    echo "Error: No model weights found in $MODEL_PATH"
    echo "Expected: model_best.pth or model_base.pth"
    exit 1
fi

# Check for CARLA_ROOT
if [ -z "$CARLA_ROOT" ]; then
    echo "Warning: CARLA_ROOT not set. Attempting to find CARLA..."
    if [ -d "$SCRIPT_DIR/../carla" ]; then
        export CARLA_ROOT="$SCRIPT_DIR/../carla"
    elif [ -d "/opt/carla" ]; then
        export CARLA_ROOT="/opt/carla"
    else
        echo "Error: CARLA_ROOT environment variable not set."
        echo "Please set it: export CARLA_ROOT=/path/to/CARLA"
        exit 1
    fi
fi

echo "=== CILRS Model Evaluation ==="
echo "Model:      $MODEL_PATH"
echo "Checkpoint: ${CHECKPOINT:-model_best.pth (default)}"
echo "Routes:     $ROUTES_FILE"
echo "CARLA:      $CARLA_ROOT"
echo ""

# Set up environment
export WORK_DIR="$SCRIPT_DIR"
export SCENARIO_RUNNER_ROOT="${WORK_DIR}/scenario_runner"
export LEADERBOARD_ROOT="${WORK_DIR}/leaderboard"
export PYTHONPATH="${CARLA_ROOT}/PythonAPI/carla/:${SCENARIO_RUNNER_ROOT}:${LEADERBOARD_ROOT}:${WORK_DIR}:${PYTHONPATH}"

# Create results directory - separate folder per checkpoint
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
MODEL_NAME=$(basename "$MODEL_PATH")
# Get checkpoint name (without .pth extension)
CKPT_NAME="${CHECKPOINT%.pth}"
CKPT_NAME="${CKPT_NAME:-model_best}"
# Results go in: eval_results_cilrs/<model_name>/<checkpoint_name>/
RESULTS_DIR="./eval_results_cilrs/${MODEL_NAME}/${CKPT_NAME}"
mkdir -p "$RESULTS_DIR"
RESULT_FILE="$RESULTS_DIR/result_${TIMESTAMP}.json"

echo "Results:    $RESULTS_DIR"
echo ""

echo "Checking if CARLA server is running..."
if ! pgrep -f "CarlaUE4" > /dev/null; then
    echo ""
    echo "=== CARLA server not detected ==="
    echo "Please start CARLA in another terminal:"
    echo "  cd $CARLA_ROOT && ./CarlaUE4.sh"
    echo ""
    echo "Then re-run this script."
    exit 1
fi

echo "CARLA server detected. Starting evaluation..."
echo ""

# Set up debug mode if requested
if [ "$DEBUG_MODE" -eq 1 ]; then
    export DEBUG_CHALLENGE=1
    export SAVE_PATH="$RESULTS_DIR/frames_${TIMESTAMP}"
    mkdir -p "$SAVE_PATH"
    echo "DEBUG MODE: Saving frames to $SAVE_PATH"
    echo ""
fi

# Set checkpoint if specified
if [ -n "$CHECKPOINT" ]; then
    export CILRS_CHECKPOINT="$CHECKPOINT"
    echo "Using checkpoint: $CHECKPOINT"
    echo ""
fi

# Run evaluation with CILRS agent
python "${LEADERBOARD_ROOT}/leaderboard/leaderboard_evaluator_local.py" \
    --agent "${WORK_DIR}/team_code/cilrs_agent.py" \
    --agent-config "$MODEL_PATH" \
    --routes "$ROUTES_FILE" \
    --checkpoint "$RESULT_FILE"

echo ""
echo "=== Evaluation Complete ==="
echo "Results saved to: $RESULT_FILE"

# Create video from frames if debug mode was enabled
if [ "$DEBUG_MODE" -eq 1 ] && [ -d "$SAVE_PATH" ]; then
    FRAME_COUNT=$(ls -1 "$SAVE_PATH"/*.jpg 2>/dev/null | wc -l)
    if [ "$FRAME_COUNT" -gt 0 ]; then
        VIDEO_PATH="$RESULTS_DIR/video_${TIMESTAMP}.mp4"
        echo ""
        echo "Creating video from $FRAME_COUNT frames..."
        ffmpeg -y -framerate 20 -pattern_type glob -i "$SAVE_PATH/*.jpg" \
            -c:v libx264 -pix_fmt yuv420p -crf 23 "$VIDEO_PATH" 2>/dev/null
        echo "Video saved to: $VIDEO_PATH"
    fi
fi
