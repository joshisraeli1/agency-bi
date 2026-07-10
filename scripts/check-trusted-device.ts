/**
 * Verifies the trusted-device cookie helpers in src/lib/auth.ts.
 *   npx tsx scripts/check-trusted-device.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import CryptoJS from "crypto-js";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

(async () => {
  const { signTrustedDevice, verifyTrustedDevice, isTrustedDevice } = await import("../src/lib/auth");
  const SECRET = process.env.SESSION_SECRET!;
  const U1 = "user-1", U2 = "user-2";

  // Craft a token with an arbitrary payload + valid signature (to test expiry).
  const craft = (payload: object) => {
    const json = JSON.stringify(payload);
    const sig = CryptoJS.HmacSHA256(json, SECRET).toString();
    return `${Buffer.from(json).toString("base64url")}.${sig}`;
  };

  const valid = signTrustedDevice(U1, 0);
  const vp = verifyTrustedDevice(valid);
  check("valid token verifies", vp !== null && vp.userId === U1 && vp.v === 0);
  check("isTrustedDevice true for matching user+version", isTrustedDevice(valid, { id: U1, trustedDeviceVersion: 0 }));
  check("isTrustedDevice false for wrong user", !isTrustedDevice(valid, { id: U2, trustedDeviceVersion: 0 }));
  check("isTrustedDevice false for stale version", !isTrustedDevice(valid, { id: U1, trustedDeviceVersion: 1 }));

  const tampered = valid.slice(0, -1) + (valid.endsWith("a") ? "b" : "a");
  check("tampered signature rejected", verifyTrustedDevice(tampered) === null);
  check("isTrustedDevice false for tampered", !isTrustedDevice(tampered, { id: U1, trustedDeviceVersion: 0 }));

  const expired = craft({ userId: U1, v: 0, exp: Date.now() - 1000 });
  check("expired token rejected", verifyTrustedDevice(expired) === null);

  check("undefined cookie → false", !isTrustedDevice(undefined, { id: U1, trustedDeviceVersion: 0 }));
  check("garbage cookie → null", verifyTrustedDevice("not-a-token") === null);
  check("wrong-secret signature rejected", verifyTrustedDevice(
    `${Buffer.from(JSON.stringify({ userId: U1, v: 0, exp: Date.now() + 1e6 })).toString("base64url")}.` +
    CryptoJS.HmacSHA256("x", "wrong-secret").toString()
  ) === null);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
