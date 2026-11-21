import { useEffect, useState } from 'react';
import type { PlatformMode, ResolvedOS } from '../types/trazik';

export function detectNativeOS(): ResolvedOS {
  if (typeof navigator === 'undefined') return 'ios';
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS desktop UA detection
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return 'ios';
  return 'ios';
}

export function usePlatform(mode: PlatformMode = 'auto') {
  const [detected] = useState<ResolvedOS>(() => detectNativeOS());
  const resolved: ResolvedOS = mode === 'auto' ? detected : mode;

  useEffect(() => {
    document.documentElement.setAttribute('data-os', resolved);
  }, [resolved]);

  return { resolvedOS: resolved, detectedOS: detected };
}
