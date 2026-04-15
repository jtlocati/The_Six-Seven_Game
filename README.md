# 67 Game 🎯

A Django site that uses your webcam and MediaPipe Hands to count how many
"67s" you can rip off in a set amount of time. Each full up-and-down bounce
of a palm-up hand counts as a tick. Scores are saved to a leaderboard.

## Features
- Webcam hand tracking with **MediaPipe Hands** (loaded from CDN — no Python ML deps)
- Choose a 10 / 15 / 30 / 60 second run
- Enters your name once, kept in a cookie for next time
- Leaderboard filterable by duration
- Django admin for managing scores (create a superuser if you want to use it)

## Setup

```bash
# from this folder (The_Six-Seven_Game/)
python -m venv .venv
.venv\Scripts\activate            # Windows
# source .venv/bin/activate       # macOS / Linux

pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Then open **http://127.0.0.1:8000/**

> Browsers only allow webcam access on `localhost` or `https`. `127.0.0.1`
> and `localhost` are both fine for dev. If you host this somewhere, you'll
> need HTTPS or the camera API won't work.

### Optional — admin
```bash
python manage.py createsuperuser
```
Then visit `/admin/` to browse/edit scores.

## How the counter works
MediaPipe tracks up to two hands per frame. For each hand the script computes
a stable "palm center" (average of the wrist and the four finger-MCP knuckles
— landmarks 0, 5, 9, 13, 17) and low-pass filters its Y position.

Counting uses peak/trough detection: the script tracks the farthest-traveled
palm position in the current direction, then confirms that position as a
peak or trough once the palm has pulled back from it by at least
`MIN_AMPLITUDE` (a fraction of frame height) and a short debounce time has
passed. Every confirmed extremum after the first one counts as a tick, so a
fast up-down-up-down cycle registers multiple counts — speed is rewarded.

Hands are tracked independently and identified by which half of the frame
their palm is in, so one hand leaving the frame doesn't stall the other.

Tunable knobs at the top of `game/static/game/game.js`:

| Knob | What it does |
| --- | --- |
| `SMOOTH` | Higher = steadier signal, slower to react. |
| `MIN_AMPLITUDE` | Minimum bounce size (fraction of frame height) to count. |
| `MIN_INTERVAL_MS` | Debounce window between counted extrema. |

## Project layout
```
The_Six-Seven_Game/
├── manage.py
├── requirements.txt
├── sixseven/          # Django project (settings, urls, wsgi)
└── game/              # the app
    ├── models.py      # Score model
    ├── views.py       # home / play / leaderboard / submit_score / set_name
    ├── urls.py
    ├── admin.py
    ├── migrations/
    ├── templates/game/
    │   ├── base.html
    │   ├── home.html
    │   ├── play.html
    │   └── leaderboard.html
    └── static/game/
        ├── style.css
        └── game.js    # MediaPipe Hands + counter logic
```
