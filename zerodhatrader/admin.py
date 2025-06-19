# zerodhatrader/admin.py
from django.contrib import admin
from .models import ApiCredential, Instrument

@admin.register(ApiCredential)
class ApiCredentialAdmin(admin.ModelAdmin):
    list_display = ('api_key', 'is_active', 'token_generated_at')
    search_fields = ('api_key',)
    list_filter = ('is_active',)
    readonly_fields = ('token_generated_at',)

@admin.register(Instrument)
class InstrumentAdmin(admin.ModelAdmin):
    list_display = ('tradingsymbol', 'exchange', 'instrument_type', 'segment')
    search_fields = ('tradingsymbol', 'name')
    list_filter = ('exchange', 'instrument_type', 'segment')