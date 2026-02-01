#!/usr/bin/env python3
"""
CILRS Agent for CARLA Evaluation

This agent uses a trained CILRS model to control a vehicle in CARLA.
Compatible with the CARLA leaderboard evaluation framework.

Usage:
    python leaderboard/leaderboard_evaluator_local.py \
        --agent team_code/cilrs_agent.py \
        --agent-config path/to/cilrs_model_folder \
        --routes leaderboard/data/debug.xml
"""

import os
import json
import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torchvision import transforms

import carla
from leaderboard.autoagents.autonomous_agent import AutonomousAgent, Track

try:
    import timm
    HAS_TIMM = True
except ImportError:
    HAS_TIMM = False


def get_entry_point():
    return 'CILRSAgent'


class CILRS(nn.Module):
    """CILRS model - must match training architecture."""
    
    def __init__(
        self,
        backbone: str = "regnety_032",
        num_commands: int = 4,
        output_dim: int = 3,
        pretrained: bool = False,
    ):
        super().__init__()
        
        self.num_commands = num_commands
        self.output_dim = output_dim
        
        if HAS_TIMM:
            self.encoder = timm.create_model(backbone, pretrained=pretrained, num_classes=0)
            self.feature_dim = self.encoder.num_features
        else:
            import torchvision.models as models
            if backbone == "resnet18":
                base = models.resnet18(pretrained=pretrained)
            elif backbone == "resnet34":
                base = models.resnet34(pretrained=pretrained)
            else:
                base = models.resnet18(pretrained=pretrained)
            self.encoder = nn.Sequential(*list(base.children())[:-1])
            self.feature_dim = 512
        
        self.speed_embed = nn.Sequential(
            nn.Linear(1, 64),
            nn.ReLU(),
            nn.Linear(64, 64),
        )
        
        self.fusion = nn.Sequential(
            nn.Linear(self.feature_dim + 64, 512),
            nn.ReLU(),
            nn.Dropout(0.2),
        )
        
        self.branches = nn.ModuleList([
            nn.Sequential(
                nn.Linear(512, 256),
                nn.ReLU(),
                nn.Dropout(0.2),
                nn.Linear(256, 128),
                nn.ReLU(),
                nn.Linear(128, output_dim),
            )
            for _ in range(num_commands)
        ])
    
    def forward(self, image, speed, command):
        if HAS_TIMM:
            img_feat = self.encoder(image)
        else:
            img_feat = self.encoder(image)
            img_feat = img_feat.view(img_feat.size(0), -1)
        
        speed_feat = self.speed_embed(speed)
        fused = torch.cat([img_feat, speed_feat], dim=1)
        fused = self.fusion(fused)
        
        batch_size = image.size(0)
        outputs = torch.zeros(batch_size, self.output_dim, device=image.device)
        
        for i in range(self.num_commands):
            mask = (command == i)
            if mask.any():
                branch_output = self.branches[i](fused[mask])
                outputs[mask] = branch_output
        
        return outputs


