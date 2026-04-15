from django.db import models


class Score(models.Model):
    name = models.CharField(max_length=30)
    count = models.PositiveIntegerField()
    duration = models.PositiveIntegerField(help_text="Duration of run in seconds")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-count", "created_at"]

    def __str__(self):
        return f"{self.name}: {self.count} in {self.duration}s"
