# 67 Game 🎯

A silly little Django site that uses your webcam and MediaPipe Hands to count how
many "67s" you can rip off in a set amount of time. Each time your two hands
swap vertical positions (one goes up while the other goes down, then flips back)
counts as one "67". Score gets saved to a leaderboard.

## Features
- 📷 Webcam hand tracking with **MediaPipe Hands** (loaded from CDN — no Python ML deps)
- ⏱️ Choose a 10 / 15 / 30 / 60 second run
- 🍪 Enters your name once, kept in a cookie for next time
- 🏆 Leaderboard filterable by duration
- 🛠️ Django admin for managing scores (create a superuser if you want to use it)

## Setup

```bash
# from this folder (SixSeven/)
python -m venv .venv
.venv\Scripts\activate            # Windows
# source .venv/bin/activate       # macOS / Linux

pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Then open **http://127.0.0.1:8000/**

> ⚠️ Browsers only allow webcam access on `localhost` or `https`. `127.0.0.1`
> and `localhost` are both fine for dev. If you host this somewhere, you'll
> need HTTPS or the camera API won't work.

### Optional — admin
```bash
python manage.py createsuperuser
```
Then visit `/admin/` to browse/edit scores.

## How the counter works
MediaPipe tracks up to two hands per frame. The script computes an average Y
position for each hand, labels them by MediaPipe's "Left"/"Right" handedness,
and watches for the vertical order of the two hands to flip (with a small
hysteresis margin so noise doesn't trigger spurious counts). Each flip = +1.

If your counter feels too twitchy or too sluggish, tweak `HYSTERESIS`
in `game/static/game/game.js`.

## Project layout
```
SixSeven/
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
