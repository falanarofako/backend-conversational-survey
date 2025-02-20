// src/services/pdfProcessor.ts

import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

export const processPDFs = async (directory = "./pdfs") => {
  const loader = new DirectoryLoader(directory, {
    ".pdf": (path) => new PDFLoader(path),
  });

  const docs = await loader.load();
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 600,
    chunkOverlap: 200,
  });

  return splitter.splitDocuments(docs);
};