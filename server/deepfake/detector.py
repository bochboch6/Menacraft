"""
detector.py — called by the Node module via child_process.
Usage: python3 detector.py <audio_file_path>
Prints a single JSON object to stdout and exits.
"""

import sys
import os
import json

# —— Lazy-load models (cached between calls if server keeps process alive) ——
_model1 = None
_model2 = None


def get_models():
    global _model1, _model2
    if _model1 is None or _model2 is None:
        from transformers import pipeline
        _model1 = pipeline(
            "audio-classification",
            model="Hemgg/Deepfake-audio-detection"
        )
        _model2 = pipeline(
            "audio-classification",
            model="Gustking/wav2vec2-large-xlsr-deepfake-audio-classification"
        )
    return _model1, _model2


# —— Score extraction ———————————————————————————————————————————
def extract_fake_score(results):
    fake_score = 0.0
    real_score = 0.0

    for item in results:
        label = str(item["label"]).lower()
        score = float(item["score"])

        if any(w in label for w in ["fake", "spoof", "ai", "generated", "deepfake"]):
            fake_score = max(fake_score, score)

        if any(w in label for w in ["real", "human", "bonafide", "genuine"]):
            real_score = max(real_score, score)

    # Derive fake score from real if not explicit
    if fake_score == 0.0 and real_score > 0:
        fake_score = 1.0 - real_score
    elif fake_score == 0.0 and real_score == 0.0:
        fake_score = 0.5  # Unknown label — be cautious

    return fake_score, real_score


# —— Main ———————————————————————————————————————————————————————
def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No audio path provided"}))
        sys.exit(1)

    audio_path = sys.argv[1]

    if not os.path.exists(audio_path):
        print(json.dumps({"error": f"File not found: {audio_path}"}))
        sys.exit(1)

    try:
        model1, model2 = get_models()
        result1 = model1(audio_path)
        result2 = model2(audio_path)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

    fake1, _ = extract_fake_score(result1)
    fake2, _ = extract_fake_score(result2)

    avg_score = (fake1 + fake2) / 2

    if avg_score > 0.75:
        status = "Suspicious / Likely Fake"
    elif avg_score < 0.30:
        status = "Likely Real"
    else:
        status = "Uncertain"

    output = {
        "status": status,
        "confidence": round(avg_score * 100, 2),
        "model1_fake_score": round(fake1, 6),
        "model2_fake_score": round(fake2, 6),
    }

    # IMPORTANT: only print the JSON — Node reads stdout
    print(json.dumps(output))


if __name__ == "__main__":
    main()
