/**
 * @linkdesk/marketplace-kit 库入口——CLI 是薄编排壳，全部能力从这里 import（CI / 脚本消费面）。
 */
export type {
  AuthorFile,
  AuthorRepo,
  CatalogEntry,
  CatalogVersion,
  CategoryRailDecl,
  CollectionDecl,
  HeroSlide,
  LicenseKeyPayload,
  MarketplaceFile,
  SectionDecl,
  SectionMore,
  SourceDecl,
} from "./types.js";
export {
  formatPrimaryCategories,
  formatCategoryWhitelist,
  isKnownPrimaryCategory,
  isKnownSubcategory,
  PRIMARY_CATEGORY_SLUGS,
  PRIMARY_CATEGORY_ZH,
  SUBCATEGORY_SLUGS,
} from "./categoryWhitelist.js";
export {
  AUTHORS_SCHEMA_URL,
  MARKETPLACE_SCHEMA_URL,
  formatIssues,
  isAuthorFileName,
  isMarketplaceFileName,
  validateAuthorFile,
  validateMarketplace,
  type ValidateIssue,
  type ValidateResult,
} from "./validate.js";
export { initMarketplace, type InitForm, type InitOptions, type InitResult } from "./init.js";
export { keygen, parseExpSpec, signLicense, type KeygenOptions, type KeygenResult, type SignOptions, type SignResult } from "./license.js";
export {
  MEDIA_MAX_FRAMES,
  formatMediaResolve,
  mediaResolve,
  type MediaKind,
  type MediaResolveResult,
  type ResolvedMedia,
} from "./mediaResolve.js";
export { main } from "./cli.js";
