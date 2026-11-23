from django.db import migrations, models


def successes_at_zero(apps, schema_editor):
    """A success leaves the boss with no health."""
    Encounter = apps.get_model("raidar", "Encounter")
    Encounter.objects.filter(success=True).update(boss_health=0.0)


class Migration(migrations.Migration):

    dependencies = [
        ('raidar', '0060_invitecode'),
    ]

    operations = [
        migrations.AddField(
            model_name='encounter',
            name='boss_health',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.RunPython(successes_at_zero, migrations.RunPython.noop),
    ]
