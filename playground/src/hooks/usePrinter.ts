import { computed, reactive, ref } from 'vue'
import { hiprint } from 'vue-plugin-hiprint'

export const DEFAULT_PRINTER_HOST = 'http://localhost:17521'
// 默认58mm 纸张宽度
export const DEFAULT_PRINTER_PAGE_SIZE = 58
// 默认打印份数
export const DEFAULT_PRINTER_COPIES = 1

export interface PrinterDevice {
  description: string
  displayName: string
  isDefault: boolean
  name: string
  status: number
  options: Record<string, any>
}

export interface PrintHTMLOptions {
  height: number
  html: string
  printer: string
  width: number
  paperFooter?: number
  paperHeader?: number
}

// 单例模式
function ensureHiPrintInit() {
  let isInitialized = false

  // 打印服务连接状态
  const openedRef = ref(false)

  return function getHiWebSocket() {
    if (!isInitialized) {
      hiprint.init()

      // hook hiwebSocket.opened
      Object.defineProperty(hiprint.hiwebSocket, 'opened', {
        get() {
          return openedRef.value
        },
        set(value: boolean) {
          openedRef.value = value
        },
        enumerable: true,
        configurable: true,
      })

      isInitialized = true
    }

    return { isConnected: openedRef }
  }
}

// 初始化 HiPrint，只执行一次
export const initHiPrint = ensureHiPrintInit()

// 设备列表缓存，避免频繁调用获取设备接口
const printerDevicesCache = ref<PrinterDevice[]>([])

export interface PrinterConfig {
  enablePrinterService: boolean
  printerDevice?: string
  printerPaperSize?: number
  printCopies?: number
  printerServiceUrl?: string
}

/**
 * 打印机相关 Hook
 *
 * @description https://github.com/CcSimple/vue-plugin-hiprint/blob/main/src/index.js
 */
