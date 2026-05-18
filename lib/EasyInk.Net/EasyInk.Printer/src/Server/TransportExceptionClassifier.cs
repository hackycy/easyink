using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;

namespace EasyInk.Printer.Server;

internal static class TransportExceptionClassifier
{
    private static readonly HashSet<int> ExpectedHttpListenerErrorCodes = new HashSet<int>
    {
        64,    // ERROR_NETNAME_DELETED: 指定的网络名不再可用
        995,   // ERROR_OPERATION_ABORTED
        10054, // WSAECONNRESET
        1229,  // ERROR_CONNECTION_INVALID: 企图在不存在的网络连接上进行操作
        1236   // ERROR_CONNECTION_ABORTED
    };

    private static readonly HashSet<int> ExpectedSocketErrorCodes = new HashSet<int>
    {
        (int)SocketError.ConnectionAborted,
        (int)SocketError.ConnectionReset,
        (int)SocketError.Disconnecting,
        (int)SocketError.NetworkDown,
        (int)SocketError.NetworkReset,
        (int)SocketError.Shutdown,
        (int)SocketError.TimedOut
    };

    public static bool IsExpectedDisconnect(Exception ex)
    {
        if (ex is AggregateException aggregateException)
        {
            var innerExceptions = aggregateException.Flatten().InnerExceptions;
            if (innerExceptions.Count == 0)
                return false;

            foreach (var inner in innerExceptions)
            {
                if (!IsExpectedDisconnect(inner))
                    return false;
            }

            return true;
        }

        if (ex is OperationCanceledException || ex is ObjectDisposedException)
            return true;

        if (ex is HttpListenerException httpListenerException)
            return ExpectedHttpListenerErrorCodes.Contains(httpListenerException.ErrorCode);

        if (ex is SocketException socketException)
            return ExpectedSocketErrorCodes.Contains(socketException.ErrorCode);

        if (ex is WebSocketException)
            return true;

        if (ex is IOException ioException)
            return ioException.InnerException == null || IsExpectedDisconnect(ioException.InnerException);

        return false;
    }
}