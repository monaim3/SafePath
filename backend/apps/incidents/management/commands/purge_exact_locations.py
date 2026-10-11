from django.core.management.base import BaseCommand

from apps.incidents import policy
from apps.incidents.services.submission import purge_exact_locations


class Command(BaseCommand):
    help = f"Wipe reporters' exact pins and place names older than {policy.EXACT_LOCATION_DAYS} days (cells stay)."

    def handle(self, *args, **options):
        count = purge_exact_locations()
        self.stdout.write(self.style.SUCCESS(f"Cleared the exact location of {count} report(s)."))
