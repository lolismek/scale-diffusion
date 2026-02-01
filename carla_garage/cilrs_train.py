#!/usr/bin/env python3
"""
Simple CILRS Training Script

Trains a Conditional Imitation Learning (CIL) model on extracted driving data.
Input: RGB image + speed + command
Output: steer, throttle, brake

Usage:
    cd carla_garage
    python cilrs_train.py --data_dir cilrs_dataset --logdir logs/cilrs_exp1

For multi-GPU:
    torchrun --nproc_per_node=2 cilrs_train.py --data_dir cilrs_dataset --logdir logs/cilrs_exp1
"""

import argparse
import json
import os
from pathlib import Path
from typing import Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from torch.utils.data import Dataset, DataLoader
from torch.utils.tensorboard import SummaryWriter
from torchvision import transforms
from tqdm import tqdm

try:
    import timm
    HAS_TIMM = True
except ImportError:
    HAS_TIMM = False


def load_tfpp_image_encoder(cilrs_model, tfpp_checkpoint_path: str, device):
    """
    Load image encoder weights from a TF++ checkpoint into CILRS model.
    
    TF++ uses timm's regnety_032 as image_encoder. We extract those weights
    and load them into our CILRS encoder.
    """
    print(f"Loading TF++ image encoder from: {tfpp_checkpoint_path}")
    
    # Load TF++ checkpoint
    tfpp_state = torch.load(tfpp_checkpoint_path, map_location=device)
    
    # Extract image_encoder weights (keys start with "backbone.image_encoder.")
    encoder_prefix = "backbone.image_encoder."
    encoder_weights = {}
    
    for key, value in tfpp_state.items():
        if key.startswith(encoder_prefix):
            # Remove prefix to match our encoder's keys
            new_key = key[len(encoder_prefix):]
            encoder_weights[new_key] = value
    
    if not encoder_weights:
        print("  Warning: No image_encoder weights found in checkpoint!")
        print(f"  Available keys (first 10): {list(tfpp_state.keys())[:10]}")
        return False
    
    print(f"  Found {len(encoder_weights)} encoder weight tensors")
    
    # Try to load into our model's encoder
    if HAS_TIMM:
        # Our encoder is a timm model
        missing, unexpected = cilrs_model.encoder.load_state_dict(encoder_weights, strict=False)
        if missing:
            print(f"  Missing keys: {len(missing)} (expected for different architectures)")
        if unexpected:
            print(f"  Unexpected keys: {len(unexpected)}")
    else:
        # Fallback encoder - try partial load
        try:
            cilrs_model.encoder.load_state_dict(encoder_weights, strict=False)
        except Exception as e:
            print(f"  Could not load encoder weights: {e}")
            return False
    
    print("  Successfully loaded TF++ image encoder!")
    return True


# ============================================================================
# Dataset
# ============================================================================

