// WFL Engine — низкоуровневый писатель бинарных данных (little-endian)

export class ByteWriter {
  constructor(capacity = 1024) {
    this.buf = new Uint8Array(capacity);
    this.len = 0;
  }

  _ensure(n) {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length * 2 || 1024;
    while (cap < this.len + n) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
  }

  get length() { return this.len; }

  u8(v) { this._ensure(1); this.buf[this.len++] = v & 0xff; return this; }

  u16(v) {
    this._ensure(2);
    this.buf[this.len++] = v & 0xff;
    this.buf[this.len++] = (v >>> 8) & 0xff;
    return this;
  }

  u32(v) {
    this._ensure(4);
    this.buf[this.len++] = v & 0xff;
    this.buf[this.len++] = (v >>> 8) & 0xff;
    this.buf[this.len++] = (v >>> 16) & 0xff;
    this.buf[this.len++] = (v >>> 24) & 0xff;
    return this;
  }

  u32be(v) {
    this._ensure(4);
    this.buf[this.len++] = (v >>> 24) & 0xff;
    this.buf[this.len++] = (v >>> 16) & 0xff;
    this.buf[this.len++] = (v >>> 8) & 0xff;
    this.buf[this.len++] = v & 0xff;
    return this;
  }

  u64(v) {
    const lo = Number(BigInt(v) & 0xffffffffn);
    const hi = Number((BigInt(v) >> 32n) & 0xffffffffn);
    return this.u32(lo).u32(hi);
  }

  bytes(arr) {
    this._ensure(arr.length);
    this.buf.set(arr, this.len);
    this.len += arr.length;
    return this;
  }

  zeros(n) { this._ensure(n); this.len += n; return this; }

  /** UTF-16LE строка фиксированной длины в u16-символах (для имени пакета в arsc) */
  utf16Fixed(str, chars) {
    this._ensure(chars * 2);
    for (let i = 0; i < chars; i++) this.u16(i < str.length ? str.charCodeAt(i) : 0);
    return this;
  }

  uleb128(v) {
    let value = v >>> 0;
    do {
      let b = value & 0x7f;
      value >>>= 7;
      if (value !== 0) b |= 0x80;
      this.u8(b);
    } while (value !== 0);
    return this;
  }

  sleb128(v) {
    let value = v | 0;
    let more = true;
    while (more) {
      let b = value & 0x7f;
      const sign = (b & 0x40) !== 0;
      value >>= 7;
      if ((value === 0 && !sign) || (value === -1 && sign)) more = false;
      else b |= 0x80;
      this.u8(b);
    }
    return this;
  }

  align(n, fill = 0) {
    while (this.len % n !== 0) this.u8(fill);
    return this;
  }

  patchU32(offset, v) {
    this.buf[offset] = v & 0xff;
    this.buf[offset + 1] = (v >>> 8) & 0xff;
    this.buf[offset + 2] = (v >>> 16) & 0xff;
    this.buf[offset + 3] = (v >>> 24) & 0xff;
    return this;
  }

  patchU16(offset, v) {
    this.buf[offset] = v & 0xff;
    this.buf[offset + 1] = (v >>> 8) & 0xff;
    return this;
  }

  toBytes() { return this.buf.slice(0, this.len); }
}

export function concatBytes(list) {
  let total = 0;
  for (const a of list) total += a.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const a of list) { out.set(a, p); p += a.length; }
  return out;
}
