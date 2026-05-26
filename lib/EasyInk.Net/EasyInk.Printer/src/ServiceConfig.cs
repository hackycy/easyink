using EasyInk.Engine;
using EasyInk.Engine.Models;
using EasyInk.Engine.Services;
using EasyInk.Engine.Services.Abstractions;
using EasyInk.Printer.Api;
using EasyInk.Printer.Config;
using EasyInk.Printer.Server;
using EasyInk.Printer.Services;
using EasyInk.Printer.Services.Abstractions;
using EasyInk.Printer.UI.Presenters;
using EasyInk.Printer.UI.Views;
using EasyInk.Printer.UI;
using Microsoft.Extensions.DependencyInjection;

namespace EasyInk.Printer;

internal static class ServiceConfig
{
    public static ServiceProvider Configure(HostConfig config)
    {
        var services = new ServiceCollection();

        // Configuration
        services.AddSingleton(config);

        services.AddSingleton<PrintDebugLogService>();
        services.AddSingleton<RenderRuntimeManager>();
        services.AddSingleton<RenderDaemonService>();
        services.AddSingleton<RenderClient>();
        services.AddSingleton<PrinterRenderPdfService>();
        services.AddSingleton<IRenderPdfService>(sp => sp.GetRequiredService<PrinterRenderPdfService>());

        // Engine — with routing between GDI and Raw print paths
        services.AddSingleton<EngineApi>(sp =>
        {
            var api = new EngineApi(
                maxQueueSize: config.MaxQueueSize,
                rawPrinterNames: config.RawPrinterNames,
                rawPrintDpi: config.RawPrintDpi,
                rawPrintMaxDotsWidth: config.RawPrintMaxDotsWidth,
                sumatraPdfPath: config.SumatraPdfPath,
                sumatraPrinterNames: config.SumatraPrinterNames,
                sumatraPrintSettings: config.SumatraPrintSettings,
                sumatraTimeoutSeconds: config.SumatraTimeoutSeconds,
                sumatraTempDir: HostConfig.ResolveSumatraTempDir(config.SumatraTempDir!),
                lowDpiPrintEnhancementMode: ParseLowDpiPrintEnhancement(config.LowDpiPrintEnhancement),
                renderPdfService: config.RenderEnabled ? sp.GetRequiredService<IRenderPdfService>() : null);
            return api;
        });

        // Audit
        services.TryAddAuditService(config);

        // Server
        services.AddSingleton<HttpServer>(sp =>
            new HttpServer(config.HttpPort, config.MaxConcurrentRequests));
        services.AddSingleton<WebSocketHandler>(sp =>
            new WebSocketHandler(config.MaxWebSocketConnections, config.ApiKey));
        services.AddSingleton<WebSocketCommandHandler>();
        services.AddSingleton<Router>();

        // API Controllers
        services.AddSingleton<PrinterController>();
        services.AddSingleton<PrintController>();
        services.AddSingleton<JobController>();
        services.AddSingleton<LogController>();
        services.AddSingleton<StatusController>();

        // UI
        services.AddSingleton<DashboardPresenter>();
        services.AddSingleton<PrintersPresenter>();
        services.AddSingleton<JobsPresenter>();
        services.AddSingleton<LogsPresenter>();
        services.AddSingleton<SettingsPresenter>();
        services.AddSingleton<DashboardView>();
        services.AddSingleton<PrintersView>();
        services.AddSingleton<JobsView>();
        services.AddSingleton<LogsView>();
        services.AddSingleton<SettingsView>();
        services.AddSingleton<MainWindow>();
        services.AddSingleton<TrayIcon>();

        return services.BuildServiceProvider();
    }

    private static void TryAddAuditService(this IServiceCollection services, HostConfig config)
    {
        try
        {
            var auditService = new AuditService(config.DbPath, config.AuditLogRetentionDays);
            services.AddSingleton<IAuditService>(auditService);
        }
        catch
        {
            services.AddSingleton<IAuditService>(new NullAuditService());
        }
    }

    private static LowDpiPrintEnhancementMode ParseLowDpiPrintEnhancement(string? value)
    {
        return string.Equals(value, "normal", System.StringComparison.OrdinalIgnoreCase)
            ? LowDpiPrintEnhancementMode.Normal
            : string.Equals(value, "monochrome", System.StringComparison.OrdinalIgnoreCase)
                ? LowDpiPrintEnhancementMode.Monochrome
                : LowDpiPrintEnhancementMode.Boost;
    }
}