class CILRSDataset(Dataset):
    """
    Dataset for CILRS training.
    
    Expects directory structure:
        data_dir/
        ├── route_xxx/
        │   ├── rgb_front/
        │   │   ├── 0000.jpg
        │   │   └── ...
        │   └── measurements.json
        └── ...
    
    measurements.json format:
        [{"frame": 0, "x": ..., "y": ..., "theta": ..., "speed": ..., 
          "command": 1-4, "steer": ..., "throttle": ..., "brake": ...}, ...]
    """
    
    def __init__(
        self,
        data_dir: str,
        transform: Optional[transforms.Compose] = None,
        pred_len: int = 4,  # Number of future waypoints to predict
        use_waypoints: bool = False,  # If True, predict waypoints; else predict controls
    ):
        self.data_dir = Path(data_dir)
        self.transform = transform
        self.pred_len = pred_len
        self.use_waypoints = use_waypoints
        
        # Collect all samples
        self.samples = []
        self._load_routes()
        
        print(f"Loaded {len(self.samples)} samples from {data_dir}")
    
    def _load_routes(self):
        """Load all routes from the data directory."""
        for route_dir in sorted(self.data_dir.iterdir()):
            if not route_dir.is_dir() or not route_dir.name.startswith("route_"):
                continue
            
            rgb_dir = route_dir / "rgb_front"
            measurements_file = route_dir / "measurements.json"
            
            if not rgb_dir.exists() or not measurements_file.exists():
                print(f"Skipping {route_dir.name}: missing rgb_front or measurements.json")
                continue
            
            # Load measurements
            with open(measurements_file) as f:
                measurements = json.load(f)
            
            # Create samples
            for i, m in enumerate(measurements):
                frame_idx = m.get("frame", i)
                img_path = rgb_dir / f"{frame_idx:04d}.jpg"
                
                if not img_path.exists():
                    continue
                
                # For waypoint prediction, we need future frames
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
        
        # Load image
        img = Image.open(sample["img_path"]).convert("RGB")
        if self.transform:
            img = self.transform(img)
        else:
            img = transforms.ToTensor()(img)
        
        m = sample["measurement"]
        
        # Speed (normalized to ~0-1 range, assuming max speed ~30 m/s)
        speed = torch.tensor([m["speed"] / 30.0], dtype=torch.float32)
        
        # Command (1-4) -> one-hot or index
        command = m.get("command", 4)
        command_idx = max(0, min(3, command - 1))  # Convert 1-4 to 0-3
        
        if self.use_waypoints:
            # Compute relative waypoints from global positions
            waypoints = self._compute_waypoints(sample["future_measurements"])
            label = waypoints
        else:
            # Control outputs
            steer = m.get("steer", 0.0)
            throttle = m.get("throttle", 0.0)
            brake = m.get("brake", 0.0)
            label = torch.tensor([steer, throttle, brake], dtype=torch.float32)
        
        return {
            "image": img,
            "speed": speed,
            "command": torch.tensor(command_idx, dtype=torch.long),
            "label": label,
        }
    
    def _compute_waypoints(self, measurements):
        """
        Compute ego-centric waypoints from global measurements.
        
        Transforms future global positions to the current vehicle's
        local coordinate frame.
        """
        if measurements is None or len(measurements) < 2:
            return torch.zeros(self.pred_len, 2)
        
        # Current position and orientation
        cur = measurements[0]
        cur_x, cur_y = cur["x"], cur["y"]
        cur_theta = cur["theta"]
        
        # Rotation matrix to transform to ego-centric frame
        cos_t = np.cos(-cur_theta)
        sin_t = np.sin(-cur_theta)
        
        waypoints = []
        for m in measurements[1:self.pred_len + 1]:
            # Global position difference
            dx = m["x"] - cur_x
            dy = m["y"] - cur_y
            
            # Rotate to ego-centric frame
            local_x = dx * cos_t - dy * sin_t
            local_y = dx * sin_t + dy * cos_t
            
            waypoints.append([local_x, local_y])
        
        # Pad if needed
        while len(waypoints) < self.pred_len:
            waypoints.append([0.0, 0.0])
        
        return torch.tensor(waypoints, dtype=torch.float32)


# ============================================================================
# Model
# ============================================================================

