# KingK Minecraft + Railway Admin Panel

یک پنل یک‌سرویسی برای Railway که داخل همان کانتینر Minecraft اجرا می‌شود تا به `/data` دسترسی واقعی داشته باشد.

## قابلیت‌ها
- لاگین با `ADMIN_PASSWORD`
- Minecraft Paper / Fabric / Vanilla
- انتخاب نسخهٔ Minecraft و RAM
- Start / Stop / Restart
- اجرای دستورات Minecraft
- خواندن/ویرایش `server.properties`
- آپلود/حذف Plugin و Mod
- ساخت، دانلود، آپلود، Restore و حذف ZIP Backup
- نمایش Console log
- Railway API: پروژه/سرویس/instance، تعداد Replica، Region، Root Directory، Healthcheck، Variables، Redeploy، Deployments، Domains/TCP، Metrics endpoint
- نمایش «دلار باقی‌مانده» بر اساس usage جاری و اعتبار تعیین‌شده
- نمایش «روز باقی‌مانده» بر اساس `BILLING_ENDS_AT`

## متغیرهای Railway
حداقل این‌ها را در Variables تنظیم کن:

```text
ADMIN_PASSWORD=یک-رمز-قوی
SESSION_SECRET=یک-رشته-تصادفی-بلند
RAILWAY_API_TOKEN=توکن Railway
RAILWAY_PROJECT_ID=...
RAILWAY_ENVIRONMENT_ID=...
RAILWAY_SERVICE_ID=...
```

برای کارت billing دقیق‌تر:

```text
RAILWAY_PLAN=Trial
RAILWAY_INCLUDED_CREDIT_USD=5
BILLING_STARTS_AT=2026-09-18T00:00:00Z
BILLING_ENDS_AT=2026-10-18T00:00:00Z
# optional exact usage override
# RAILWAY_CURRENT_USAGE_USD=1.37
```

`RAILWAY_INCLUDED_CREDIT_USD` و `BILLING_ENDS_AT` عمداً قابل تنظیم هستند چون Public GraphQL usage API مصرف را می‌دهد، اما اطلاعات promotion/تاریخ پایان اعتبار همیشه یک فیلد عمومی و ثابت در همان query نیست.

## Volume
یک Railway Volume بساز و روی `/data` mount کن. بدون Volume، world و plugin/mod و backupها با recreate شدن کانتینر از بین می‌روند.

## Network
- Web panel: پورت `3000`
- Minecraft: پورت `25565`

برای اتصال Minecraft Java باید TCP Proxy را روی 25565 داخلی بسازی و hostname:port عمومی Railway را استفاده کنی.

## نکته درباره Mod
مودها در `mods/` ذخیره می‌شوند. برای اجرای واقعی مودها `SERVER_TYPE=FABRIC` انتخاب کن؛ روی Paper فایل مود فقط نگهداری می‌شود و Paper آن را به‌عنوان mod loader اجرا نمی‌کند.

## امنیت
- Tokenهای Railway از صفحه Variables قابل overwrite نیستند.
- آپلودها filename/path traversal را رد می‌کنند.
- اجرای shell روی OS عمداً در پنل وجود ندارد؛ فقط دستور Minecraft ارسال می‌شود.
- قبل از Restore یا تغییر اساسی version/type بکاپ بگیر.

<!-- deploy trigger 2026-09-18 -->
