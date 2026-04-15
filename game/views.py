import json
from django.shortcuts import render, redirect
from django.http import JsonResponse, HttpResponseBadRequest
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import ensure_csrf_cookie
from .models import Score

NAME_COOKIE = "player_name"
COOKIE_MAX_AGE = 60 * 60 * 24 * 365  # 1 year
DEFAULT_DURATION = 15  # seconds


def home(request):
    name = request.COOKIES.get(NAME_COOKIE, "")
    return render(request, "game/home.html", {"name": name})


@require_POST
def set_name(request):
    name = (request.POST.get("name") or "").strip()[:30]
    if not name:
        return redirect("home")
    response = redirect("play")
    response.set_cookie(NAME_COOKIE, name, max_age=COOKIE_MAX_AGE, samesite="Lax")
    return response


def clear_name(request):
    response = redirect("home")
    response.delete_cookie(NAME_COOKIE)
    return response


@ensure_csrf_cookie
def play(request):
    name = request.COOKIES.get(NAME_COOKIE, "")
    if not name:
        return redirect("home")
    duration = int(request.GET.get("duration", DEFAULT_DURATION))
    if duration not in (10, 15, 30, 60):
        duration = DEFAULT_DURATION
    return render(request, "game/play.html", {"name": name, "duration": duration})


def leaderboard(request):
    duration = request.GET.get("duration")
    scores = Score.objects.all()
    if duration and duration.isdigit():
        scores = scores.filter(duration=int(duration))
    scores = scores[:50]
    name = request.COOKIES.get(NAME_COOKIE, "")
    return render(
        request,
        "game/leaderboard.html",
        {"scores": scores, "name": name, "selected_duration": duration or ""},
    )


@require_POST
def submit_score(request):
    try:
        data = json.loads(request.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return HttpResponseBadRequest("Invalid JSON")

    name = request.COOKIES.get(NAME_COOKIE) or (data.get("name") or "").strip()
    if not name:
        return HttpResponseBadRequest("No name set")
    name = name[:30]

    try:
        count = int(data.get("count", 0))
        duration = int(data.get("duration", DEFAULT_DURATION))
    except (TypeError, ValueError):
        return HttpResponseBadRequest("Invalid score data")

    if count < 0 or count > 10000:
        return HttpResponseBadRequest("Invalid count")
    if duration not in (10, 15, 30, 60):
        return HttpResponseBadRequest("Invalid duration")

    score = Score.objects.create(name=name, count=count, duration=duration)

    rank = Score.objects.filter(duration=duration, count__gt=count).count() + 1

    return JsonResponse(
        {
            "ok": True,
            "id": score.id,
            "name": score.name,
            "count": score.count,
            "duration": score.duration,
            "rank": rank,
        }
    )
