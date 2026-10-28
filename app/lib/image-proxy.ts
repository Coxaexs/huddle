/**
 * Outside images load through our proxy, so posting an image link cannot
 * collect the IP address of everyone who reads the channel. Our own uploads
 * load directly. Kept out of message-body so small, lazily loaded panels can
 * use it without pulling the whole chat renderer in.
 */
export function proxiedImage<T extends string | undefined>(url: T): T | string {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  return `/hangout/api/unfurl/image?url=${encodeURIComponent(url)}`;
}
