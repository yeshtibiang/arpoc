/**
 * 8th Wall XR8 Global Type Definitions
 */

interface XR8Controller {
  configure(options: {
    imageTargetData?: any[]
  }): void
}

interface XR8Instance {
  XrController: XR8Controller
  addCameraPipelineModule(module: any): void
}

interface LandingPageModule {
  pipelineModule(): any
}

declare global {
  interface Window {
    XR8?: XR8Instance
    LandingPage?: LandingPageModule
    ecs?: any
  }
}

declare const XR8: XR8Instance | undefined
declare const LandingPage: LandingPageModule | undefined

export {}
