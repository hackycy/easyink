//go:build windows

package daemon

import "golang.org/x/sys/windows"

func processExists(pid int) bool {
	if pid <= 0 {
		return false
	}
	handle, err := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(pid))
	if err != nil {
		return false
	}
	defer windows.CloseHandle(handle)
	status, err := windows.WaitForSingleObject(handle, 0)
	if err != nil {
		return true
	}
	return status == uint32(windows.WAIT_TIMEOUT)
}
