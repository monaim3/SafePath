"""
Create (or reset) a moderator: a staff user who can use /mod but not the Django admin.

    python manage.py create_moderator rahim            # prompts for a password
"""

import getpass

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Create or reset a moderator account."

    def add_arguments(self, parser):
        parser.add_argument("username")
        parser.add_argument("--password", help="Non-interactive use only (e.g. local setup scripts).")

    def handle(self, *args, username: str, password: str | None, **opts):
        password = password or getpass.getpass("Password: ")
        user_model = get_user_model()
        user = user_model.objects.filter(username=username).first() or user_model(username=username)
        try:
            validate_password(password, user)
        except ValidationError as exc:
            raise CommandError(" ".join(exc.messages)) from exc
        user.set_password(password)
        user.is_staff = True  # passes IsAdminUser on the moderation API
        user.is_superuser = False
        user.save()
        self.stdout.write(self.style.SUCCESS(f"Moderator '{username}' is ready."))
