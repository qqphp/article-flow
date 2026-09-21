export function countArticleWords(content: string) {
  return content.replace(/\s+/g, "").length;
}
