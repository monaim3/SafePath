from django.contrib import admin

from .models import ContactMessage


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ["created_at", "topic", "subject", "name", "email", "emailed"]
    list_filter = ["topic", "emailed"]
    search_fields = ["subject", "name", "email", "message"]
    readonly_fields = [f.name for f in ContactMessage._meta.fields]
