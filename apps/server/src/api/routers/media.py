import structlog
from ai import get_llm
from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

log = structlog.get_logger()
router = APIRouter(prefix="/media", tags=["media"])


class TTSRequest(BaseModel):
    text: str
    voice: str = "alloy"


@router.post("/transcribe")
async def transcribe(file: UploadFile) -> dict[str, str]:
    """Transcribe an uploaded audio file to text using Whisper."""
    llm = get_llm()
    audio_bytes = await file.read()
    filename = file.filename or "audio.webm"

    try:
        text = await llm.transcribe(audio_bytes, filename=filename)
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except Exception as exc:
        log.error("media.transcribe.error", error=str(exc))
        raise HTTPException(status_code=500, detail="Transcription failed") from exc

    log.info("media.transcribe.success", filename=filename, length=len(text))
    return {"text": text}


@router.post("/tts")
async def text_to_speech(req: TTSRequest) -> StreamingResponse:
    """Stream TTS audio for the given text."""
    llm = get_llm()

    try:
        audio_stream = llm.synthesize(req.text, voice=req.voice)
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc

    async def generate():
        try:
            async for chunk in audio_stream:
                yield chunk
        except Exception as exc:
            log.error("media.tts.error", error=str(exc))

    log.info("media.tts.start", voice=req.voice, text_length=len(req.text))
    return StreamingResponse(generate(), media_type="audio/mpeg")
