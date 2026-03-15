# AI Native Core — Local Models (Ollama)

This guide documents the local LLM and embedding models supported via Ollama.

## Choosing a Vision Model

Vision models allow the assistant to "see" and analyze images.

| Model Name | Size | RAM Required | Vision? | Command | Notes |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **qwen2.5-vl:3b** | 2.2 GB | ~5-6 GB | ✅ | `ollama pull qwen2.5-vl:3b` | **Top Pick for 8-12GB RAM.** Excellent OCR and reasoning. |
| **moondream** | 1.1 GB | ~3-4 GB | ✅ | `ollama pull moondream` | Very fast, tiny, surprisingly capable for its size. |
| **qwen2-vl:7b** | 4.7 GB | ~9-11 GB | ✅ | `ollama pull qwen2-vl:7b` | High quality, but very heavy on memory during analysis. |
| **llama3.2-vision** | 7.9 GB | ~11-12 GB | ✅ | `ollama pull llama3.2-vision` | High quality, but requires 16GB+ RAM to run reliably. |
| **llava** | 4.7 GB | ~8 GB | ✅ | `ollama pull llava` | Popular open-source vision-language model. |

## Choosing a General/Reasoning Model

| Model Name | Size | RAM Required | Intelligence | Speed | Command |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **qwen2.5:7b** | 4.7 GB | ~8 GB | ⭐⭐⭐⭐⭐ | ⚡⚡⚡ | `ollama pull qwen2.5:7b` | **Best all-rounder.** High IQ, great logic. |
| **llama3.1:8b** | 4.9 GB | ~8 GB | ⭐⭐⭐⭐ | ⚡⚡⚡ | `ollama pull llama3.1:8b` | Very balanced, great instruction following. |
| **phi4** | 9.1 GB | ~12-14 GB | ⭐⭐⭐⭐⭐ | ⚡⚡ | `ollama pull phi4` | **Highest IQ** under 20B. Microsoft's logic powerhouse. |
| **qwen2.5:3b** | 2.0 GB | ~4 GB | ⭐⭐⭐ | ⚡⚡⚡⚡⚡ | `ollama pull qwen2.5:3b` | Blazing fast. Smarter than most 3B models. |
| **llama3.2** | 2.0 GB | ~4 GB | ⭐⭐⭐ | ⚡⚡⚡⚡⚡ | `ollama pull llama3.2` | Great for basic chat/tools on low-end hardware. |

## Choosing a Coding Model

If you are using this project primarily for software engineering tasks:

| Model Name | Size | RAM Required | Command | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **qwen2.5-coder:7b** | 4.7 GB | ~8 GB | `ollama pull qwen2.5-coder:7b` | **Top recommendation.** Beats most models in coding. |
| **qwen2.5-coder:3b** | 2.0 GB | ~4 GB | `ollama pull qwen2.5-coder:3b` | Great for fast autocomplete or light refactoring. |

## Memory & Performance Guide (2025)

### The "Rule of Thumb" for RAM
Ollama defaults to **4-bit quantization (Q4_K_M)**. To estimate the total RAM needed (including OS overhead and context window):
> **Total RAM ≈ (Parameters / 1.5) + 2GB**

### Hardware Recommendations
- **8GB RAM:** Stick to 3B models (`llama3.2`, `qwen2.5:3b`, `moondream`).
- **12GB-16GB RAM:** The "sweet spot" for 7B/8B models (`qwen2.5:7b`, `llama3.1:8b`).
- **24GB+ RAM:** Required for 14B+ models (`phi4`) or long context windows (32k+ tokens).

## Embedding Models

Used for RAG (Retrieval-Augmented Generation) and episodic memory.

| Model Name | Size | Type | Command |
| :--- | :--- | :--- | :--- |
| **nomic-embed-text** | 274 MB | Text | `ollama pull nomic-embed-text` | High-performance open embedding model. |

## Audio & Image Models (OpenAI)

Multi-modal capabilities (transcription, TTS, image generation) require `LLM_PROVIDER=openai`.

| Capability | Default Model | Env Var | Notes |
| :--- | :--- | :--- | :--- |
| **Transcription** | `whisper-1` | `OPENAI_TRANSCRIBE_MODEL` | `POST /media/transcribe` — audio file → text |
| **Text-to-Speech** | `tts-1` | `OPENAI_TTS_MODEL` | `POST /media/tts` — text → MP3 stream. Use `tts-1-hd` for higher quality. |
| **Image Generation** | `dall-e-3` | `OPENAI_IMAGE_MODEL` | `GenerateImageTool` — text prompt → image URL |

### TTS Voices

Available values for the `voice` field in `POST /media/tts`:
`alloy` · `echo` · `fable` · `onyx` · `nova` · `shimmer`

## Configuration

Update your `.env` file to switch between models:

```bash
# Example for balanced 16GB RAM environment
LLM_PROVIDER=ollama
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_EMBED_MODEL=nomic-embed-text
```

```bash
# Example for cloud providers with multi-modal support
LLM_PROVIDER=openai
OPENAI_MODEL=gpt-4o
OPENAI_TRANSCRIBE_MODEL=whisper-1
OPENAI_TTS_MODEL=tts-1
OPENAI_IMAGE_MODEL=dall-e-3
```

## Running Models

Ensure Ollama is running (locally or via Docker). Then run:

```bash
# If using Docker
docker compose up -d ollama
docker compose exec ollama ollama pull <model-name>

# If running locally
ollama pull <model-name>
```
