/**
 * SplashScreen - Loading state while checking auth
 *
 * Shown during initial token validation.
 * Brand-focused, minimal UI.
 */
export function SplashScreen() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center">
      {/* Brand */}
      <h1 className="text-5xl font-display tracking-tight mb-4">LINA</h1>

      {/* Loading spinner */}
      <div className="flex items-center gap-2 text-muted-foreground">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span className="text-sm uppercase tracking-wider">Loading</span>
      </div>
    </div>
  );
}

export default SplashScreen;
