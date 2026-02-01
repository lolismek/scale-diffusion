#!/usr/bin/env python3
"""
CILRS Model Evaluation Script

Evaluates trained CILRS models on the validation dataset.
Can compare base (untrained) vs trained models.

Usage:
    cd carla_garage
    
    # Evaluate a single model
    python cilrs_eval.py --model_dir logs/cilrs --checkpoint model_best.pth
    
    # Compare base vs trained
    python cilrs_eval.py --model_dir logs/cilrs --compare
    
    # Evaluate with visualization
    python cilrs_eval.py --model_dir logs/cilrs --checkpoint model_best.pth --visualize
"""

import argparse
import json
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from tqdm import tqdm

try:
    import timm
    HAS_TIMM = True
except ImportError:
    HAS_TIMM = False


# ============================================================================
# Model (same as training)
# ============================================================================

class CILRS(nn.Module):
    """CILRS model - must match training architecture."""
    
    def __init__(
        self,
        backbone: str = "resnet18",
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


# ============================================================================
# Dataset (same as training)
# ============================================================================

class CILRSDataset(Dataset):
    """Dataset for CILRS evaluation."""
    
    def __init__(
        self,
        data_dir: str,
        transform: Optional[transforms.Compose] = None,
        pred_len: int = 4,
        use_waypoints: bool = False,
    ):
        self.data_dir = Path(data_dir)
        self.transform = transform
        self.pred_len = pred_len
        self.use_waypoints = use_waypoints
        
        self.samples = []
        self._load_routes()
        
        print(f"Loaded {len(self.samples)} samples from {data_dir}")
    
    def _load_routes(self):
        for route_dir in sorted(self.data_dir.iterdir()):
            if not route_dir.is_dir() or not route_dir.name.startswith("route_"):
                continue
            
            rgb_dir = route_dir / "rgb_front"
            measurements_file = route_dir / "measurements.json"
            
            if not rgb_dir.exists() or not measurements_file.exists():
                continue
            
            with open(measurements_file) as f:
                measurements = json.load(f)
            
            for i, m in enumerate(measurements):
                frame_idx = m.get("frame", i)
                img_path = rgb_dir / f"{frame_idx:04d}.jpg"
                
                if not img_path.exists():
                    continue
                
                if self.use_waypoints:
                    if i + self.pred_len >= len(measurements):
                        continue
                    future_measurements = measurements[i:i + self.pred_len + 1]
                else:
                    future_measurements = None
                
                self.samples.append({
                    "img_path": img_path,
                    "measurement": m,
                    "future_measurements": future_measurements,
                    "route_dir": route_dir,
                })
    
    def __len__(self):
        return len(self.samples)
    
    def __getitem__(self, idx):
        sample = self.samples[idx]
        
        img = Image.open(sample["img_path"]).convert("RGB")
        if self.transform:
            img = self.transform(img)
        else:
            img = transforms.ToTensor()(img)
        
        m = sample["measurement"]
        speed = torch.tensor([m["speed"] / 30.0], dtype=torch.float32)
        
        command = m.get("command", 4)
        command_idx = max(0, min(3, command - 1))
        
        if self.use_waypoints:
            waypoints = self._compute_waypoints(sample["future_measurements"])
            label = waypoints
        else:
            steer = m.get("steer", 0.0)
            throttle = m.get("throttle", 0.0)
            brake = m.get("brake", 0.0)
            label = torch.tensor([steer, throttle, brake], dtype=torch.float32)
        
        return {
            "image": img,
            "speed": speed,
            "command": torch.tensor(command_idx, dtype=torch.long),
            "label": label,
            "img_path": str(sample["img_path"]),
        }
    
    def _compute_waypoints(self, measurements):
        if measurements is None or len(measurements) < 2:
            return torch.zeros(self.pred_len, 2)
        
        cur = measurements[0]
        cur_x, cur_y = cur["x"], cur["y"]
        cur_theta = cur["theta"]
        
        cos_t = np.cos(-cur_theta)
        sin_t = np.sin(-cur_theta)
        
        waypoints = []
        for m in measurements[1:self.pred_len + 1]:
            dx = m["x"] - cur_x
            dy = m["y"] - cur_y
            local_x = dx * cos_t - dy * sin_t
            local_y = dx * sin_t + dy * cos_t
            waypoints.append([local_x, local_y])
        
        while len(waypoints) < self.pred_len:
            waypoints.append([0.0, 0.0])
        
        return torch.tensor(waypoints, dtype=torch.float32)


# ============================================================================
# Evaluation Functions
# ============================================================================

@torch.no_grad()
def evaluate_model(
    model: nn.Module,
    dataloader: DataLoader,
    device: torch.device,
    desc: str = "Evaluating",
) -> Dict[str, float]:
    """
    Evaluate a model on the dataset.
    
    Returns:
        Dict with metrics: mse, mae, per-output errors, per-command errors
    """
    model.eval()
    
    all_preds = []
    all_labels = []
    all_commands = []
    
    for batch in tqdm(dataloader, desc=desc):
        image = batch["image"].to(device)
        speed = batch["speed"].to(device)
        command = batch["command"].to(device)
        label = batch["label"].to(device)
        
        output = model(image, speed, command)
        
        all_preds.append(output.cpu())
        all_labels.append(label.cpu())
        all_commands.append(command.cpu())
    
    preds = torch.cat(all_preds, dim=0)
    labels = torch.cat(all_labels, dim=0)
    commands = torch.cat(all_commands, dim=0)
    
    # Overall metrics
    mse = F.mse_loss(preds, labels).item()
    mae = F.l1_loss(preds, labels).item()
    
    metrics = {
        "mse": mse,
        "mae": mae,
        "rmse": np.sqrt(mse),
    }
    
    # Per-output metrics (steer, throttle, brake)
    output_names = ["steer", "throttle", "brake"]
    for i, name in enumerate(output_names):
        if i < preds.shape[1]:
            metrics[f"{name}_mse"] = F.mse_loss(preds[:, i], labels[:, i]).item()
            metrics[f"{name}_mae"] = F.l1_loss(preds[:, i], labels[:, i]).item()
    
    # Per-command metrics
    command_names = ["left", "right", "straight", "follow"]
    for cmd_idx, cmd_name in enumerate(command_names):
        mask = commands == cmd_idx
        if mask.sum() > 0:
            cmd_preds = preds[mask]
            cmd_labels = labels[mask]
            metrics[f"cmd_{cmd_name}_mse"] = F.mse_loss(cmd_preds, cmd_labels).item()
            metrics[f"cmd_{cmd_name}_count"] = int(mask.sum())
    
    return metrics


def load_model(
    model_dir: str,
    checkpoint: str,
    device: torch.device,
) -> Tuple[nn.Module, dict]:
    """Load a CILRS model from checkpoint."""
    
    config_path = os.path.join(model_dir, "config.json")
    if os.path.exists(config_path):
        with open(config_path) as f:
            config = json.load(f)
    else:
        config = {"backbone": "resnet18", "output_dim": 3}
    
    backbone = config.get("backbone", "resnet18")
    output_dim = config.get("output_dim", 3)
    
    model = CILRS(
        backbone=backbone,
        num_commands=4,
        output_dim=output_dim,
        pretrained=False,
    ).to(device)
    
    checkpoint_path = os.path.join(model_dir, checkpoint)
    if os.path.exists(checkpoint_path):
        print(f"Loading weights from: {checkpoint_path}")
        state_dict = torch.load(checkpoint_path, map_location=device)
        model.load_state_dict(state_dict)
    else:
        raise FileNotFoundError(f"Checkpoint not found: {checkpoint_path}")
    
    return model, config


def print_metrics(metrics: Dict[str, float], title: str = "Metrics"):
    """Pretty print metrics."""
    print(f"\n{'='*50}")
    print(f" {title}")
    print(f"{'='*50}")
    
    print(f"\n  Overall:")
    print(f"    MSE:  {metrics['mse']:.6f}")
    print(f"    MAE:  {metrics['mae']:.6f}")
    print(f"    RMSE: {metrics['rmse']:.6f}")
    
    print(f"\n  Per-Output:")
    for name in ["steer", "throttle", "brake"]:
        if f"{name}_mse" in metrics:
            print(f"    {name:10s}  MSE: {metrics[f'{name}_mse']:.6f}  MAE: {metrics[f'{name}_mae']:.6f}")
    
    print(f"\n  Per-Command:")
    for cmd in ["left", "right", "straight", "follow"]:
        if f"cmd_{cmd}_mse" in metrics:
            count = metrics.get(f"cmd_{cmd}_count", 0)
            print(f"    {cmd:10s}  MSE: {metrics[f'cmd_{cmd}_mse']:.6f}  (n={count})")
    
    print()


def compare_models(
    base_metrics: Dict[str, float],
    trained_metrics: Dict[str, float],
):
    """Print comparison between base and trained model."""
    print(f"\n{'='*60}")
    print(f" Model Comparison: Base vs Trained")
    print(f"{'='*60}")
    
    print(f"\n  {'Metric':<20} {'Base':>12} {'Trained':>12} {'Improvement':>15}")
    print(f"  {'-'*59}")
    
    for key in ["mse", "mae", "rmse", "steer_mse", "throttle_mse", "brake_mse"]:
        if key in base_metrics and key in trained_metrics:
            base_val = base_metrics[key]
            trained_val = trained_metrics[key]
            improvement = (base_val - trained_val) / base_val * 100 if base_val > 0 else 0
            sign = "+" if improvement > 0 else ""
            print(f"  {key:<20} {base_val:>12.6f} {trained_val:>12.6f} {sign}{improvement:>13.1f}%")
    
    print()


def main():
    parser = argparse.ArgumentParser(description="Evaluate CILRS model")
    parser.add_argument("--model_dir", type=str, default="logs/cilrs",
                        help="Path to model directory")
    parser.add_argument("--checkpoint", type=str, default="model_best.pth",
                        help="Checkpoint filename to evaluate")
    parser.add_argument("--data_dir", type=str, default="cilrs_dataset",
                        help="Path to dataset directory")
    parser.add_argument("--batch_size", type=int, default=32,
                        help="Batch size")
    parser.add_argument("--num_workers", type=int, default=4,
                        help="DataLoader workers")
    parser.add_argument("--compare", action="store_true",
                        help="Compare base model vs trained model")
    parser.add_argument("--save_results", type=str, default=None,
                        help="Save results to JSON file")
    
    args = parser.parse_args()
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")
    
    # Load config to get settings
    config_path = os.path.join(args.model_dir, "config.json")
    if os.path.exists(config_path):
        with open(config_path) as f:
            config = json.load(f)
    else:
        config = {}
    
    use_waypoints = config.get("use_waypoints", False)
    pred_len = config.get("pred_len", 4)
    
    # Data transforms
    transform = transforms.Compose([
        transforms.Resize((256, 256)),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225]
        ),
    ])
    
    # Load dataset
    dataset = CILRSDataset(
        data_dir=args.data_dir,
        transform=transform,
        pred_len=pred_len,
        use_waypoints=use_waypoints,
    )
    
    dataloader = DataLoader(
        dataset,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        pin_memory=True,
    )
    
    results = {}
    
    if args.compare:
        # Compare base vs trained
        print("\n" + "="*60)
        print(" Evaluating BASE model (before training)")
        print("="*60)
        
        base_model, _ = load_model(args.model_dir, "model_base.pth", device)
        base_metrics = evaluate_model(base_model, dataloader, device, "Evaluating base")
        print_metrics(base_metrics, "Base Model (Untrained)")
        results["base"] = base_metrics
        
        print("\n" + "="*60)
        print(" Evaluating TRAINED model")
        print("="*60)
        
        trained_model, _ = load_model(args.model_dir, "model_best.pth", device)
        trained_metrics = evaluate_model(trained_model, dataloader, device, "Evaluating trained")
        print_metrics(trained_metrics, "Trained Model (Best)")
        results["trained"] = trained_metrics
        
        # Print comparison
        compare_models(base_metrics, trained_metrics)
        
    else:
        # Evaluate single checkpoint
        print(f"\nEvaluating: {args.model_dir}/{args.checkpoint}")
        
        model, config = load_model(args.model_dir, args.checkpoint, device)
        metrics = evaluate_model(model, dataloader, device)
        print_metrics(metrics, f"Model: {args.checkpoint}")
        results[args.checkpoint] = metrics
    
    # Save results if requested
    if args.save_results:
        with open(args.save_results, "w") as f:
            json.dump(results, f, indent=2)
        print(f"Results saved to: {args.save_results}")


if __name__ == "__main__":
    main()
