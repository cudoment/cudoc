/**
 * The `cudoc-export/print` entry: the print HTML writer, the options it is
 * given, and the names its files and the bound volume's anchors take. The
 * steps it runs on each page stay in `print.ts`, free to change.
 */

export {
  DEFAULT_VOLUME_NAME,
  PRINT_STYLESHEET,
  VOLUME_FILE,
  fillVolumePageNumbers,
  printFileName,
  printStylesheet,
  resolveVolumeOptions,
  volumeId,
  writePrintOutputs,
  type AssetMark,
  type CopiedAsset,
  type PrintOutputOptions,
  type PrintableDocument,
  type ResolvedVolumeOptions,
  type VolumeOptions,
} from "./print.js"
