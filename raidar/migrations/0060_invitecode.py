from django.conf import settings
from django.db import migrations, models
import raidar.models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('raidar', '0059_user_email_not_unique'),
    ]

    operations = [
        migrations.CreateModel(
            name='InviteCode',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(default=raidar.models._generate_invite_code, max_length=64, unique=True)),
                ('expires_at', models.DateTimeField(blank=True, help_text='Leave blank for no expiration', null=True)),
                ('max_uses', models.PositiveIntegerField(default=1, help_text='1 = single use')),
                ('uses', models.PositiveIntegerField(default=0, editable=False)),
                ('active', models.BooleanField(default=True)),
                ('note', models.CharField(blank=True, max_length=200)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('used_by', models.ManyToManyField(blank=True, related_name='invite_codes', to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
