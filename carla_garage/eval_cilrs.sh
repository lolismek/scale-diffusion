#!/bin/bash
# Evaluate a CILRS model on CARLA
# Usage: ./eval_cilrs.sh <model_folder> [routes_file] [--debug]
#
# Examples:
#   ./eval_cilrs.sh logs/cilrs_exp1
#   ./eval_cilrs.sh logs/cilrs_exp1 leaderboard/data/debug.xml
#   ./eval_cilrs.sh logs/cilrs_exp1 --debug    # Save visualization frames
#
# The model folder should contain:
#   - model_best.pth (or model_base.pth)
#   - config.json (optional, will use defaults if missing)

set -e

# Check for --debug flag
DEBUG_MODE=0
for arg in "$@"; do
    if [ "$arg" == "--debug" ]; then
        DEBUG_MODE=1
    fi
done

# Parse arguments (filter out --debug)
ARGS=()
for arg in "$@"; do
    if [ "$arg" != "--debug" ]; then
        ARGS+=("$arg")
    fi
done

MODEL_PATH="${ARGS[0]:?Error: Model folder required. Usage: ./eval_cilrs.sh <model_folder> [routes_file] [--debug]}"
ROUTES_FILE="${ARGS[1]:-leaderboard/data/debug.xml}"
RESULTS_DIR="./eval_results_cilrs"

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
echo "Model:   $MODEL_PATH"
echo "Routes:  $ROUTES_FILE"
echo "Results: $RESULTS_DIR"
echo "CARLA:   $CARLA_ROOT"
echo ""

# Set up environment
export WORK_DIR="$SCRIPT_DIR"
export SCENARIO_RUNNER_ROOT="${WORK_DIR}/scenario_runner"
export LEADERBOARD_ROOT="${WORK_DIR}/leaderboard"
export PYTHONPATH="${CARLA_ROOT}/PythonAPI/carla/:${SCENARIO_RUNNER_ROOT}:${LEADERBOARD_ROOT}:${WORK_DIR}:${PYTHONPATH}"

# Create results directory
mkdir -p "$RESULTS_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
MODEL_NAME=$(basename "$MODEL_PATH")
RESULT_FILE="$RESULTS_DIR/result_${MODEL_NAME}_${TIMESTAMP}.json"

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
    export SAVE_PATH="$RESULTS_DIR/frames_${MODEL_NAME}_${TIMESTAMP}"
    mkdir -p "$SAVE_PATH"
    echo "DEBUG MODE: Saving frames to $SAVE_PATH"
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
        VIDEO_PATH="$RESULTS_DIR/video_${MODEL_NAME}_${TIMESTAMP}.mp4"
        echo ""
        echo "Creating video from $FRAME_COUNT frames..."
        ffmpeg -y -framerate 20 -pattern_type glob -i "$SAVE_PATH/*.jpg" \
            -c:v libx264 -pix_fmt yuv420p -crf 23 "$VIDEO_PATH" 2>/dev/null
        echo "Video saved to: $VIDEO_PATH"
    fi
fi
