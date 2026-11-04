import type { Id } from "../_generated/dataModel";

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function hexToBytes(value: string) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) {
    throw new Error("Stored delivery PIN data is invalid.");
  }
  return new Uint8Array(
    value.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)),
  );
}

function getPinSecret() {
  const secret = process.env.DELIVERY_PIN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "Delivery PIN verification is not configured. Set DELIVERY_PIN_SECRET to a random secret of at least 32 characters.",
    );
  }
  return secret;
}

function secureRandomPin() {
  const values = new Uint16Array(1);
  const limit = Math.floor(65_536 / 10_000) * 10_000;
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= limit);
  return String(values[0] % 10_000).padStart(4, "0");
}

export function generateDeliveryTrackingToken() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashDeliveryTrackingToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export async function createDeliveryPin(orderId: Id<"orders">) {
  const secret = getPinSecret();
  const pin = secureRandomPin();
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const hash = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      hmacKey,
      encoder.encode(`smartdine-delivery-pin:${orderId}:${pin}`),
    ),
  );

  const encryptionKeyBytes = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`smartdine-delivery-pin-encryption:${secret}`),
  );
  const encryptionKey = await crypto.subtle.importKey(
    "raw",
    encryptionKeyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(orderId) },
      encryptionKey,
      encoder.encode(pin),
    ),
  );

  return {
    pin,
    pinHash: bytesToHex(hash),
    pinCiphertext: `${bytesToHex(iv)}:${bytesToHex(ciphertext)}`,
  };
}

export async function matchesDeliveryPin(
  orderId: Id<"orders">,
  pin: string,
  expectedHash: string,
) {
  const secret = getPinSecret();
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const actualHash = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      hmacKey,
      encoder.encode(`smartdine-delivery-pin:${orderId}:${pin}`),
    ),
  );
  const expected = hexToBytes(expectedHash);
  if (actualHash.length !== expected.length) return false;

  let difference = 0;
  for (let index = 0; index < actualHash.length; index += 1) {
    difference |= actualHash[index] ^ expected[index];
  }
  return difference === 0;
}

export async function decryptDeliveryPin(
  ciphertext: string,
  orderId: Id<"orders">,
) {
  const secret = getPinSecret();
  const [ivHex, encryptedHex, unexpected] = ciphertext.split(":");
  if (!ivHex || !encryptedHex || unexpected) {
    throw new Error("Stored delivery PIN data is invalid.");
  }
  const encryptionKeyBytes = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`smartdine-delivery-pin-encryption:${secret}`),
  );
  const encryptionKey = await crypto.subtle.importKey(
    "raw",
    encryptionKeyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: hexToBytes(ivHex),
      additionalData: encoder.encode(orderId),
    },
    encryptionKey,
    hexToBytes(encryptedHex),
  );
  return new TextDecoder().decode(plaintext);
}
