export const CHARACTER_ENGINE_VERSION = "1.0.0" as const

/**
 * Character Engine v1.0 is the stable standalone mechanics boundary.
 * Application, persistence and renderer versions are intentionally independent.
 */
export const CHARACTER_ENGINE_STATUS = "stable" as const

export const CHARACTER_ENGINE_VERSION_INFO = {
  version: CHARACTER_ENGINE_VERSION,
  status: CHARACTER_ENGINE_STATUS,
} as const
