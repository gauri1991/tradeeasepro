# Generated by Django 5.0.8 on 2025-05-07 05:21

from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='ApiCredential',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('api_key', models.CharField(max_length=64)),
                ('api_secret', models.CharField(max_length=64)),
                ('access_token', models.CharField(blank=True, max_length=256, null=True)),
                ('token_generated_at', models.DateTimeField(blank=True, null=True)),
                ('is_active', models.BooleanField(default=True)),
            ],
        ),
        migrations.CreateModel(
            name='Instrument',
            fields=[
                ('instrument_token', models.BigIntegerField(primary_key=True, serialize=False)),
                ('exchange_token', models.IntegerField()),
                ('tradingsymbol', models.CharField(max_length=64)),
                ('name', models.CharField(max_length=128)),
                ('last_price', models.DecimalField(decimal_places=4, max_digits=20, null=True)),
                ('expiry', models.DateField(blank=True, null=True)),
                ('strike', models.DecimalField(decimal_places=4, max_digits=20, null=True)),
                ('tick_size', models.DecimalField(decimal_places=4, max_digits=10)),
                ('lot_size', models.IntegerField()),
                ('instrument_type', models.CharField(max_length=32)),
                ('segment', models.CharField(max_length=32)),
                ('exchange', models.CharField(max_length=16)),
            ],
        ),
    ]
