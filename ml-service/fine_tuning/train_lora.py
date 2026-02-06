#!/usr/bin/env python3
"""
Fine-tune Qwen2-VL for receipt extraction using LoRA.

LoRA (Low-Rank Adaptation) enables efficient fine-tuning by:
- Only training ~0.1% of parameters
- Reducing memory usage by 4-8x
- Enabling fine-tuning on consumer hardware

Usage:
    python train_lora.py --model Qwen/Qwen2-VL-7B-Instruct --data datasets/train.json
"""

import argparse
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import torch
from datasets import Dataset
from PIL import Image
from peft import LoraConfig, get_peft_model, TaskType
from transformers import (
    AutoProcessor,
    Qwen2VLForConditionalGeneration,
    TrainingArguments,
    Trainer,
    DataCollatorWithPadding,
)
import base64
from io import BytesIO


@dataclass
class LoRATrainingConfig:
    """Configuration for LoRA fine-tuning."""

    # Model
    model_name: str = "Qwen/Qwen2-VL-7B-Instruct"
    use_flash_attention: bool = True

    # LoRA parameters
    lora_r: int = 16  # Rank (higher = more capacity, more memory)
    lora_alpha: int = 32  # Scaling factor
    lora_dropout: float = 0.05
    target_modules: list = field(default_factory=lambda: [
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj"
    ])

    # Training
    learning_rate: float = 2e-4
    num_epochs: int = 3
    batch_size: int = 1
    gradient_accumulation_steps: int = 8
    warmup_ratio: float = 0.1
    weight_decay: float = 0.01
    max_grad_norm: float = 1.0

    # Data
    max_length: int = 2048
    train_data: str = "datasets/train.json"
    val_data: str = "datasets/val.json"

    # Output
    output_dir: str = "checkpoints"
    save_steps: int = 100
    eval_steps: int = 50
    logging_steps: int = 10


def load_training_data(data_path: str, processor) -> Dataset:
    """Load and prepare training data."""

    with open(data_path) as f:
        examples = json.load(f)

    def process_example(example):
        """Process a single training example."""

        # Decode image from base64
        image_data = base64.b64decode(example["image"])
        image = Image.open(BytesIO(image_data)).convert("RGB")

        # Get conversation
        conversations = example["conversations"]
        user_msg = conversations[0]
        assistant_msg = conversations[1]

        # Extract text from user message
        user_text = ""
        for content in user_msg["content"]:
            if content["type"] == "text":
                user_text = content["text"]
                break

        # Format for Qwen2-VL
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": user_text},
                ]
            },
            {
                "role": "assistant",
                "content": assistant_msg["content"]
            }
        ]

        # Apply chat template
        text = processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=False
        )

        # Tokenize
        inputs = processor(
            text=[text],
            images=[image],
            padding="max_length",
            truncation=True,
            max_length=2048,
            return_tensors="pt",
        )

        # Flatten batch dimension
        inputs = {k: v.squeeze(0) for k, v in inputs.items()}

        # Create labels (same as input_ids for causal LM)
        inputs["labels"] = inputs["input_ids"].clone()

        return inputs

    # Process all examples
    processed = []
    for example in examples:
        try:
            processed.append(process_example(example))
        except Exception as e:
            print(f"Error processing example {example.get('id')}: {e}")

    # Convert to Dataset
    if not processed:
        raise ValueError("No examples could be processed!")

    # Create dataset from list of dicts
    dataset = Dataset.from_list(processed)

    return dataset


def setup_lora(model, config: LoRATrainingConfig):
    """Apply LoRA configuration to model."""

    lora_config = LoraConfig(
        r=config.lora_r,
        lora_alpha=config.lora_alpha,
        lora_dropout=config.lora_dropout,
        target_modules=config.target_modules,
        task_type=TaskType.CAUSAL_LM,
        bias="none",
    )

    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    return model