class CILRSAgent(AutonomousAgent):
    """
    CILRS Agent for CARLA Leaderboard evaluation.
    """
    
    def setup(self, path_to_conf_file, route_date_string=None, traffic_manager=None):
        """Initialize the agent with model weights."""
        self.track = Track.SENSORS
        self.route_date_string = route_date_string
        self.traffic_manager = traffic_manager
        
        # Device
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"CILRS Agent using device: {self.device}")
        
        # Debug/visualization settings
        self.debug = int(os.environ.get('DEBUG_CHALLENGE', 0))
        self.save_path = os.environ.get('SAVE_PATH', None)
        self.frame_count = 0
        
        if self.debug and self.save_path:
            os.makedirs(self.save_path, exist_ok=True)
            print(f"Debug mode ON - saving frames to: {self.save_path}")
        
        # Load config
        config_path = os.path.join(path_to_conf_file, "config.json")
        if os.path.exists(config_path):
            with open(config_path) as f:
                self.config = json.load(f)
        else:
            self.config = {}
        
        # Model parameters
        backbone = self.config.get("backbone", "regnety_032")
        output_dim = self.config.get("output_dim", 3)
        
        print(f"Loading CILRS model with backbone: {backbone}")
        
        # Create model
        self.model = CILRS(
            backbone=backbone,
            num_commands=4,
            output_dim=output_dim,
            pretrained=False,
        ).to(self.device)
        
        # Load weights - check env var, config, or use defaults
        checkpoint_name = os.environ.get('CILRS_CHECKPOINT', None)
        if checkpoint_name is None:
            checkpoint_name = self.config.get("checkpoint", None)
        
        if checkpoint_name:
            model_path = os.path.join(path_to_conf_file, checkpoint_name)
        else:
            # Default: try model_best.pth first
            model_path = os.path.join(path_to_conf_file, "model_best.pth")
            if not os.path.exists(model_path):
                # Try other common names
                for name in ["model.pth", "model_base.pth", "checkpoint.pth"]:
                    alt_path = os.path.join(path_to_conf_file, name)
                    if os.path.exists(alt_path):
                        model_path = alt_path
                        break
        
        if os.path.exists(model_path):
            print(f"Loading weights from: {model_path}")
            state_dict = torch.load(model_path, map_location=self.device)
            self.model.load_state_dict(state_dict)
        else:
            print(f"Warning: No model weights found in {path_to_conf_file}")
        
        self.model.eval()
        
        # Image transform
        self.transform = transforms.Compose([
            transforms.Resize((256, 256)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            ),
        ])
        
        print("CILRS Agent initialized successfully")
    
    def sensors(self):
        """Define required sensors."""
        return [
            {
                'type': 'sensor.camera.rgb',
                'x': 1.3, 'y': 0.0, 'z': 2.3,
                'roll': 0.0, 'pitch': 0.0, 'yaw': 0.0,
                'width': 400, 'height': 300, 'fov': 100,
                'id': 'rgb_front'
            },
            {
                'type': 'sensor.speedometer',
                'reading_frequency': 20,
                'id': 'speed'
            },
        ]
    
    def run_step(self, input_data, timestamp):
        """
        Execute one step of control.
        
        Args:
            input_data: Dict with sensor data
            timestamp: Current simulation time
        
        Returns:
            carla.VehicleControl
        """
        # Get RGB image
        rgb = input_data['rgb_front'][1][:, :, :3]  # Remove alpha channel
        rgb = Image.fromarray(rgb)
        rgb_tensor = self.transform(rgb).unsqueeze(0).to(self.device)
        
        # Get speed (m/s)
        speed_raw = input_data['speed'][1]['speed']
        speed = max(0.0, speed_raw)  # Ensure non-negative
        speed_tensor = torch.tensor([[speed / 30.0]], dtype=torch.float32, device=self.device)
        
        # Debug: print speed every 20 frames
        if not hasattr(self, '_speed_debug_counter'):
            self._speed_debug_counter = 0
        self._speed_debug_counter += 1
        if self._speed_debug_counter % 20 == 0:
            print(f"[CILRS] Frame {self.frame_count}: raw_speed={speed_raw:.3f}, speed={speed:.3f}")
        
        # Get navigation command from route
        command = self._get_navigation_command()
        command_tensor = torch.tensor([command], dtype=torch.long, device=self.device)
        
        # Run model
        with torch.no_grad():
            output = self.model(rgb_tensor, speed_tensor, command_tensor)
        
        # Parse output (steer, throttle, brake)
        steer = float(output[0, 0].cpu().numpy())
        throttle = float(output[0, 1].cpu().numpy())
        brake = float(output[0, 2].cpu().numpy())
        
        # Clamp values
        steer = np.clip(steer, -1.0, 1.0)
        throttle = np.clip(throttle, 0.0, 1.0)
        brake = np.clip(brake, 0.0, 1.0)
        
        # CRITICAL: Throttle and brake are mutually exclusive in CARLA
        # Even tiny brake values can prevent movement
        if throttle > brake:
            brake = 0.0  # Clear brake if we want to accelerate
        elif brake > throttle:
            throttle = 0.0  # Clear throttle if we want to brake
        
        # Boost throttle when stationary
        if speed < 1.0 and brake < 0.1:
            throttle = max(throttle, 0.5)
            brake = 0.0
        elif speed < 5.0 and throttle > 0.01 and brake < 0.1:
            throttle = max(throttle, 0.3)
            brake = 0.0
        
        # CARLA needs a few frames to initialize physics
        # Apply brake during initial frames like TF++ does
        if self.frame_count < 5:
            control = carla.VehicleControl()
            control.steer = 0.0
            control.throttle = 0.0
            control.brake = 1.0
            control.hand_brake = False
            control.reverse = False
            control.manual_gear_shift = False
            if self.debug and self.save_path:
                self._save_debug_frame(rgb, speed, command, 0.0, 0.0, 1.0)
            return control
        
        # Create control
        control = carla.VehicleControl()
        control.steer = steer
        control.throttle = throttle
        control.brake = brake
        control.hand_brake = False
        control.reverse = False
        control.manual_gear_shift = False
        
        # Save debug visualization
        if self.debug and self.save_path:
            self._save_debug_frame(rgb, speed, command, steer, throttle, brake)
        
        return control
    
    def _save_debug_frame(self, rgb_image, speed, command, steer, throttle, brake):
        """Save frame with control overlay for debugging."""
        import cv2
        
        # Convert PIL to numpy
        frame = np.array(rgb_image)
        frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        
        # Resize for better visibility
        frame = cv2.resize(frame, (800, 600))
        
        # Add text overlay
        command_names = ['LEFT', 'RIGHT', 'STRAIGHT', 'FOLLOW']
        cmd_name = command_names[command] if command < 4 else 'UNKNOWN'
        
        info_lines = [
            f"Frame: {self.frame_count}",
            f"Speed: {speed:.1f} m/s",
            f"Command: {cmd_name}",
            f"Steer: {steer:.3f}",
            f"Throttle: {throttle:.3f}",
            f"Brake: {brake:.3f}",
        ]
        
        y_offset = 30
        for line in info_lines:
            cv2.putText(frame, line, (10, y_offset), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            y_offset += 30
        
        # Draw steering indicator
        center_x = frame.shape[1] // 2
        center_y = frame.shape[0] - 50
        steer_x = int(center_x + steer * 100)
        cv2.line(frame, (center_x, center_y), (steer_x, center_y - 30), (0, 0, 255), 3)
        cv2.circle(frame, (center_x, center_y), 5, (255, 255, 255), -1)
        
        # Save frame
        frame_path = os.path.join(self.save_path, f"frame_{self.frame_count:06d}.jpg")
        cv2.imwrite(frame_path, frame)
        self.frame_count += 1
    
    def _get_navigation_command(self):
        """
        Get navigation command from current route.
        
        Returns:
            int: Command index (0=Left, 1=Right, 2=Straight, 3=Follow Lane)
        """
        # Default to follow lane
        if not hasattr(self, '_route') or not self._route:
            return 3  # Follow lane
        
        # Get next waypoint command
        if len(self._route) > 0:
            _, road_option = self._route[0]
            
            # Map RoadOption to command index
            from agents.navigation.local_planner import RoadOption
            command_map = {
                RoadOption.LEFT: 0,
                RoadOption.RIGHT: 1,
                RoadOption.STRAIGHT: 2,
                RoadOption.LANEFOLLOW: 3,
                RoadOption.CHANGELANELEFT: 0,
                RoadOption.CHANGELANERIGHT: 1,
            }
            return command_map.get(road_option, 3)
        
        return 3  # Default: follow lane
    
    def set_global_plan(self, global_plan_gps, global_plan_world_coord):
        """Set the route for navigation commands."""
        super().set_global_plan(global_plan_gps, global_plan_world_coord)
        self._route = list(zip(global_plan_world_coord, 
                               [wp[1] for wp in global_plan_gps]))
    
    def destroy(self, results=None):
        """Cleanup."""
        pass
