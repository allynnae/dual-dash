import argparse
import os
import sys
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import pydirectinput
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision
from mediapipe.tasks.python.vision import drawing_utils as mp_drawing_utils
from mediapipe.tasks.python.vision import drawing_styles as mp_drawing_styles
from mediapipe.tasks.python.vision import hand_landmarker as mp_hand_landmarker
from mediapipe.tasks.python.vision.hand_landmarker import HandLandmarksConnections
from mediapipe.tasks.python.vision.core.image import Image, ImageFormat


pydirectinput.FAILSAFE = False  # Prevent abrupt exit on upper-left move.
pydirectinput.PAUSE = 0        # Make key events as low-latency as possible.


MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
)
MODEL_PATH = Path("models/hand_landmarker.task")


def list_cameras(max_index: int = 10):
    """Probe camera indices and return a list of the usable ones."""
    found = []
    for idx in range(max_index):
        cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
        ok, _ = cap.read()
        cap.release()
        if ok:
            found.append(idx)
    return found


def ensure_model(path: Path = MODEL_PATH, url: str = MODEL_URL) -> Path:
    """Download the hand landmarker model if missing."""
    if path.exists():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading MediaPipe hand model to {path} ...")
    urllib.request.urlretrieve(url, path)  # noqa: S310 (trusted official model URL)
    return path


@dataclass
class GestureState:
    pinch_on: float = 0.030   # Distance (normalized) to trigger press (lower = more sensitive)
    pinch_off: float = 0.050  # Distance (normalized) to release
    active: bool = False

    def update(self, hand_landmarks):
        """Return action ('press'/'release'/None) and current pinch distance."""
        landmarks = hand_landmarks.landmark if hasattr(hand_landmarks, "landmark") else hand_landmarks
        thumb_tip = landmarks[4]
        index_tip = landmarks[8]
        a = np.array([thumb_tip.x, thumb_tip.y])
        b = np.array([index_tip.x, index_tip.y])
        dist = float(np.linalg.norm(a - b))

        action = None
        if not self.active and dist < self.pinch_on:
            self.active = True
            action = "press"
        elif self.active and dist > self.pinch_off:
            self.active = False
            action = "release"
        return action, dist


class InputSender:
    def __init__(self, mode: str):
        self.mode = mode
        self.is_down = False

    def press(self):
        if self.mode == "space":
            pydirectinput.keyDown("space")
        elif self.mode == "left_click":
            pydirectinput.mouseDown(button="left")
        self.is_down = True

    def release(self):
        if not self.is_down:
            return
        if self.mode == "space":
            pydirectinput.keyUp("space")
        elif self.mode == "left_click":
            pydirectinput.mouseUp(button="left")
        self.is_down = False


