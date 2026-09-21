import { lookup } from "dns/promises";

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "0", "[::1]"]);

function isPrivateIPv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateIPv6(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80") || host === "::" || host.startsWith("::ffff:127.") || host.startsWith("::ffff:10.") || host.startsWith("::ffff:192.168.");
}

function isIpLiteral(hostname: string) {
  return isPrivateIPv4(hostname) || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
}

export function isDataImageUrl(raw: string) {
  return /^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(raw.trim());
}

export function hostMatchesDomain(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

export async function assertPublicHttpUrl(raw: string, label = "地址") {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label}无效`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(`${label}仅支持 http/https`);
  const host = parsed.hostname.toLowerCase();
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error(`${label}不能指向本地或内网`);
  }
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) throw new Error(`${label}不能指向本地或内网`);
  if (!isIpLiteral(host)) {
    const resolved = await lookup(host).catch(() => null);
    if (!resolved) throw new Error(`${label}无法解析`);
    if (isPrivateIPv4(resolved.address) || isPrivateIPv6(resolved.address)) throw new Error(`${label}不能指向本地或内网`);
  }
  return parsed;
}
