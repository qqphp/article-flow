export function responsesEndpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/(?:chat\/completions|responses)$/, "")}/responses`;
}

export function responseOutputText(response: any) {
  if (typeof response?.output_text === "string") return response.output_text;
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}
