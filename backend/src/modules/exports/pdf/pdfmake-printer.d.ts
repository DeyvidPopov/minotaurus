// Ambient types for pdfmake's server-side printer (no bundled types for the
// deep subpath). Minimal surface: construct with a font dictionary, produce a
// readable PDF document stream.
declare module "pdfmake/src/printer" {
  import type { TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";

  interface PdfKitDoc extends NodeJS.ReadableStream {
    end(): void;
  }

  class PdfPrinter {
    constructor(fonts: TFontDictionary);
    createPdfKitDocument(docDefinition: TDocumentDefinitions, options?: unknown): PdfKitDoc;
  }

  export = PdfPrinter;
}