def train(config: LoRATrainingConfig):
    """Run the fine-tuning process."""

    print("="*60)
    print("Receipt OCR Fine-Tuning with LoRA")
    print("="*60)

    # Determine device
    if torch.backends.mps.is_available():
        device = "mps"
        dtype = torch.float32
    elif torch.cuda.is_available():
        device = "cuda"
        dtype = torch.float16
    else:
        device = "cpu"
        dtype = torch.float32

    print(f"Device: {device}, dtype: {dtype}")

    # Load processor
    print(f"\nLoading processor from {config.model_name}...")
    processor = AutoProcessor.from_pretrained(
        config.model_name,
        trust_remote_code=True,
    )

    # Load model
    print(f"Loading model from {config.model_name}...")
    model = Qwen2VLForConditionalGeneration.from_pretrained(
        config.model_name,
        torch_dtype=dtype,
        device_map="auto",
        trust_remote_code=True,
        low_cpu_mem_usage=True,
    )

    # Apply LoRA
    print("\nApplying LoRA...")
    model = setup_lora(model, config)

    # Load data
    print(f"\nLoading training data from {config.train_data}...")
    train_dataset = load_training_data(config.train_data, processor)
    print(f"Training examples: {len(train_dataset)}")

    val_dataset = None
    if Path(config.val_data).exists():
        print(f"Loading validation data from {config.val_data}...")
        val_dataset = load_training_data(config.val_data, processor)
        print(f"Validation examples: {len(val_dataset)}")

    # Training arguments
    training_args = TrainingArguments(
        output_dir=config.output_dir,
        num_train_epochs=config.num_epochs,
        per_device_train_batch_size=config.batch_size,
        per_device_eval_batch_size=config.batch_size,
        gradient_accumulation_steps=config.gradient_accumulation_steps,
        learning_rate=config.learning_rate,
        warmup_ratio=config.warmup_ratio,
        weight_decay=config.weight_decay,
        max_grad_norm=config.max_grad_norm,
        logging_steps=config.logging_steps,
        save_steps=config.save_steps,
        eval_steps=config.eval_steps if val_dataset else None,
        evaluation_strategy="steps" if val_dataset else "no",
        save_total_limit=3,
        load_best_model_at_end=True if val_dataset else False,
        report_to="none",  # Disable wandb/tensorboard for now
        fp16=dtype == torch.float16,
        dataloader_pin_memory=False,  # Required for MPS
        remove_unused_columns=False,
    )

    # Create trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
    )

    # Train
    print("\n" + "="*60)
    print("Starting training...")
    print("="*60)

    trainer.train()

    # Save final model
    final_path = Path(config.output_dir) / "final"
    print(f"\nSaving final model to {final_path}...")
    trainer.save_model(str(final_path))
    processor.save_pretrained(str(final_path))

    print("\n" + "="*60)
    print("Training complete!")
    print("="*60)
    print(f"Model saved to: {final_path}")
    print("\nTo use the fine-tuned model:")
    print(f"  from peft import PeftModel")
    print(f"  model = PeftModel.from_pretrained(base_model, '{final_path}')")


def main():
    parser = argparse.ArgumentParser(description="Fine-tune Qwen2-VL with LoRA")

    parser.add_argument("--model", default="Qwen/Qwen2-VL-7B-Instruct",
                       help="Base model to fine-tune")
    parser.add_argument("--data", default="datasets/train.json",
                       help="Training data file")
    parser.add_argument("--val-data", default="datasets/val.json",
                       help="Validation data file")
    parser.add_argument("--output", default="checkpoints",
                       help="Output directory")
    parser.add_argument("--epochs", type=int, default=3,
                       help="Number of training epochs")
    parser.add_argument("--lr", type=float, default=2e-4,
                       help="Learning rate")
    parser.add_argument("--batch-size", type=int, default=1,
                       help="Batch size per device")
    parser.add_argument("--lora-r", type=int, default=16,
                       help="LoRA rank")

    args = parser.parse_args()

    config = LoRATrainingConfig(
        model_name=args.model,
        train_data=args.data,
        val_data=args.val_data,
        output_dir=args.output,
        num_epochs=args.epochs,
        learning_rate=args.lr,
        batch_size=args.batch_size,
        lora_r=args.lora_r,
    )

    train(config)


if __name__ == "__main__":
    main()