export function usePrinter(initialConfig?: PrinterConfig) {
  // isConnected 代表打印服务连接状态，不要手动修改
  const { isConnected } = initHiPrint()

  const getConnected = computed(() => isConnected.value)

  const systemConfigStore = reactive<PrinterConfig>({
    enablePrinterService: initialConfig?.enablePrinterService ?? false,
    printerDevice: initialConfig?.printerDevice,
    printerPaperSize: initialConfig?.printerPaperSize,
    printCopies: initialConfig?.printCopies,
    printerServiceUrl: initialConfig?.printerServiceUrl,
  })

  const getPrinterEnabled = computed(
    () => systemConfigStore.enablePrinterService,
  )

  const getPrinterDevice = computed(() => systemConfigStore.printerDevice)
  const getPrinterPaperSize = computed(
    () => systemConfigStore.printerPaperSize || DEFAULT_PRINTER_PAGE_SIZE,
  )
  const getPrintCopies = computed(
    () => systemConfigStore.printCopies || DEFAULT_PRINTER_COPIES,
  )
  const getPrinterServiceUrl = computed(
    () => systemConfigStore.printerServiceUrl || DEFAULT_PRINTER_HOST,
  )
  const getPrinterDevicesCache = computed(() => printerDevicesCache.value)

  /**
   * 断开服务连接
   */
  function disconnectService() {
    // 关闭WebSocket连接
    hiprint.hiwebSocket
    && hiprint.hiwebSocket.hasIo()
    && hiprint.hiwebSocket.stop()
  }

  /**
   * 连接打印服务
   */
  function connectService() {
    const namespace = import.meta.env?.VITE_APP_NAMESPACE || 'easyink-playground'
    hiprint.hiwebSocket.setHost(
      getPrinterServiceUrl.value,
      `vue-plugin-hiprint-${namespace}`,
      (connect: boolean) => {
        if (!connect) {
          return
        }

        // 连接成功后设置默认打印机
        refreshPrinterDevicesCache()
      },
    )

    // 连接打印机服务
    hiprint.hiwebSocket
    && !hiprint.hiwebSocket.hasIo()
    && hiprint.hiwebSocket.start()
  }

  /**
   * 获取服务连接状态
   */
  function getServiceOpened() {
    return hiprint.hiwebSocket.opened
  }

  /**
   * 获取 HiPrint 实例
   */
  function getHiprintInstance(): Record<string, any> {
    return hiprint
  }

  /**
   * 同步获取打印机设备列表
   */
  function getPrinterDevicesSync(): PrinterDevice[] {
    return printerDevicesCache.value
  }

  async function refreshPrinterDevicesCache() {
    try {
      const devices = await getPrinterDevicesAsync()
      printerDevicesCache.value = devices
    }
    catch {
      printerDevicesCache.value = []
    }

    // 设置默认打印机
    const devices = printerDevicesCache.value

    if (devices.length <= 0) {
      systemConfigStore.printerDevice = undefined
      return
    }

    const defaultDevice = devices.find(d => d.isDefault) || devices[0]

    if (!defaultDevice) {
      return
    }

    if (!systemConfigStore.printerDevice) {
      // 如果当前没有选择打印机，则设置为默认打印机
      systemConfigStore.printerDevice = defaultDevice.name
    }
    else if (
      devices.every(d => d.name !== systemConfigStore.printerDevice)
    ) {
      // 如果当前选择的打印机不存在，则设置为默认打印机
      systemConfigStore.printerDevice = defaultDevice.name
    }
  }

  /**
   * 异步获取打印机设备列表
   */
  async function getPrinterDevicesAsync(): Promise<PrinterDevice[]> {
    return new Promise((resolve) => {
      let isTimeout = false

      // 避免连接刚建立时立即获取打印机列表失败，稍作延时
      setTimeout(() => {
        // 设置超时，避免长时间等待
        setTimeout(() => {
          isTimeout = true
          resolve([])
        }, 2000)

        hiprint.refreshPrinterList((devices: PrinterDevice[]) => {
          if (isTimeout) {
            return
          }
          resolve(devices)
        })
      }, 500)
    })
  }

  /**
   * 打印 HTML 内容
   */
  async function printHtml({
    width,
    height,
    html,
    printer,
    paperFooter = 340,
    paperHeader = 46,
  }: PrintHTMLOptions) {
    return new Promise<void>((resolve, reject) => {
      if (!systemConfigStore.enablePrinterService) {
        // 未启用打印服务，直接返回成功
        reject(new Error('打印服务未启用'))
        return
      }

      if (!printer) {
        reject(new Error('未选择打印机'))
        return
      }

      if (getConnected.value) {
        // 打印服务已连接，开始打印
        resolve()
      }
      else {
        // 打印服务未连接，则尝试重连
        connectService()

        // 等待打印服务连接成功
        setTimeout(() => {
          if (getConnected.value) {
            resolve()
          }
          else {
            reject(new Error('打印服务未连接'))
          }
        }, 1000)
      }
    }).then(() => {
      return new Promise<void>((resolve, reject) => {
        const hiprintTemplate = new hiprint.PrintTemplate()

        const panel = hiprintTemplate.addPrintPanel({
          width,
          height,
          paperFooter,
          paperHeader,
          paperNumberDisabled: true,
        })

        panel.addPrintHtml({
          options: { content: html },
        })

        hiprintTemplate.on('printSuccess', () => {
          resolve()
        })

        hiprintTemplate.on('printError', () => {
          reject(new Error('打印失败'))
        })

        hiprintTemplate.print2(
          {},
          {
            printer,
            margins: {
              marginType: 'none',
            },
          },
        )
      })
    })
  }

  /**
   * 更新配置
   */
  function updateConfig(config: PrinterConfig) {
    systemConfigStore.enablePrinterService = config.enablePrinterService
    systemConfigStore.printerDevice = config.printerDevice
    systemConfigStore.printerPaperSize = config.printerPaperSize
    systemConfigStore.printCopies = config.printCopies
    systemConfigStore.printerServiceUrl = config.printerServiceUrl
  }

  /**
   * 获取当前配置
   */
  function getConfig(): PrinterConfig {
    return {
      enablePrinterService: systemConfigStore.enablePrinterService,
      printerDevice: systemConfigStore.printerDevice,
      printerPaperSize: systemConfigStore.printerPaperSize,
      printCopies: systemConfigStore.printCopies,
      printerServiceUrl: systemConfigStore.printerServiceUrl,
    }
  }

  return {
    getPrinterEnabled,
    getConnected,
    getPrinterDevice,
    getPrinterPaperSize,
    getPrintCopies,
    getPrinterServiceUrl,
    connectService,
    disconnectService,
    getServiceOpened,
    getPrinterDevicesSync,
    getPrinterDevicesAsync,
    refreshPrinterDevicesCache,
    getPrinterDevicesCache,
    getHiprintInstance,
    printHtml,
    updateConfig,
    getConfig,
  }
}
