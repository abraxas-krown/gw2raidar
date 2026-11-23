from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from raidar.models import (EncounterData, SquadStat, BuildStat, UserStat, RestatPerfStats,
                           Upload, Notification)


class Command(BaseCommand):
    """Deletes every encounter and all stats, but keeps users, accounts, areas and eras."""
    help = ("Deletes ALL encounters (with their evtc logs, reports and replays) and resets all stats. "
            "Users, accounts, invite codes, areas and eras are kept. This cannot be undone.")

    def add_arguments(self, parser):
        parser.add_argument("--yes", action="store_true", dest="yes", default=False,
                            help="Do not ask for confirmation")
        parser.add_argument("--keep-uploads", action="store_true", dest="keep_uploads", default=False,
                            help="Keep queued or failed uploads (deleted by default)")
        parser.add_argument("--keep-notifications", action="store_true", dest="keep_notifications", default=False,
                            help="Keep user notifications (deleted by default)")

    def handle(self, *args, **options):
        counts = [
            ("encounters", EncounterData.objects.count()),
            ("squad stats", SquadStat.objects.count()),
            ("build stats", BuildStat.objects.count()),
            ("user stats", UserStat.objects.count()),
            ("restat runs", RestatPerfStats.objects.count()),
        ]
        if not options["keep_uploads"]:
            counts.append(("pending uploads", Upload.objects.count()))
        if not options["keep_notifications"]:
            counts.append(("notifications", Notification.objects.count()))

        self.stdout.write("About to delete:")
        for name, count in counts:
            self.stdout.write("  %8d %s" % (count, name))

        if not options["yes"]:
            if input("Type 'yes' to continue: ").strip().lower() != "yes":
                raise CommandError("Aborted.")

        # Deleted through the ORM, not raw SQL, so the post_delete handlers remove the files on disk.
        # Deleting EncounterData cascades to Encounter, Participation and all attribute rows.
        with transaction.atomic():
            EncounterData.objects.all().delete()
            SquadStat.objects.all().delete()
            BuildStat.objects.all().delete()
            UserStat.objects.all().delete()
            RestatPerfStats.objects.all().delete()
            if not options["keep_uploads"]:
                Upload.objects.all().delete()
            if not options["keep_notifications"]:
                Notification.objects.all().delete()

        self.stdout.write(self.style.SUCCESS("Done. Users, accounts, areas and eras were kept."))
