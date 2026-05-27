using System;
using System.Threading;
using EasyInk.Engine.Models;
using EasyInk.Engine.Services;
using EasyInk.Engine.Services.Abstractions;
using Moq;
using Xunit;

namespace EasyInk.Engine.Tests;

public class PrintJobQueueTests
{
    private static PrintJobQueue CreateQueue(Mock<IPrintService>? printService = null)
    {
        printService ??= new Mock<IPrintService>();
        printService.Setup(s => s.Print(It.IsAny<string>(), It.IsAny<PrintRequestParams>(), It.IsAny<CancellationToken>()))
            .Returns(PrinterResult.Ok("test", PrintResult.Success("done")));
        return new PrintJobQueue(printService.Object);
    }

    private static PrintRequestParams MakeRequest(string printerName = "TestPrinter")
    {
        return new PrintRequestParams
        {
            PrinterName = printerName,
            PdfBase64 = Convert.ToBase64String(new byte[] { 1, 2, 3 }),
            Copies = 1
        };
    }

    [Fact]
    public void Enqueue_ReturnsJobId()
    {
        using var queue = CreateQueue();
        var jobId = queue.Enqueue(null!, MakeRequest());
        Assert.False(string.IsNullOrEmpty(jobId));
    }

    [Fact]
    public void Enqueue_WithRequestId_UsesProvidedId()
    {
        using var queue = CreateQueue();
        var jobId = queue.Enqueue("custom-id", MakeRequest());
        Assert.Equal("custom-id", jobId);
    }

    [Fact]
    public void GetJobStatus_BeforeCompletion_IsTrackedAndBecomesPrinting()
    {
        var gate = new ManualResetEventSlim(false);
        var enteredPrint = new ManualResetEventSlim(false);
        var printService = new Mock<IPrintService>();
        printService.Setup(s => s.Print(It.IsAny<string>(), It.IsAny<PrintRequestParams>(), It.IsAny<CancellationToken>()))
            .Returns(() =>
            {
                enteredPrint.Set();
                gate.Wait();
                return PrinterResult.Ok("test", PrintResult.Success("done"));
            });

        using var queue = new PrintJobQueue(printService.Object);
        var jobId = queue.Enqueue(null!, MakeRequest());
        var job = queue.GetJobStatus(jobId);
        Assert.NotNull(job);
        Assert.Contains(job!.Status, new[] { JobStatus.Queued, JobStatus.Printing });
        Assert.NotEqual(JobStatus.Completed, job.Status);
        Assert.NotEqual(JobStatus.Failed, job.Status);

        Assert.True(enteredPrint.Wait(TimeSpan.FromSeconds(5)));

        var printing = queue.GetJobStatus(jobId);
        Assert.NotNull(printing);
        Assert.Equal(JobStatus.Printing, printing!.Status);
        Assert.NotNull(printing.StartedAt);

        gate.Set();
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (DateTime.UtcNow < deadline && queue.GetJobStatus(jobId)?.Status == JobStatus.Queued)
            Thread.Sleep(50);
    }

    [Fact]
    public void GetJobStatus_UnknownJob_ReturnsNull()
    {
        using var queue = CreateQueue();
        Assert.Null(queue.GetJobStatus("nonexistent"));
    }

    [Fact]
    public void Enqueue_ProcessesJobToCompletion()
    {
        using var queue = CreateQueue();
        var jobId = queue.Enqueue(null!, MakeRequest());

        // Wait for the background worker to process
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (DateTime.UtcNow < deadline)
        {
            var job = queue.GetJobStatus(jobId);
            if (job!.Status == JobStatus.Completed || job!.Status == JobStatus.Failed)
                break;
            Thread.Sleep(50);
        }

        var final = queue.GetJobStatus(jobId);
        Assert.Equal(JobStatus.Completed, final!.Status);
        Assert.NotNull(final!.CompletedAt);
        Assert.NotNull(final!.StartedAt);
    }

    [Fact]
    public void Enqueue_PrintFailure_SetsFailedStatus()
    {
        var printService = new Mock<IPrintService>();
        printService.Setup(s => s.Print(It.IsAny<string>(), It.IsAny<PrintRequestParams>(), It.IsAny<CancellationToken>()))
            .Returns(PrinterResult.Error("test", ErrorCode.PrintFailed, "boom"));

        using var queue = new PrintJobQueue(printService.Object);
        var jobId = queue.Enqueue(null!, MakeRequest());

        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (DateTime.UtcNow < deadline)
        {
            var job = queue.GetJobStatus(jobId);
            if (job!.Status == JobStatus.Failed)
                break;
            Thread.Sleep(50);
        }

        var final = queue.GetJobStatus(jobId);
        Assert.Equal(JobStatus.Failed, final!.Status);
        Assert.Equal("boom", final!.ErrorMessage);
    }

    [Fact]
    public void GetAllJobs_ReturnsAllJobs()
    {
        using var queue = CreateQueue();
        queue.Enqueue(null!, MakeRequest("Printer1"));
        queue.Enqueue(null!, MakeRequest("Printer2"));

        var all = queue.GetAllJobs();
        Assert.True(all.Count >= 2);
    }
}
