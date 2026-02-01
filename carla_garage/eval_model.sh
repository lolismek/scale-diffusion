#!/bin/bash
# Evaluate a TransFuser++ model on CARLA
# Usage: ./eval_model.sh <model_path> [routes_file] [results_dir]
#
# Examples:
#   ./eval_model.sh ./pretrained_models/tfpp_all_0
#   ./eval_model.sh ./pretrained_models/tfpp_all_0 leaderboard/data/routes_validation.xml
#   ./eval_model.sh ./pretrained_models/tfpp_all_0 leaderboard/data/debug.xml ./my_results

set -e

# Parse arguments
MODEL_PATH="${1:?Error: Model path required. Usage: ./eval_model.sh <model_path> [routes_file] [results_dir]}"
ROUTES_FILE="${2:-leaderboard/data/debug.xml}"
RESULTS_DIR="${3:-./eval_results}"

# Get absolute paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL_PATH="$(cd "$(dirname "$MODEL_PATH")" && pwd)/$(basename "$MODEL_PATH")"

# Validate model path
if [ ! -f "$MODEL_PATH/config.json" ]; then
    echo "Error: config.json not found in $MODEL_PATH"
    echo "Please provide a valid model folder containing config.json and model weights."
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

echo "=== TransFuser++ Model Evaluation ==="
echo "Model:   $MODEL_PATH"
echo "Routes:  $ROUTES_FILE"
echo "Results: $RESULTS_DIR"
echo "CARLA:   $CARLA_ROOT"
echo ""

# Set up environment
export WORK_DIR="$SCRIPT_DIR"
export SCENARIO_RUNNER_ROOT="${WORK_DIR}/scenario_runner"
export LEADERBOARD_ROOT="${WORK_DIR}/leaderboard"
export PYTHONPATH="${CARLA_ROOT}/PythonAPI/carla/:${SCENARIO_RUNNER_ROOT}:${LEADERBOARD_ROOT}:${PYTHONPATH}"

# Create results directory
mkdir -p "$RESULTS_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULT_FILE="$RESULTS_DIR/result_${TIMESTAMP}.json"

# Optional: Enable debug visualizations
# export DEBUG_CHALLENGE=1
# export SAVE_PATH="$RESULTS_DIR/visualizations"

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

# Run evaluation
python "${LEADERBOARD_ROOT}/leaderboard/leaderboard_evaluator_local.py" \
    --agent "${WORK_DIR}/team_code/sensor_agent.py" \
    --agent-config "$MODEL_PATH" \
    --routes "$ROUTES_FILE" \
    --checkpoint "$RESULT_FILE"

echo ""
echo "=== Evaluation Complete ==="
echo "Results saved to: $RESULT_FILE"
echo ""
echo "To parse results, run:"
echo "  python tools/result_parser.py --xml $ROUTES_FILE --results $RESULTS_DIR"
