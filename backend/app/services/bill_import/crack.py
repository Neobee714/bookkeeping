"""ZipCrypto 密码恢复。

微信支付账单压缩包是传统 PKZIP 加密（非 AES），密码为 6 位数字；
10^6 的空间用 numpy 向量化后 <1 秒可穷举完。没有 numpy 时退化为纯 Python
实现（只用于测试或极小空间）。
"""

from __future__ import annotations

import time

def _make_table() -> list[int]:
    table: list[int] = []
    for i in range(256):
        c = i
        for _ in range(8):
            c = (0xEDB88320 ^ (c >> 1)) if (c & 1) else (c >> 1)
        table.append(c)
    return table


CRC_TABLE = _make_table()


def keys_init() -> tuple[int, int, int]:
    return 0x12345678, 0x23456789, 0x34567890


def keys_update(k0: int, k1: int, k2: int, byte: int) -> tuple[int, int, int]:
    k0 = ((k0 >> 8) ^ CRC_TABLE[(k0 ^ byte) & 0xFF]) & 0xFFFFFFFF
    k1 = ((k1 + (k0 & 0xFF)) * 134775813 + 1) & 0xFFFFFFFF
    k2 = ((k2 >> 8) ^ CRC_TABLE[(k2 ^ (k1 >> 24)) & 0xFF]) & 0xFFFFFFFF
    return k0, k1, k2


def _keystream_byte(k2: int) -> int:
    t = (k2 | 2) & 0xFFFF
    return ((t * (t ^ 1)) >> 8) & 0xFF


def decrypt_stream(ciphertext: bytes, password: str) -> bytes:
    """解密 ZipCrypto 流；返回去掉 12 字节加密头后的明文。"""
    k0, k1, k2 = keys_init()
    for ch in password.encode("utf-8"):
        k0, k1, k2 = keys_update(k0, k1, k2, ch)
    out = bytearray()
    for byte in ciphertext:
        plain = byte ^ _keystream_byte(k2)
        out.append(plain)
        k0, k1, k2 = keys_update(k0, k1, k2, plain)
    return bytes(out[12:])


def decrypt_prefix(ciphertext: bytes, password: str, length: int) -> bytes:
    """只解前 length 字节（不含 12 字节加密头），用于快速筛候选。"""
    k0, k1, k2 = keys_init()
    for ch in password.encode("utf-8"):
        k0, k1, k2 = keys_update(k0, k1, k2, ch)
    out = bytearray()
    for byte in ciphertext[:length]:
        plain = byte ^ _keystream_byte(k2)
        out.append(plain)
        k0, k1, k2 = keys_update(k0, k1, k2, plain)
    return bytes(out[12:])


def _quick_check(password: str, ciphertext: bytes, compress_type: int) -> bool:
    """检查字节只有 1 字节信息量（约 1/256 误报），再用 deflate 前缀确认。"""
    import zlib

    prefix = decrypt_prefix(ciphertext, password, 512)
    if compress_type != 8:  # ZIP_STORED
        return prefix[:2] == b"PK"
    try:
        head = zlib.decompressobj(-15).decompress(prefix)
    except zlib.error:
        return False
    return head[:2] == b"PK"


def _verify_candidate(
    password: str,
    ciphertext: bytes,
    crc: int,
    uncompressed_size: int,
    compress_type: int,
) -> bool:
    import zlib

    plain = decrypt_stream(ciphertext, password)
    try:
        if compress_type == 8:  # ZIP_DEFLATED
            data = zlib.decompress(plain, -15)
        else:  # ZIP_STORED
            data = plain
    except zlib.error:
        return False
    if len(data) != uncompressed_size:
        return False
    return (zlib.crc32(data) & 0xFFFFFFFF) == crc


def crack_numeric(
    ciphertext: bytes,
    crc: int,
    uncompressed_size: int,
    compress_type: int,
    *,
    length: int = 6,
    checks: tuple[int, ...] = (),
    max_space: int | None = None,
) -> str | None:
    """穷举纯数字密码。

    先用 12 字节头 + 检查字节过滤，命中后再全量校验 CRC。
    返回密码字符串，找不到返回 None。
    """
    space = 10**length
    if max_space is not None:
        space = min(space, max_space)
    if len(ciphertext) < 16:
        return None

    header = ciphertext[:12]
    started = time.monotonic()
    candidates = _scan_numpy(header, space, length, checks)
    if not candidates:  # 没装 numpy，或向量化版本没命中
        candidates = _scan_python(header, space, length, checks)

    for value in candidates:
        password = f"{value:0{length}d}"
        if not _quick_check(password, ciphertext, compress_type):
            continue
        if _verify_candidate(password, ciphertext, crc, uncompressed_size, compress_type):
            if time.monotonic() - started > 30:  # pragma: no cover - 仅防御
                return None
            return password
    return None


def _scan_numpy(
    header: bytes, space: int, length: int, checks: tuple[int, ...]
) -> list[int] | None:
    try:
        import numpy as np
    except ImportError:  # pragma: no cover - 环境缺 numpy 时走纯 Python
        return None

    codes = np.arange(space, dtype=np.uint64)
    table = np.array(CRC_TABLE, dtype=np.uint64)
    mask = np.uint64(0xFFFFFFFF)

    k0 = np.full(space, 0x12345678, dtype=np.uint64)
    k1 = np.full(space, 0x23456789, dtype=np.uint64)
    k2 = np.full(space, 0x34567890, dtype=np.uint64)

    def update(k0, k1, k2, byte):
        k0 = (k0 >> np.uint64(8)) ^ table[(k0 ^ byte) & np.uint64(0xFF)]
        k1 = ((k1 + (k0 & np.uint64(0xFF))) * np.uint64(134775813) + np.uint64(1)) & mask
        k2 = (k2 >> np.uint64(8)) ^ table[(k2 ^ (k1 >> np.uint64(24))) & np.uint64(0xFF)]
        return k0 & mask, k1 & mask, k2 & mask

    for pos in range(length):
        # 密码按「高位在前」逐字符喂入，位数要反过来取
        divisor = np.uint64(10 ** (length - 1 - pos))
        byte = ((codes // divisor) % np.uint64(10) + np.uint64(48)).astype(np.uint64)
        k0, k1, k2 = update(k0, k1, k2, byte)

    plain = np.zeros(space, dtype=np.uint64)
    for index in range(12):
        t = (k2 | np.uint64(2)) & np.uint64(0xFFFF)
        plain = (np.uint64(header[index]) ^ ((t * (t ^ np.uint64(1))) >> np.uint64(8))) & np.uint64(0xFF)
        k0, k1, k2 = update(k0, k1, k2, plain)

    if checks:
        matched = np.zeros(space, dtype=bool)
        for check in checks:
            matched |= plain == np.uint64(check)
        return [int(v) for v in codes[matched]]
    return [int(v) for v in codes[:0]]


def _scan_python(
    header: bytes, space: int, length: int, checks: tuple[int, ...]
) -> list[int]:
    found: list[int] = []
    if not checks:
        return found
    for value in range(space):
        password = f"{value:0{length}d}"
        k0, k1, k2 = keys_init()
        for ch in password.encode("utf-8"):
            k0, k1, k2 = keys_update(k0, k1, k2, ch)
        plain = 0
        for byte in header:
            plain = byte ^ _keystream_byte(k2)
            k0, k1, k2 = keys_update(k0, k1, k2, plain)
        if plain in checks:
            found.append(value)
    return found
