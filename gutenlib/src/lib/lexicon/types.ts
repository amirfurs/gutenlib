export type DictionarySource =
  | "لسان العرب"
  | "مقاييس اللغة"
  | "الصحاح في اللغة"
  | "القاموس المحيط"
  | "المعجم الوسيط"
  | string;

export interface DictionaryDefinition {
  source: DictionarySource;
  author: string;
  century: string;
  definition: string;
  citation?: string;
  citationAuthor?: string;
  bookId?: string;
  pageNumber?: number;
  fullText?: string;
}

export interface LexiconEntry {
  word: string;
  root: string;
  vocalized: string;
  partOfSpeech: string;
  wazn?: string;
  definitions: DictionaryDefinition[];
  relatedWords?: string[];
}

export interface LexiconLookupResult {
  found: boolean;
  query: string;
  root?: string;
  entry?: LexiconEntry;
  suggestedRoots?: string[];
  message?: string;
}