class CILRS(nn.Module):
    """
    Conditional Imitation Learning with ResNet and Speed.
    
    Architecture:
    - Image encoder (ResNet or similar)
    - Speed embedding
    - Command-conditional branches (4 branches for 4 commands)
    - Output: controls (steer, throttle, brake) or waypoints
    """
    
    def __init__(
        self,
        backbone: str = "resnet18",
        num_commands: int = 4,
        output_dim: int = 3,  # 3 for controls, or pred_len*2 for waypoints
        pretrained: bool = True,
    ):
        super().__init__()
        
        self.num_commands = num_commands
        self.output_dim = output_dim
        
        # Image encoder
        if HAS_TIMM:
            self.encoder = timm.create_model(backbone, pretrained=pretrained, num_classes=0)
            self.feature_dim = self.encoder.num_features
        else:
            # Fallback to torchvision
            import torchvision.models as models
            if backbone == "resnet18":
                base = models.resnet18(pretrained=pretrained)
            elif backbone == "resnet34":
                base = models.resnet34(pretrained=pretrained)
            else:
                base = models.resnet18(pretrained=pretrained)
            
            self.encoder = nn.Sequential(*list(base.children())[:-1])
            self.feature_dim = 512
        
        # Speed embedding
        self.speed_embed = nn.Sequential(
            nn.Linear(1, 64),
            nn.ReLU(),
            nn.Linear(64, 64),
        )
        
        # Fusion layer
        self.fusion = nn.Sequential(
            nn.Linear(self.feature_dim + 64, 512),
            nn.ReLU(),
            nn.Dropout(0.2),
        )
        
        # Command-conditional branches (one per command)
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
        """
        Args:
            image: (B, 3, H, W)
            speed: (B, 1)
            command: (B,) indices 0-3
        
        Returns:
            output: (B, output_dim) - controls or waypoints
        """
        # Encode image
        if HAS_TIMM:
            img_feat = self.encoder(image)  # (B, feature_dim)
        else:
            img_feat = self.encoder(image)
            img_feat = img_feat.view(img_feat.size(0), -1)
        
        # Encode speed
        speed_feat = self.speed_embed(speed)  # (B, 64)
        
        # Fuse features
        fused = torch.cat([img_feat, speed_feat], dim=1)
        fused = self.fusion(fused)  # (B, 512)
        
        # Apply command-conditional branches
        # We compute all branches and select based on command
        batch_size = image.size(0)
        outputs = torch.zeros(batch_size, self.output_dim, device=image.device)
        
        for i in range(self.num_commands):
            mask = (command == i)
            if mask.any():
                branch_output = self.branches[i](fused[mask])
                outputs[mask] = branch_output
        
        return outputs


# ============================================================================
# Training
# ============================================================================

def train_epoch(model, dataloader, optimizer, device, epoch, writer=None):
    model.train()
    total_loss = 0
    num_batches = 0
    
    pbar = tqdm(dataloader, desc=f"Epoch {epoch}")
    for batch in pbar:
        image = batch["image"].to(device)
        speed = batch["speed"].to(device)
        command = batch["command"].to(device)
        label = batch["label"].to(device)
        
        optimizer.zero_grad()
        
        output = model(image, speed, command)
        loss = F.mse_loss(output, label)
        
        loss.backward()
        optimizer.step()
        
        total_loss += loss.item()
        num_batches += 1
        
        pbar.set_postfix({"loss": loss.item()})
    
    avg_loss = total_loss / num_batches
    
    if writer:
        writer.add_scalar("train/loss", avg_loss, epoch)
    
    return avg_loss


@torch.no_grad()
def validate(model, dataloader, device, epoch, writer=None):
    model.eval()
    total_loss = 0
    num_batches = 0
    
    for batch in dataloader:
        image = batch["image"].to(device)
        speed = batch["speed"].to(device)
        command = batch["command"].to(device)
        label = batch["label"].to(device)
        
        output = model(image, speed, command)
        loss = F.mse_loss(output, label)
        
        total_loss += loss.item()
        num_batches += 1
    
    avg_loss = total_loss / num_batches
    
    if writer:
        writer.add_scalar("val/loss", avg_loss, epoch)
    
    return avg_loss


