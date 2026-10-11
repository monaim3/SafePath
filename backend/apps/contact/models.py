from django.db import models
from django.utils import timezone


class ContactMessage(models.Model):
    """A message from the contact form. Emailed to the owner; kept here too in case email fails."""

    class Topic(models.TextChoices):
        WRONG_INFO = "wrong_info", "Wrong information on the map"
        REMOVE = "remove", "Remove a report or video"
        PROBLEM = "problem", "Problem with the site"
        COLLABORATE = "collaborate", "Journalism, research or working together"
        OTHER = "other", "Something else"

    name = models.CharField(max_length=80)
    email = models.EmailField()
    topic = models.CharField(max_length=16, choices=Topic.choices)
    subject = models.CharField(max_length=120)
    message = models.TextField(max_length=3000)
    emailed = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.get_topic_display()}: {self.subject}"
