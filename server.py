import io
import json
import logging
import threading
import wave
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from importlib.util import find_spec
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent
MODEL_ID = "openai/whisper-tiny"
SAMPLE_RATE = 16_000
MAX_AUDIO_BYTES = 8 * 1024 * 1024
MAX_AUDIO_SECONDS = 60
TRANSCRIPTION_CONTEXT = "Voxora sales conversation about CRM, leads, budgets, product demos and appointments."
LANGUAGES = {
    "en-US": "english",
    "es-ES": "spanish",
    "fr-FR": "french",
    "hi-IN": "hindi",
}

_processor = None
_model = None
_model_lock = threading.Lock()
_inference_lock = threading.Lock()


class VoxoraHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if urlparse(self.path).path == "/api/health":
            ready = all(find_spec(name) is not None for name in ("numpy", "torch", "transformers"))
            self.send_json(
                200,
                {
                    "ready": ready,
                    "model": MODEL_ID,
                    "modelLoaded": _model is not None,
                    "message": "" if ready else "Install project dependencies with: python -m pip install -r requirements.txt",
                },
            )
            return
        super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != "/api/transcribe":
            self.send_json(404, {"error": "Endpoint not found."})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_json(400, {"error": "A valid Content-Length header is required."})
            return
        if content_length <= 0:
            self.send_json(400, {"error": "The audio recording is empty."})
            return
        if content_length > MAX_AUDIO_BYTES:
            self.send_json(413, {"error": "Recording is too large. Keep voice messages under one minute."})
            return
        if self.headers.get_content_type() != "audio/wav":
            self.send_json(415, {"error": "Send the recording as WAV audio."})
            return

        query = parse_qs(urlparse(self.path).query)
        locale = query.get("language", ["en-US"])[0]
        language = LANGUAGES.get(locale)
        if language is None:
            self.send_json(400, {"error": "That transcription language is not supported."})
            return

        audio_bytes = self.rfile.read(content_length)
        try:
            with wave.open(io.BytesIO(audio_bytes), "rb") as audio_file:
                if audio_file.getcomptype() != "NONE" or audio_file.getsampwidth() != 2:
                    raise ValueError("Audio must use uncompressed 16-bit PCM.")
                if audio_file.getnchannels() != 1 or audio_file.getframerate() != SAMPLE_RATE:
                    raise ValueError("Audio must be mono at 16 kHz.")
                frame_count = audio_file.getnframes()
                if frame_count == 0 or frame_count > SAMPLE_RATE * MAX_AUDIO_SECONDS:
                    raise ValueError("Recording must be nonempty and no longer than 60 seconds.")
                frames = audio_file.readframes(frame_count)
        except (wave.Error, EOFError, ValueError) as error:
            self.send_json(400, {"error": str(error)})
            return

        try:
            import numpy as np

            samples = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
            processor, model = get_model()
            inputs = processor(samples, sampling_rate=SAMPLE_RATE, return_tensors="pt")
            prompt_ids = processor.get_prompt_ids(TRANSCRIPTION_CONTEXT, return_tensors="pt")
            import torch

            with _inference_lock, torch.inference_mode():
                output = model.generate(
                    inputs.input_features,
                    language=language,
                    task="transcribe",
                    prompt_ids=prompt_ids,
                    max_new_tokens=160,
                )
            text = processor.batch_decode(output, skip_special_tokens=True, clean_up_tokenization_spaces=False)[0].strip()
        except (ImportError, OSError, RuntimeError, ValueError) as error:
            logging.exception("Local Whisper transcription failed.")
            self.send_json(
                503,
                {
                    "error": (
                        f"Local Whisper couldn't transcribe this recording: {error}. "
                        "Check the server terminal and model download, then retry."
                    )
                },
            )
            return

        self.send_json(200, {"text": text})

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format_string, *args):
        logging.info("%s - %s", self.address_string(), format_string % args)


def get_model():
    global _processor, _model
    if _model is not None:
        return _processor, _model
    with _model_lock:
        if _model is None:
            from transformers import WhisperForConditionalGeneration, WhisperProcessor
            import torch

            torch.set_num_threads(min(torch.get_num_threads(), 4))
            logging.info("Loading %s on CPU. The first run downloads the model once.", MODEL_ID)
            _processor = WhisperProcessor.from_pretrained(MODEL_ID)
            _model = WhisperForConditionalGeneration.from_pretrained(MODEL_ID)
            _model.eval()
            logging.info("Local Whisper model is ready.")
    return _processor, _model


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    server = ThreadingHTTPServer(("localhost", 8765), VoxoraHandler)
    logging.info("Voxora is running at http://localhost:8765")
    logging.info("Speech audio is processed locally; the Whisper model is downloaded on first transcription.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logging.info("Stopping Voxora server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
