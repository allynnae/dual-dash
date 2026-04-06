"""
Audio-based jump trigger: clap/shout to send space (or left click).
Runs alongside your game; keep the game window focused.
"""

import argparse
import time

import numpy as np
import pydirectinput
import sounddevice as sd

pydirectinput.FAILSAFE = False
pydirectinput.PAUSE = 0


def main():
    parser = argparse.ArgumentParser(description="Audio-based jump trigger (clap/shout -> space).")
    parser.add_argument("--device", type=int, default=None, help="Audio input device index (default: system default).")
    parser.add_argument("--threshold", type=float, default=0.07, help="RMS amplitude to trigger (0–1). Lower = more sensitive.")
    parser.add_argument("--cooldown", type=float, default=0.15, help="Seconds to wait after a trigger.")
    parser.add_argument("--output", choices=["space", "left_click"], default="space", help="What to send.")
    parser.add_argument("--rate", type=int, default=16000, help="Sample rate.")
    parser.add_argument("--block", type=float, default=0.05, help="Block size in seconds.")
    args = parser.parse_args()

    blocksize = int(args.rate * args.block)
    cooldown_until = 0.0

    def send_press():
        if args.output == "space":
            pydirectinput.press("space")
        else:
            pydirectinput.click()

    def audio_callback(indata, frames, time_info, status):
        nonlocal cooldown_until
        if status:
            return
        rms = float(np.sqrt(np.mean(indata**2)))
        now = time.time()
        if rms >= args.threshold and now >= cooldown_until:
            send_press()
            cooldown_until = now + args.cooldown

    print("Listening... (Ctrl+C to quit)")
    with sd.InputStream(
        device=args.device,
        channels=1,
        samplerate=args.rate,
        blocksize=blocksize,
        callback=audio_callback,
    ):
        while True:
            time.sleep(0.1)


if __name__ == "__main__":
    main()