def main():
    parser = argparse.ArgumentParser(description="Train CILRS model")
    parser.add_argument("--data_dir", type=str, default="cilrs_dataset",
                        help="Path to dataset directory")
    parser.add_argument("--logdir", type=str, default="logs/cilrs",
                        help="Directory for logs and checkpoints")
    parser.add_argument("--epochs", type=int, default=10,
                        help="Number of training epochs")
    parser.add_argument("--batch_size", type=int, default=32,
                        help="Batch size")
    parser.add_argument("--lr", type=float, default=1e-4,
                        help="Learning rate")
    parser.add_argument("--backbone", type=str, default="resnet18",
                        help="Image encoder backbone")
    parser.add_argument("--use_waypoints", action="store_true",
                        help="Predict waypoints instead of controls")
    parser.add_argument("--pred_len", type=int, default=4,
                        help="Number of waypoints to predict")
    parser.add_argument("--val_split", type=float, default=0.1,
                        help="Validation split ratio")
    parser.add_argument("--num_workers", type=int, default=4,
                        help="DataLoader workers")
    parser.add_argument("--save_every", type=int, default=5,
                        help="Save checkpoint every N epochs")
    parser.add_argument("--load_tfpp_encoder", type=str, default=None,
                        help="Path to TF++ checkpoint to load image encoder from (e.g., pretrained_models/pretrained_models/town13_withheld/model_0030_0.pth)")
    
    args = parser.parse_args()
    
    # Setup device
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")
    
    # Create logdir
    os.makedirs(args.logdir, exist_ok=True)
    
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
    output_dim = args.pred_len * 2 if args.use_waypoints else 3
    
    full_dataset = CILRSDataset(
        data_dir=args.data_dir,
        transform=transform,
        pred_len=args.pred_len,
        use_waypoints=args.use_waypoints,
    )
    
    # Split into train/val
    val_size = int(len(full_dataset) * args.val_split)
    train_size = len(full_dataset) - val_size
    train_dataset, val_dataset = torch.utils.data.random_split(
        full_dataset, [train_size, val_size]
    )
    
    print(f"Train samples: {len(train_dataset)}, Val samples: {len(val_dataset)}")
    
    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.num_workers,
        pin_memory=True,
    )
    
    val_loader = DataLoader(
        val_dataset,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        pin_memory=True,
    )
    
    # Create model
    # If loading TF++ encoder, use matching backbone (regnety_032)
    if args.load_tfpp_encoder:
        backbone = "regnety_032"
        pretrained = False  # We'll load weights from TF++
        print(f"Using regnety_032 backbone to match TF++ encoder")
    else:
        backbone = args.backbone
        pretrained = True
    
    model = CILRS(
        backbone=backbone,
        num_commands=4,
        output_dim=output_dim,
        pretrained=pretrained,
    ).to(device)
    
    # Load TF++ image encoder if specified
    if args.load_tfpp_encoder:
        success = load_tfpp_image_encoder(model, args.load_tfpp_encoder, device)
        if not success:
            print("Warning: Failed to load TF++ encoder, using random initialization")
    
    num_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Model parameters: {num_params:,}")
    
    # Optimizer and scheduler
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    
    # Tensorboard
    writer = SummaryWriter(log_dir=args.logdir)
    
    # Save config (includes model architecture info for evaluation)
    config = vars(args).copy()
    config["backbone"] = backbone  # Use actual backbone (may be overridden for TF++)
    config["output_dim"] = output_dim
    with open(os.path.join(args.logdir, "config.json"), "w") as f:
        json.dump(config, f, indent=2)
    
    # Save base model (before any training) for comparison
    base_model_path = os.path.join(args.logdir, "model_base.pth")
    torch.save(model.state_dict(), base_model_path)
    print(f"Saved base model (before training): {base_model_path}")
    
    # Training loop
    best_val_loss = float("inf")
    
    for epoch in range(args.epochs):
        train_loss = train_epoch(model, train_loader, optimizer, device, epoch, writer)
        val_loss = validate(model, val_loader, device, epoch, writer)
        
        scheduler.step()
        
        print(f"Epoch {epoch}: train_loss={train_loss:.4f}, val_loss={val_loss:.4f}")
        
        # Save checkpoint
        if (epoch + 1) % args.save_every == 0:
            checkpoint_path = os.path.join(args.logdir, f"model_{epoch:04d}.pth")
            torch.save(model.state_dict(), checkpoint_path)
            print(f"Saved checkpoint: {checkpoint_path}")
        
        # Save best model
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_path = os.path.join(args.logdir, "model_best.pth")
            torch.save(model.state_dict(), best_path)
            print(f"New best model: val_loss={val_loss:.4f}")
    
    writer.close()
    print("Training complete!")


if __name__ == "__main__":
    main()
