from django.db import migrations, models


class Migration(migrations.Migration):
    """Whether each player had a commander tag in the fight (Elite Insights' hasCommanderTag)."""

    dependencies = [
        ('raidar', '0057_encounter_named_index'),
    ]

    operations = [
        migrations.AddField(
            model_name='encounterplayer',
            name='commander',
            field=models.BooleanField(default=False),
        ),
    ]
