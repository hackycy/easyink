import { app, shell, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import trayIcon from '../../resources/tray-icon.png?asset'
import iconIco from '../../build/icon.ico?asset'
import { createAppContext, disposeAppContext } from './printer/app-context'
import { registerIpcHandlers } from './printer/ipc/ipc-handlers'
import type { AppContext } from './printer/app-context'

let appContext: AppContext | undefined
let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let isQuitting = false
const APP_NAME = 'EasyInk Printer'

app.setName(APP_NAME)

function createWindow(
  context: AppContext,
  showWhenReady = !context.config.startMinimized
): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow
  }

  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (showWhenReady && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  mainWindow.on('close', (event) => {
    if (context.config.minimizeToTray && !isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = undefined
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function createTray(context: AppContext): void {
  if (tray || !context.config.minimizeToTray) {
    return
  }

  tray = new Tray(createTrayImage())
  tray.setToolTip(APP_NAME)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `显示 ${APP_NAME}`,
        click: () => {
          showMainWindow()
        }
      },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      showMainWindow()
    }
  })
}

function createTrayImage(): Electron.NativeImage | string {
  if (process.platform === 'win32') {
    return iconIco
  }

  if (process.platform !== 'darwin') {
    return icon
  }

  return nativeImage.createFromPath(trayIcon)
}

function showMainWindow(): void {
  if (!appContext) {
    return
  }

  const window = createWindow(appContext, true)
  if (window.isMinimized()) {
    window.restore()
  }
  if (window.webContents.isLoading()) {
    return
  }
  window.show()
  window.focus()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.easyink.printer')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  appContext = await createAppContext()
  app.setLoginItemSettings({
    openAtLogin: Boolean(appContext.config.autoStart),
    args: ['--autostart']
  })
  registerIpcHandlers(appContext)

  createWindow(appContext)
  createTray(appContext)

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    showMainWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (appContext?.config.minimizeToTray) {
    return
  }

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  if (appContext) {
    void disposeAppContext(appContext)
    appContext = undefined
  }
})
