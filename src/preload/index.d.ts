import type { GodFirstApi } from './index'

declare global {
  interface Window {
    godfirst: GodFirstApi
  }
}

export {}
