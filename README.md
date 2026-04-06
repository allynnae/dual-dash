# Dual Dash

Arcade-style runner with two optional controllers: hand pinch or audio (clap/shout). Built with pygame + MediaPipe; includes custom sounds and icon in `assets/`.
Both hand_dash.py and audio_dash.py also work with the real browser version of games like Geometry Dash.

<img width="897" height="516" alt="image" src="https://github.com/user-attachments/assets/d2e60ebd-7724-4db1-b579-706437e3500b" />

## Install (Windows)
```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Run the game
```powershell
python src/dual_dash.py
```
- Levels: Easy / Medium / Hard
- Pause button (top-right) and Home button to return to menu.
- Run this and one of the following below in two separate terminals. Or don't, and just play it regularly.

## Hand controller (pinch -> space)
```powershell
python src/hand_dash.py --check-mp          # verify mediapipe loads
python src/hand_dash.py --list-cams         # find camera index
python src/hand_dash.py                     # add "--camera #" if --list-cams comes back with anything other than 0
```
- More sensitive: `--pinch-on 0.030 --pinch-off 0.050`
- Less sensitive: raise those values slightly.

## Audio controller (clap/shout -> space)
```powershell
python src/audio_dash.py 
```
- `--threshold` defaults to 0.07. Lower `--threshold` = more sensitive; try 0.05 if it misses. Raise it (e.g., 0.10) if you get false triggers.

## File map
- `src/gd_clone.py` — Dual Dash game
- `src/hand_dash.py` — Hand pinch controller
- `src/audio_dash.py` — Audio clap/shout controller
- `assets/` — Icons + sounds
- `videos/` — Demo videos
