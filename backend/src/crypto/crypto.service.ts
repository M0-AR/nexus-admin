import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.ts";
import { TenantDbService } from "../prisma/tenant-db.service.ts";
import type { TenantRef } from "../prisma/tenant-db.service.ts";

/**
 * Pattern #8: BYOK-style envelope encryption.
 *
 * A random 256-bit data-encryption key (DEK) is generated per tenant; the DEK
 * itself is wrapped with the platform master key (KEK from MASTER_KEY) and
 * stored in tenant_keys. Secrets are encrypted with the tenant DEK. Rotating
 * the master key only requires rewrapping DEKs, never re-encrypting data.
 *
 * The sealed format is base64(iv).base64(authTag).base64(ciphertext) using
 * AES-256-GCM. In a cloud deployment the KEK can live in KMS/HSM instead —
 * the interface here is unchanged.
 */

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function seal(plaintext: Buffer, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((b) => b.toString("base64")).join(".");
}

export function open(sealed: string, key: Buffer): Buffer {
  const [ivB64, tagB64, dataB64] = sealed.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed sealed payload");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) throw new Error("Malformed sealed payload");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

@Injectable()
export class CryptoService {
  private readonly masterKey = Buffer.from(env.MASTER_KEY, "hex");

  constructor(private readonly tenantDb: TenantDbService) {}

  /** Loads (or lazily creates) the tenant DEK, unwrapped in memory only. */
  async tenantDek(tenant: TenantRef): Promise<Buffer> {
    const existing = await this.tenantDb.run(tenant, (tx) =>
      tx.tenantKey.findUnique({ where: { tenantId: tenant.id } }),
    );
    if (existing) return open(existing.wrappedDek, this.masterKey);

    const dek = randomBytes(32);
    const wrappedDek = seal(dek, this.masterKey);
    await this.tenantDb.run(tenant, (tx) =>
      tx.tenantKey.create({ data: { tenantId: tenant.id, wrappedDek } }),
    );
    return dek;
  }

  async encryptForTenant(tenant: TenantRef, plaintext: string): Promise<string> {
    const dek = await this.tenantDek(tenant);
    return seal(Buffer.from(plaintext, "utf8"), dek);
  }

  async decryptForTenant(tenant: TenantRef, sealed: string): Promise<string> {
    const dek = await this.tenantDek(tenant);
    return open(sealed, dek).toString("utf8");
  }
}
