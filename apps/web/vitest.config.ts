import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Pure unit tests — no DOM needed (parseSSELine just parses strings)
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
})
