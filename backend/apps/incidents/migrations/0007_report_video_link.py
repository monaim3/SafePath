from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('incidents', '0006_report_exact_location'),
    ]

    operations = [
        migrations.AddField(
            model_name='report',
            name='video_link',
            field=models.URLField(blank=True, max_length=500),
        ),
    ]
