from django.contrib import admin
from .models import Score


@admin.register(Score)
class ScoreAdmin(admin.ModelAdmin):
    list_display = ("name", "count", "duration", "created_at")
    list_filter = ("duration",)
    search_fields = ("name",)
