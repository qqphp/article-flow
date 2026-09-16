import { ProxyAgent, fetch as proxyFetch } from "undici";

let proxyAgent: ProxyAgent | undefined;
let proxyUrl = "";

export function modelFetch(input: string, init?: RequestInit) {
  const configuredProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!configuredProxy) return fetch(input, init);

  if (!proxyAgent || proxyUrl !== configuredProxy) {
    proxyAgent?.close();
    proxyUrl = configuredProxy;
    proxyAgent = new ProxyAgent(configuredProxy);
  }
  const options = { ...init, dispatcher: proxyAgent } as Parameters<typeof proxyFetch>[1];
  return proxyFetch(input, options);
}
