/**
 * linkdesk-api app domain — the read-only main-software product identity surface (E6#57, 06-main-software-updates).
 * Split out of linkdesk-api.ts (E6#57.2a) — the 14th namespace domain interface.
 * Dependency direction: app → none (pure function signatures, zero type dependencies); cross-composed by the aggregator.
 *
 * Exposure boundary (00-README §3②, decided 2026-08-30): read-only, no writes — the version number is third-party readable
 * (consumed by the marketplace minAppVersion validation, E6#30.8c); update write commands (download/restart) are the shell's
 * private affair and not opened up. ProductInfo (the full identity of app:getProductInfo) is not a third-party plugin surface —
 * it is used internally by the main software (About page E6#57.14) and stays out of this contract (see electron/product.ts).
 */
export interface AppAPI {
  /** The app namespace — read-only product identity. The only runtime source of the version number = main-process app.getVersion() (package.json as the single point, 02 §2.3). */
  app: {
    getVersion(): Promise<string>;
  };
}
