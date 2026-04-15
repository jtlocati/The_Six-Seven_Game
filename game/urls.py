from django.urls import path
from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("play/", views.play, name="play"),
    path("leaderboard/", views.leaderboard, name="leaderboard"),
    path("submit/", views.submit_score, name="submit_score"),
    path("set-name/", views.set_name, name="set_name"),
    path("clear-name/", views.clear_name, name="clear_name"),
]
