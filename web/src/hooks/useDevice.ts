import { useEffect, useState } from 'react'

export type DeviceLayout = 'mobile' | 'desktop'

/** 与 hira 配置页保持一致：<=768px 走移动端布局。 */
export const mobilePageWidthBreakpoint = 768

export const getPageWidth = (): number => {
  return document.documentElement.clientWidth || window.innerWidth
}

export const detectDeviceByPageWidth = (pageWidth: number = getPageWidth()): DeviceLayout => {
  return pageWidth <= mobilePageWidthBreakpoint ? 'mobile' : 'desktop'
}

const hasMobileUserAgent = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase()
  const mobileKeywords = [
    'android',
    'webos',
    'iphone',
    'ipad',
    'ipod',
    'blackberry',
    'windows phone',
    'mobile'
  ]

  return mobileKeywords.some(keyword => userAgent.includes(keyword))
}

export const detectDevice = (): DeviceLayout => {
  if (hasMobileUserAgent() || detectDeviceByPageWidth() === 'mobile') {
    return 'mobile'
  }

  return 'desktop'
}

/**
 * 跟随窗口尺寸 / 朝向变化返回当前布局，UA 命中手机时固定为移动端。
 */
export const useDevice = (): DeviceLayout => {
  const [device, setDevice] = useState<DeviceLayout>(() => detectDevice())

  useEffect(() => {
    let frameId = 0
    const sync = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        const nextDevice = detectDevice()
        setDevice((current) => (current === nextDevice ? current : nextDevice))
      })
    }

    window.addEventListener('resize', sync)
    window.addEventListener('orientationchange', sync)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', sync)
      window.removeEventListener('orientationchange', sync)
    }
  }, [])

  return device
}