def draw_overlay(frame, hand_landmarks, dist, state: GestureState, fps: float):
    h, w, _ = frame.shape
    mp_drawing_utils.draw_landmarks(
        frame,
        hand_landmarks,
        HandLandmarksConnections.HAND_CONNECTIONS,
        mp_drawing_styles.get_default_hand_landmarks_style(),
        mp_drawing_styles.get_default_hand_connections_style(),
    )

    status_text = f"pinch: {dist:.3f} | state: {'ON' if state.active else 'OFF'} | fps: {fps:.1f}"
    cv2.putText(frame, status_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    hint = "Pinch thumb+index to jump; press Q or ESC to quit."
    cv2.putText(frame, hint, (10, h - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    return frame


def run(args):
    if args.list_cams:
        cams = list_cameras(args.max_cam_index)
        if cams:
            print("Usable cameras:", ", ".join(map(str, cams)))
        else:
            print("No cameras detected up to index", args.max_cam_index)
        return

    cap = cv2.VideoCapture(args.camera, cv2.CAP_DSHOW)
    if not cap.isOpened():
        print(f"Could not open camera index {args.camera}. Try --list-cams or a different index.")
        return
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)
    if args.fps > 0:
        cap.set(cv2.CAP_PROP_FPS, args.fps)

    sender = InputSender(args.output)
    gesture = GestureState(pinch_on=args.pinch_on, pinch_off=args.pinch_off)

    model_path = ensure_model(MODEL_PATH)
    base_options = mp_python.BaseOptions(model_asset_path=str(model_path))
    options = mp_hand_landmarker.HandLandmarkerOptions(
        base_options=base_options,
        running_mode=mp_vision.RunningMode.VIDEO,
        num_hands=1,
        min_hand_detection_confidence=args.det_conf,
        min_hand_presence_confidence=args.det_conf,
        min_tracking_confidence=args.track_conf,
    )

    landmarker = mp_hand_landmarker.HandLandmarker.create_from_options(options)
    prev_time = time.time()
    cv2.namedWindow("HandDash", cv2.WINDOW_AUTOSIZE)
    while True:
        ok, frame = cap.read()
        if not ok:
            print("Camera read failed; check camera index or permissions.")
            break

        now = time.time()
        fps = 1.0 / max(now - prev_time, 1e-6)
        prev_time = now

        frame = cv2.flip(frame, 1)  # Mirror for natural control.
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        mp_image = Image(image_format=ImageFormat.SRGB, data=rgb)
        result = landmarker.detect_for_video(mp_image, int(now * 1000))

        action = None
        dist = 0.0

        if result.hand_landmarks:
            hand_landmarks = result.hand_landmarks[0]
            action, dist = gesture.update(hand_landmarks)

            if action == "press":
                sender.press()
            elif action == "release" and args.behavior == "hold":
                sender.release()

            # In tap mode we only issue press on pinch-in; release immediately.
            if args.behavior == "tap" and action == "press":
                sender.release()

            frame = draw_overlay(frame, hand_landmarks, dist, gesture, fps=fps)
        else:
            # No hand -> auto release for safety.
            sender.release()

        cv2.imshow("HandDash", frame)
        key = cv2.waitKey(1) & 0xFF
        if key in (ord("q"), 27):
            break
        if cv2.getWindowProperty("HandDash", cv2.WND_PROP_VISIBLE) < 1:
            break  # window closed via title-bar X

    sender.release()
    cap.release()
    cv2.destroyAllWindows()


def build_arg_parser():
    parser = argparse.ArgumentParser(
        description="Pinch-based hand tracking controller for Geometry Dash (or any game needing space/left-click)."
    )
    parser.add_argument("--check-mp", action="store_true", help="Verify mediapipe tasks import and exit.")
    parser.add_argument("--camera", type=int, default=0, help="Camera index (0 = built-in).")
    parser.add_argument("--list-cams", action="store_true", help="List working camera indices and exit.")
    parser.add_argument("--max-cam-index", type=int, default=8, help="Highest index to probe when listing cameras.")
    parser.add_argument("--width", type=int, default=640, help="Camera capture width.")
    parser.add_argument("--height", type=int, default=360, help="Camera capture height.")
    parser.add_argument("--fps", type=int, default=0, help="Request camera FPS (0 leaves default).")
    parser.add_argument("--det-conf", type=float, default=0.6, help="Detection confidence threshold for MediaPipe.")
    parser.add_argument("--track-conf", type=float, default=0.6, help="Tracking confidence threshold for MediaPipe.")
    parser.add_argument("--pinch-on", type=float, default=0.030, help="Distance to count pinch as pressed (lower=more sensitive).")
    parser.add_argument("--pinch-off", type=float, default=0.050, help="Distance to count pinch as released.")
    parser.add_argument(
        "--behavior",
        choices=["hold", "tap"],
        default="tap",
        help="hold: keep key down while pinched; tap: fire quick tap on pinch-in.",
    )
    parser.add_argument(
        "--output",
        choices=["space", "left_click"],
        default="space",
        help="What input to send to the game.",
    )
    return parser


def main(argv=None):
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    if args.check_mp:
        try:
            _ = mp_hand_landmarker.HandLandmarker
            print("mediapipe tasks vision loaded (hand_landmarker available).")
        except Exception as exc:
            print(f"mediapipe tasks import failed: {exc}")
        return

    run(args)


if __name__ == "__main__":
    main()
