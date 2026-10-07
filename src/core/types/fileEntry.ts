/**
 * FileEntry — the sole definition of the filesystem DTO (E5#23).
 * src/ and electron/ both import from the same source—change one place → tsc checks both ends at once.
 * E5.7#45.5: shared/types.ts moved into src/core/types/ (shell directory convention §1: types/ holds cross-module shared pure types).
 */

/** File/directory entry—shared by front and back ends */
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;          // bytes
  modifiedAt?: number;    // Unix timestamp ms
  /** E4V#10: whether the file is read-only (not writable) */
  isReadonly?: boolean;
}
